// CPU, memória, carga e discos. Usa o módulo os do Node e, no Linux, /proc/meminfo.
import { statfsSync } from 'node:fs'
import { cpus, freemem, homedir, loadavg, totalmem, uptime } from 'node:os'
import { parse } from 'node:path'
import type { SistemaDisco, SistemaMaquina } from '../protocol.ts'
import { LINUX, lerTexto } from './util.ts'

type Amostra = { ocupado: number; total: number }[]

function amostrarCpu(): Amostra {
  return cpus().map(({ times: t }) => {
    const ocupado = t.user + t.nice + t.sys + t.irq
    return { ocupado, total: ocupado + t.idle }
  })
}

let anterior: Amostra | null = null

/** Uso de CPU (%) desde a última leitura; na primeira, mede durante 250 ms. */
async function usoCpu(): Promise<{ total: number; nucleos: number[] }> {
  if (!anterior) {
    anterior = amostrarCpu()
    await new Promise((r) => setTimeout(r, 250))
  }
  const agora = amostrarCpu()
  const nucleos = agora.map((a, i) => {
    const b = anterior?.[i]
    if (!b) return 0
    const total = a.total - b.total
    return total > 0 ? Math.min(100, ((a.ocupado - b.ocupado) / total) * 100) : 0
  })
  anterior = agora
  const total = nucleos.length ? nucleos.reduce((s, n) => s + n, 0) / nucleos.length : 0
  return { total, nucleos }
}

function memoria(): SistemaMaquina['mem'] {
  const total = totalmem()
  const info = LINUX ? lerTexto('/proc/meminfo') : null
  if (!info) {
    const livre = freemem()
    return { total, disponivel: livre, apps: total - livre, buffers: 0, cache: 0, livre, swapTotal: 0, swapUsado: 0 }
  }
  const kb = (chave: string) => Number(info.match(new RegExp(`^${chave}:\\s+(\\d+)`, 'm'))?.[1] ?? 0) * 1024
  const livre = kb('MemFree')
  const buffers = kb('Buffers')
  const cache = kb('Cached') + kb('SReclaimable')
  const disponivel = kb('MemAvailable') || livre + buffers + cache
  return {
    total,
    disponivel,
    apps: Math.max(0, total - livre - buffers - cache),
    buffers,
    cache,
    livre,
    swapTotal: kb('SwapTotal'),
    swapUsado: kb('SwapTotal') - kb('SwapFree')
  }
}

export async function lerMaquina(): Promise<SistemaMaquina> {
  const cpu = await usoCpu()
  return { cpu, mem: memoria(), carga: process.platform === 'win32' ? null : loadavg(), ligadoHaS: uptime() }
}

/** Espaço da raiz e da pasta pessoal (uma só vez quando estão no mesmo disco). */
export function lerDiscos(): SistemaDisco[] {
  const pastas = [parse(homedir()).root || '/', homedir()]
  const vistos = new Set<string>()
  const discos: SistemaDisco[] = []
  for (const pasta of pastas) {
    try {
      const s = statfsSync(pasta)
      const total = s.blocks * s.bsize
      const livre = s.bavail * s.bsize
      const chave = `${s.type}:${s.blocks}:${s.bsize}`
      if (!total || vistos.has(chave)) continue
      vistos.add(chave)
      discos.push({ nome: pasta === homedir() ? '~' : pasta, total, usado: total - livre })
    } catch {
      // pasta inacessível: ignora
    }
  }
  return discos
}
