// Portas TCP em escuta abertas por programas do próprio usuário (servidores de desenvolvimento).
// Linux: /proc/net/tcp{,6} e /proc/<pid>/fd. macOS: `lsof`. Windows: indisponível por enquanto.
import { readdirSync, readlinkSync, statSync } from 'node:fs'
import { basename } from 'node:path'
import type { SistemaPorta } from '../protocol.ts'
import { nomeDoProjeto } from '../coleta/projeto.ts'
import { LINUX, MAC, camposStat, executar, lerTexto, listarPids, momentoBoot, ticksPorSegundo } from './util.ts'

type Escuta = { porta: number; inode: string; publica: boolean }

function escutasLinux(): Escuta[] {
  const escutas: Escuta[] = []
  for (const arq of ['/proc/net/tcp', '/proc/net/tcp6']) {
    const txt = lerTexto(arq)
    if (!txt) continue
    for (const linha of txt.split('\n').slice(1)) {
      const c = linha.trim().split(/\s+/)
      if (c[3] !== '0A') continue // LISTEN
      const [ip, portaHex] = (c[1] ?? '').split(':')
      // 127.0.0.1 / ::1 só aceitam conexões desta máquina; o resto fica visível na rede
      const local = /^(0100007F|00000000000000000000000001000000)$/i.test(ip ?? '') || /^..00007F$/i.test(ip ?? '')
      escutas.push({ porta: parseInt(portaHex ?? '0', 16), inode: c[9] ?? '', publica: !local })
    }
  }
  return escutas
}

// inode do socket -> pid, para não varrer os descritores de todos os processos a cada leitura
let donos = new Map<string, number>()
const uid = process.getuid?.() ?? -1

function mapearDonos(inodes: Set<string>) {
  const faltando = [...inodes].filter((i) => {
    const pid = donos.get(i)
    return pid === undefined || !lerTexto(`/proc/${pid}/stat`)
  })
  if (!faltando.length) return
  const novos = new Map<string, number>()
  for (const pid of listarPids()) {
    try {
      if (statSync(`/proc/${pid}`).uid !== uid) continue
      for (const fd of readdirSync(`/proc/${pid}/fd`)) {
        let alvo: string
        try {
          alvo = readlinkSync(`/proc/${pid}/fd/${fd}`)
        } catch {
          continue
        }
        const inode = alvo.startsWith('socket:[') ? alvo.slice(8, -1) : null
        if (inode && inodes.has(inode)) novos.set(inode, pid)
      }
    } catch {
      // processo terminou ou é de outro usuário
    }
  }
  donos = novos
}

function linux(): SistemaPorta[] {
  const escutas = escutasLinux()
  mapearDonos(new Set(escutas.map((e) => e.inode)))
  const porPorta = new Map<number, SistemaPorta>()
  for (const e of escutas) {
    const pid = donos.get(e.inode)
    if (pid === undefined) continue // de outro usuário ou do sistema
    const st = camposStat(pid)
    if (!st) continue
    const existente = porPorta.get(e.porta)
    if (existente) {
      existente.publica ||= e.publica
      continue
    }
    let cwd: string | null = null
    try {
      cwd = readlinkSync(`/proc/${pid}/cwd`)
    } catch {
      // sem acesso
    }
    const projeto = cwd ? nomeDoProjeto(cwd) : null
    const desde = momentoBoot() + (Number(st.campos[19]) / ticksPorSegundo()) * 1000 // starttime (22)
    porPorta.set(e.porta, { porta: e.porta, programa: st.nome, projeto: projeto === '~' ? null : projeto, desde, publica: e.publica })
  }
  return [...porPorta.values()]
}

async function mac(): Promise<SistemaPorta[]> {
  const saida = await executar('lsof', ['-nP', '-iTCP', '-sTCP:LISTEN', '-a', '-u', String(uid), '-Fcn'])
  if (!saida) return []
  const porPorta = new Map<number, SistemaPorta>()
  let programa = ''
  for (const linha of saida.split('\n')) {
    if (linha.startsWith('c')) programa = basename(linha.slice(1))
    else if (linha.startsWith('n')) {
      const m = linha.match(/^n(.*):(\d+)$/)
      if (!m) continue
      const porta = Number(m[2])
      const publica = !/^(127\.|\[::1\]|localhost)/.test(m[1] ?? '')
      const existente = porPorta.get(porta)
      if (existente) existente.publica ||= publica
      else porPorta.set(porta, { porta, programa, projeto: null, desde: null, publica })
    }
  }
  return [...porPorta.values()]
}

/** Portas em escuta do usuário, em ordem crescente. null quando o sistema não é suportado. */
export async function lerPortas(): Promise<SistemaPorta[] | null> {
  const lista = LINUX ? linux() : MAC ? await mac() : null
  return lista ? lista.sort((a, b) => a.porta - b.porta).slice(0, 20) : null
}
