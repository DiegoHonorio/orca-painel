// Lê as transcrições do Claude Code (<pasta>/projects/**/*.jsonl): uso de tokens por mensagem,
// título das sessões (ai-title ou o primeiro pedido digitado) e horários de atividade.
import { join } from 'node:path'
import { atualizarArquivo, carregarCache, listarJsonl, registrarAtividade, salvarCache, type Cache, type Sessao } from './leitor.ts'
import { nomeDoProjeto } from './projeto.ts'

type Estado = Record<string, never>
const ARQUIVO_CACHE = 'claude-v1.json'
let cache: Cache<Estado> | null = null

function texto(conteudo: unknown): string {
  if (typeof conteudo === 'string') return conteudo
  if (Array.isArray(conteudo)) {
    for (const bloco of conteudo) {
      if (bloco && bloco.type === 'text' && typeof bloco.text === 'string') return bloco.text
    }
  }
  return ''
}

function pedidoHumano(linha: any): string | null {
  if (linha.isSidechain || linha.isMeta) return null
  const origem = linha.origin?.kind ?? linha.turnOrigin
  if (origem && origem !== 'human') return null
  const conteudo = texto(linha.message?.content).trim()
  if (!conteudo || conteudo.startsWith('<')) return null
  return conteudo
}

function sessaoDe(arq: { sessoes: Record<string, Sessao> }, linha: any): Sessao | null {
  const id = linha.sessionId ?? linha.session_id
  if (!id) return null
  let sessao = arq.sessoes[id]
  if (!sessao) {
    sessao = { id, f: 'claude', titulo: '', p: nomeDoProjeto(linha.cwd), b: '', ts: [] }
    arq.sessoes[id] = sessao
  }
  if (linha.cwd && sessao.p === '(sem pasta)') sessao.p = nomeDoProjeto(linha.cwd)
  if (linha.gitBranch && linha.gitBranch !== 'HEAD') sessao.b = linha.gitBranch
  return sessao
}

export function coletarClaude(pastas: string[]): Cache<Estado> {
  if (!cache) cache = carregarCache<Estado>(ARQUIVO_CACHE, 1)
  let mudou = false
  for (const pasta of pastas) {
    for (const caminho of listarJsonl(join(pasta, 'projects'))) {
      mudou =
        atualizarArquivo(cache, caminho, () => ({}), (linha, arq) => {
          const t = linha.timestamp ? Date.parse(linha.timestamp) : NaN
          const sessao = sessaoDe(arq, linha)
          if (linha.type === 'ai-title' && sessao && linha.aiTitle) {
            sessao.titulo = String(linha.aiTitle)
            return
          }
          if (Number.isNaN(t) || !sessao) return
          if (linha.type === 'user') {
            const pedido = pedidoHumano(linha)
            if (pedido) {
              registrarAtividade(sessao, t)
              if (!sessao.titulo) sessao.titulo = pedido.slice(0, 120)
            }
            return
          }
          if (linha.type !== 'assistant') return
          const msg = linha.message
          const uso = msg?.usage
          registrarAtividade(sessao, t)
          if (!uso || !msg.model || msg.model === '<synthetic>') return
          const criacao = uso.cache_creation ?? {}
          const escrita1h = Number(criacao.ephemeral_1h_input_tokens ?? 0)
          const escritaTotal = Number(uso.cache_creation_input_tokens ?? 0)
          arq.usos.push({
            k: `${msg.id ?? ''}:${linha.requestId ?? linha.uuid ?? ''}`,
            t,
            f: 'claude',
            p: nomeDoProjeto(linha.cwd),
            m: String(msg.model),
            s: sessao.id,
            u: [
              Number(uso.input_tokens ?? 0),
              Number(uso.output_tokens ?? 0),
              Math.max(0, escritaTotal - escrita1h),
              escrita1h,
              Number(uso.cache_read_input_tokens ?? 0)
            ]
          })
        }) || mudou
    }
  }
  // Arquivos apagados continuam no cache de propósito: o Claude Code limpa transcrições antigas,
  // e assim o histórico do painel não some.
  if (mudou) salvarCache(ARQUIVO_CACHE, cache)
  return cache
}
