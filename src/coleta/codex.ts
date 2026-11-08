// Lê as sessões do Codex (<pasta>/sessions/**/*.jsonl e archived_sessions). Cada evento
// token_count traz o uso daquela chamada em info.last_token_usage; input_tokens já inclui o
// que veio do cache (cached_input_tokens).
import { join } from 'node:path'
import { atualizarArquivo, carregarCache, listarJsonl, registrarAtividade, salvarCache, type Cache } from './leitor.ts'
import { nomeDoProjeto } from './projeto.ts'

type Estado = { sessao: string; modelo: string; projeto: string }
const ARQUIVO_CACHE = 'codex-v1.json'
let cache: Cache<Estado> | null = null

function textoUsuario(payload: any): string {
  const blocos = Array.isArray(payload?.content) ? payload.content : []
  for (const b of blocos) {
    if ((b?.type === 'input_text' || b?.type === 'text') && typeof b.text === 'string') return b.text
  }
  return typeof payload?.message === 'string' ? payload.message : ''
}

export function coletarCodex(pastas: string[]): Cache<Estado> {
  if (!cache) cache = carregarCache<Estado>(ARQUIVO_CACHE, 1)
  let mudou = false
  for (const pasta of pastas) {
    const arquivos = [...listarJsonl(join(pasta, 'sessions')), ...listarJsonl(join(pasta, 'archived_sessions'))]
    for (const caminho of arquivos) {
      mudou =
        atualizarArquivo(
          cache,
          caminho,
          () => ({ sessao: caminho, modelo: 'codex', projeto: '(sem pasta)' }),
          (linha, arq, offsetLinha) => {
            const p = linha.payload ?? {}
            const est = arq.estado
            if (linha.type === 'session_meta') {
              est.sessao = String(p.id ?? est.sessao)
              if (p.cwd) est.projeto = nomeDoProjeto(p.cwd)
            } else if (linha.type === 'turn_context') {
              if (p.model) est.modelo = String(p.model)
              if (p.cwd) est.projeto = nomeDoProjeto(p.cwd)
            }
            const t = linha.timestamp ? Date.parse(linha.timestamp) : NaN
            if (Number.isNaN(t)) return
            let sessao = arq.sessoes[est.sessao]
            if (!sessao) {
              sessao = { id: est.sessao, f: 'codex', titulo: '', p: est.projeto, b: '', ts: [] }
              arq.sessoes[est.sessao] = sessao
            }
            if (est.projeto !== '(sem pasta)') sessao.p = est.projeto
            if (linha.type === 'session_meta' && p.git?.branch) sessao.b = String(p.git.branch)

            const ehPedido =
              (linha.type === 'event_msg' && p.type === 'user_message') ||
              (linha.type === 'response_item' && p.type === 'message' && p.role === 'user')
            if (ehPedido) {
              const pedido = textoUsuario(p).trim()
              if (pedido && !pedido.startsWith('<')) {
                registrarAtividade(sessao, t)
                if (!sessao.titulo) sessao.titulo = pedido.slice(0, 120)
              }
              return
            }
            if (linha.type === 'event_msg' && p.type === 'token_count') {
              const uso = p.info?.last_token_usage
              if (!uso) return
              registrarAtividade(sessao, t)
              const cacheado = Number(uso.cached_input_tokens ?? 0)
              arq.usos.push({
                k: `${caminho}:${offsetLinha}`,
                t,
                f: 'codex',
                p: est.projeto,
                m: est.modelo,
                s: est.sessao,
                u: [Math.max(0, Number(uso.input_tokens ?? 0) - cacheado), Number(uso.output_tokens ?? 0), 0, 0, cacheado]
              })
            }
          }
        ) || mudou
    }
  }
  if (mudou) salvarCache(ARQUIVO_CACHE, cache)
  return cache
}
