// Reads Grok sessions (~/.grok/sessions/<cwd>/<id>/summary.json + usage.json).
// Each turn in usage.json is one slice of tokens. costUsdTicks / 1e10 is USD
// (checked against grok-4.6: uncached input ~$3/M, cache read ~$0.25/M, output ~$15/M).
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { registrarAtividade, type Cache, type RegistroUso, type Sessao } from './leitor.ts'
import { nomeDoProjeto } from './projeto.ts'

const TICKS_POR_DOLAR = 10_000_000_000

type Estado = Record<string, never>

function lerJson(caminho: string): any | null {
  try {
    return JSON.parse(readFileSync(caminho, 'utf8'))
  } catch {
    return null
  }
}

function pastasDeSessao(raiz: string): string[] {
  const saida: string[] = []
  const visitar = (pasta: string, nivel: number) => {
    let itens
    try {
      itens = readdirSync(pasta, { withFileTypes: true })
    } catch {
      return
    }
    if (itens.some((i) => i.isFile() && (i.name === 'summary.json' || i.name === 'usage.json'))) {
      saida.push(pasta)
      return
    }
    if (nivel >= 3) return
    for (const item of itens) {
      if (item.isDirectory() && !item.name.startsWith('.')) visitar(join(pasta, item.name), nivel + 1)
    }
  }
  if (existsSync(raiz)) visitar(raiz, 0)
  return saida
}

function numero(valor: unknown): number {
  const n = Number(valor ?? 0)
  return Number.isFinite(n) ? n : 0
}

export function coletarGrok(pastas: string[]): Cache<Estado> {
  const cache: Cache<Estado> = { versao: 1, arquivos: {} }
  for (const raiz of pastas) {
    for (const pasta of pastasDeSessao(raiz)) {
      const summary = lerJson(join(pasta, 'summary.json'))
      const usage = lerJson(join(pasta, 'usage.json'))
      const info = summary?.info ?? {}
      const id = String(usage?.sessionId ?? info.id ?? pasta)
      const cwd = info.cwd ?? info.git_root_dir
      const projeto = nomeDoProjeto(cwd)
      const titulo = String(summary?.generated_title || summary?.session_summary || '').slice(0, 120)
      const branch = summary?.head_branch && summary.head_branch !== 'HEAD' ? String(summary.head_branch) : ''
      const modelo = String(usage?.session?.primaryModelId ?? summary?.current_model_id ?? 'grok')
      const sessao: Sessao = { id, f: 'grok', titulo, p: projeto, b: branch, ts: [] }
      const usos: RegistroUso[] = []
      const turns = Array.isArray(usage?.turns) ? usage.turns : []
      for (const turno of turns) {
        const t = turno?.endedAt ? Date.parse(turno.endedAt) : NaN
        if (Number.isNaN(t)) continue
        registrarAtividade(sessao, t)
        const entradaBruta = numero(turno.inputTokens)
        const cacheLido = numero(turno.cachedReadTokens)
        usos.push({
          k: `${id}:${turno.turnNumber ?? t}`,
          t,
          f: 'grok',
          p: projeto,
          m: modelo,
          s: id,
          u: [
            Math.max(0, entradaBruta - cacheLido),
            numero(turno.outputTokens),
            numero(turno.cacheCreationTokens),
            0,
            cacheLido
          ],
          custo: numero(turno.costUsdTicks) / TICKS_POR_DOLAR
        })
      }
      if (!sessao.ts.length) {
        const t = summary?.last_active_at ? Date.parse(summary.last_active_at) : NaN
        if (!Number.isNaN(t)) registrarAtividade(sessao, t)
      }
      if (!sessao.ts.length && !usos.length) continue
      cache.arquivos[pasta] = {
        tamanho: 0,
        mtime: 0,
        offset: 0,
        estado: {},
        usos,
        sessoes: { [id]: sessao }
      }
    }
  }
  return cache
}
