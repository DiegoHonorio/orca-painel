// Programas que mais usam CPU e memória, somando os processos de mesmo nome (como o htop em árvore).
// Linux: lê /proc/<pid>/stat. macOS: um `ps` por leitura. Windows: indisponível por enquanto.
import { cpus } from 'node:os'
import { basename } from 'node:path'
import type { SistemaProcesso } from '../protocol.ts'
import { LINUX, MAC, camposStat, executar, lerTexto, listarPids, tamanhoPagina, ticksPorSegundo } from './util.ts'

/** Agentes de IA de terminal que ganham um bloco próprio. */
const AGENTES = /^(claude|codex|opencode|gemini|aider|cursor-agent|goose|amp|qwen|copilot)$/i

// o nome em /proc/<pid>/stat é cortado em 15 caracteres ("Isolated Web Co"); aí vale o executável
const nomesLongos = new Map<number, string>()
function nomeReal(pid: number, nome: string): string {
  if (nome.length < 15) return nome
  let real = nomesLongos.get(pid)
  if (real === undefined) {
    const argv0 = lerTexto(`/proc/${pid}/cmdline`)?.split('\0')[0] ?? ''
    real = basename(argv0.split(' ')[0] ?? '') || nome
    nomesLongos.set(pid, real)
  }
  return real
}

let ticksAnteriores = new Map<number, number>()
let momentoAnterior = 0

function agrupar(lista: { nome: string; cpu: number; mem: number }[]): SistemaProcesso[] {
  const grupos = new Map<string, SistemaProcesso>()
  for (const p of lista) {
    const g = grupos.get(p.nome) ?? { nome: p.nome, processos: 0, cpu: 0, mem: 0, agente: AGENTES.test(p.nome) }
    g.processos++
    g.cpu += p.cpu
    g.mem += p.mem
    grupos.set(p.nome, g)
  }
  return [...grupos.values()]
}

async function linux(): Promise<SistemaProcesso[]> {
  const pagina = await tamanhoPagina()
  const hz = ticksPorSegundo()
  const nucleos = cpus().length || 1
  const agora = Date.now()
  const segundos = momentoAnterior ? (agora - momentoAnterior) / 1000 : 0
  const novos = new Map<number, number>()
  const lista: { nome: string; cpu: number; mem: number }[] = []
  for (const pid of listarPids()) {
    const st = camposStat(pid)
    if (!st) continue
    // utime (14) + stime (15); rss (24) em páginas
    const ticks = Number(st.campos[11]) + Number(st.campos[12])
    const rss = Number(st.campos[21]) * pagina
    if (!rss) continue // threads do kernel
    novos.set(pid, ticks)
    const antes = ticksAnteriores.get(pid)
    const cpu = segundos > 0 && antes !== undefined ? ((ticks - antes) / hz / segundos / nucleos) * 100 : 0
    lista.push({ nome: nomeReal(pid, st.nome), cpu: Math.max(0, cpu), mem: rss })
  }
  ticksAnteriores = novos
  for (const pid of nomesLongos.keys()) if (!novos.has(pid)) nomesLongos.delete(pid)
  momentoAnterior = agora
  return agrupar(lista)
}

async function mac(): Promise<SistemaProcesso[]> {
  const saida = await executar('ps', ['-axo', 'pcpu=,rss=,comm='])
  if (!saida) return []
  const nucleos = cpus().length || 1
  const lista = saida
    .split('\n')
    .map((l) => l.trim().match(/^([\d.]+)\s+(\d+)\s+(.+)$/))
    .filter((m): m is RegExpMatchArray => !!m)
    .map((m) => ({ nome: basename(m[3]), cpu: Number(m[1]) / nucleos, mem: Number(m[2]) * 1024 }))
  return agrupar(lista)
}

/** Grupos de processos, já somados, ordenados por CPU. null quando o sistema não é suportado. */
export async function lerProcessos(): Promise<SistemaProcesso[] | null> {
  const grupos = LINUX ? await linux() : MAC ? await mac() : null
  if (!grupos) return null
  grupos.sort((a, b) => b.cpu - a.cpu || b.mem - a.mem)
  // manda os 8 de mais CPU, os 8 de mais memória e os agentes; o painel escolhe a ordem
  const porMem = [...grupos].sort((a, b) => b.mem - a.mem).slice(0, 8)
  const escolhidos = new Set([...grupos.slice(0, 8), ...porMem, ...grupos.filter((g) => g.agente)])
  return [...escolhidos]
}
