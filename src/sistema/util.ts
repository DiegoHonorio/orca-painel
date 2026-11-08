// Leituras locais e somente-leitura usadas pela aba Sistema. Nada aqui grava, envia ou altera nada.
import { execFile } from 'node:child_process'
import { readFileSync, readdirSync } from 'node:fs'

export const LINUX = process.platform === 'linux'
export const MAC = process.platform === 'darwin'

/** Lê um arquivo de texto pequeno; null se não existir ou não puder ler. */
export function lerTexto(caminho: string): string | null {
  try {
    return readFileSync(caminho, 'utf8')
  } catch {
    return null
  }
}

/** PIDs em /proc (Linux). */
export function listarPids(): number[] {
  try {
    return readdirSync('/proc').filter((n) => /^\d+$/.test(n)).map(Number)
  } catch {
    return []
  }
}

/** Roda um programa do sistema sem shell, com tempo limite; devolve a saída ou null. */
export function executar(programa: string, args: string[], timeoutMs = 2000): Promise<string | null> {
  return new Promise((ok) => {
    execFile(programa, args, { timeout: timeoutMs, maxBuffer: 4 * 1024 * 1024, windowsHide: true, env: { ...process.env, LC_ALL: 'C' } }, (erro, saida) =>
      ok(erro ? null : String(saida))
    )
  })
}

/** Campos de /proc/<pid>/stat depois do nome (que pode ter espaços e parênteses). */
export function camposStat(pid: number): { nome: string; campos: string[] } | null {
  const txt = lerTexto(`/proc/${pid}/stat`)
  if (!txt) return null
  const a = txt.indexOf('(')
  const b = txt.lastIndexOf(')')
  if (a < 0 || b < a) return null
  // campos[0] é o estado (campo 3 do man proc); campo N fica em campos[N - 3]
  return { nome: txt.slice(a + 1, b), campos: txt.slice(b + 2).split(' ') }
}

let ticks: number | null = null
/** Ticks de relógio por segundo (CLK_TCK), quase sempre 100 no Linux. */
export function ticksPorSegundo(): number {
  return (ticks ??= 100)
}

let pagina: number | null = null
/** Tamanho da página de memória, para converter RSS em bytes. */
export async function tamanhoPagina(): Promise<number> {
  if (pagina) return pagina
  const saida = await executar('getconf', ['PAGESIZE'])
  pagina = Number(saida?.trim()) || 4096
  return pagina
}

let boot: number | null = null
/** Momento do boot (ms), de /proc/stat. */
export function momentoBoot(): number {
  if (boot !== null) return boot
  const btime = lerTexto('/proc/stat')?.match(/^btime (\d+)/m)?.[1]
  boot = btime ? Number(btime) * 1000 : Date.now() - process.uptime() * 1000
  return boot
}
