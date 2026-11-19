// Reads OpenCode's sqlite (~/.local/share/opencode/opencode.db, table session_v2).
// Uses the sqlite3 binary so this works in Orca's plugin Node, which may not
// have node:sqlite. The query never selects message text.
//
// Skips providers that shell out to a CLI the panel already counts. claude-agent
// is the Claude login inside OpenCode: the same work is already in the Claude Code transcripts.
// A provider named codex or codex-agent would be the same kind of duplicate.
// openai/gpt-*-codex stays: those tokens live only in this database, not in ~/.codex.
import { execFileSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { registrarAtividade, type Cache, type RegistroUso, type Sessao } from './leitor.ts'
import { nomeDoProjeto } from './projeto.ts'

type Estado = Record<string, never>

type Linha = {
  id: string
  directory: string | null
  title: string | null
  slug: string | null
  model: string | null
  time_created: number | null
  time_updated: number | null
  tokens_input: number | null
  tokens_output: number | null
  tokens_reasoning: number | null
  tokens_cache_read: number | null
  tokens_cache_write: number | null
  cost: number | null
}

function modeloDe(bruto: string | null): { provedor: string; id: string } {
  if (!bruto) return { provedor: '', id: '' }
  try {
    const m = JSON.parse(bruto)
    return { provedor: String(m.providerID ?? ''), id: String(m.id ?? m.modelID ?? '') }
  } catch {
    const [provedor, id] = bruto.split('/')
    return { provedor: provedor ?? '', id: id || bruto }
  }
}

function bancos(pastas: string[]): string[] {
  const saida: string[] = []
  for (const pasta of pastas) {
    if (pasta.endsWith('.db') && existsSync(pasta)) saida.push(pasta)
    else if (existsSync(join(pasta, 'opencode.db'))) saida.push(join(pasta, 'opencode.db'))
  }
  return saida
}

function numero(valor: unknown): number {
  const n = Number(valor ?? 0)
  return Number.isFinite(n) ? n : 0
}

function consultar<T>(banco: string, sql: string): T[] {
  const saida = execFileSync('sqlite3', ['-readonly', '-json', banco, sql], {
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
    timeout: 20_000
  }).trim()
  if (!saida) return []
  return JSON.parse(saida) as T[]
}

export function coletarOpenCode(pastas: string[], ignorarProvedores: string[]): Cache<Estado> {
  const cache: Cache<Estado> = { versao: 1, arquivos: {} }
  const ignorar = new Set(ignorarProvedores.map((p) => p.trim().toLowerCase()).filter(Boolean))
  for (const banco of bancos(pastas)) {
    try {
      const linhas = consultar<Linha>(
        banco,
        `select id, directory, title, slug, model, time_created, time_updated,
                tokens_input, tokens_output, tokens_reasoning, tokens_cache_read, tokens_cache_write, cost
         from session_v2`
      )
      const tempos = new Map<string, number[]>()
      try {
        for (const row of consultar<{ session_id: string; time_created: number }>(
          banco,
          'select session_id, time_created from session_message'
        )) {
          const lista = tempos.get(row.session_id) ?? []
          lista.push(numero(row.time_created))
          tempos.set(row.session_id, lista)
        }
      } catch {
        // Older databases have no session_message. Activity then uses time_updated.
      }
      const usos: RegistroUso[] = []
      const sessoes: Record<string, Sessao> = {}
      for (const linha of linhas) {
        const modelo = modeloDe(linha.model)
        if (ignorar.has(modelo.provedor.toLowerCase())) continue
        const projeto = nomeDoProjeto(linha.directory)
        const titulo = String(linha.title || linha.slug || '').slice(0, 120)
        const nomeModelo = modelo.provedor && modelo.id ? `${modelo.provedor}/${modelo.id}` : modelo.id || 'opencode'
        const sessao: Sessao = { id: linha.id, f: 'opencode', titulo, p: projeto, b: '', ts: [] }
        for (const t of tempos.get(linha.id) ?? []) {
          if (t > 0) registrarAtividade(sessao, t)
        }
        const fim = numero(linha.time_updated) || numero(linha.time_created)
        if (!sessao.ts.length && fim > 0) registrarAtividade(sessao, fim)
        const entrada = numero(linha.tokens_input)
        const saida = numero(linha.tokens_output) + numero(linha.tokens_reasoning)
        const escrita = numero(linha.tokens_cache_write)
        const leitura = numero(linha.tokens_cache_read)
        const custo = numero(linha.cost)
        if (entrada + saida + escrita + leitura > 0 && fim > 0) {
          const registro: RegistroUso = {
            k: linha.id,
            t: fim,
            f: 'opencode',
            p: projeto,
            m: nomeModelo,
            s: linha.id,
            u: [entrada, saida, escrita, 0, leitura]
          }
          if (custo > 0) registro.custo = custo
          usos.push(registro)
        }
        if (sessao.ts.length || usos.some((u) => u.s === linha.id)) sessoes[linha.id] = sessao
      }
      cache.arquivos[banco] = { tamanho: 0, mtime: 0, offset: 0, estado: {}, usos, sessoes }
    } catch {
      // sqlite missing, locked, or unreadable: the rest of the report still loads
    }
  }
  return cache
}
