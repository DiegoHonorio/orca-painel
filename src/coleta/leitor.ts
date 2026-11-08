// Leitura incremental de arquivos .jsonl que só crescem (transcrições do Claude Code e do Codex).
// Guarda até onde cada arquivo já foi lido; na próxima vez lê só o que foi acrescentado.
import { chmodSync, closeSync, existsSync, mkdirSync, openSync, readdirSync, readFileSync, readSync, statSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'

/** Um evento de uso de tokens. u = [entrada, saída, escritaCache5m, escritaCache1h, leituraCache]. */
export type RegistroUso = {
  k: string // chave para não contar duas vezes
  t: number // horário (ms)
  f: 'claude' | 'codex'
  p: string // projeto
  m: string // modelo
  s: string // sessão
  u: [number, number, number, number, number]
}

/** Uma sessão de trabalho: título, projeto, branch e os horários em que houve atividade. */
export type Sessao = {
  id: string
  f: 'claude' | 'codex'
  titulo: string
  p: string
  b: string
  ts: number[]
}

export type EstadoArquivo<E> = {
  tamanho: number
  mtime: number
  offset: number
  estado: E
  usos: RegistroUso[]
  sessoes: Record<string, Sessao>
}

export type Cache<E> = { versao: number; arquivos: Record<string, EstadoArquivo<E>> }

const PASTA_CACHE = join(homedir(), '.cache', 'orca-painel')

export function carregarCache<E>(nome: string, versao: number): Cache<E> {
  try {
    const dado = JSON.parse(readFileSync(join(PASTA_CACHE, nome), 'utf8')) as Cache<E>
    if (dado.versao === versao && dado.arquivos) return dado
  } catch {
    // sem cache ainda
  }
  return { versao, arquivos: {} }
}

export function salvarCache<E>(nome: string, cache: Cache<E>): void {
  const destino = join(PASTA_CACHE, nome)
  // só o próprio usuário lê: o cache guarda títulos das sessões
  mkdirSync(dirname(destino), { recursive: true, mode: 0o700 })
  writeFileSync(destino, JSON.stringify(cache), { mode: 0o600 })
  chmodSync(destino, 0o600) // arquivos criados por versões antigas também
}

export function listarJsonl(raiz: string, limite = 20000): string[] {
  const saida: string[] = []
  if (!existsSync(raiz)) return saida
  const pilha = [raiz]
  while (pilha.length && saida.length < limite) {
    const pasta = pilha.pop()!
    let itens
    try {
      itens = readdirSync(pasta, { withFileTypes: true })
    } catch {
      continue
    }
    for (const item of itens) {
      const caminho = join(pasta, item.name)
      if (item.isDirectory()) pilha.push(caminho)
      else if (item.isFile() && item.name.endsWith('.jsonl')) saida.push(caminho)
    }
  }
  return saida
}

/**
 * Atualiza o cache de um arquivo. `processar` recebe cada linha nova (já em JSON) e o estado do
 * arquivo. Retorna true quando algo mudou.
 */
export function atualizarArquivo<E>(
  cache: Cache<E>,
  caminho: string,
  estadoInicial: () => E,
  processar: (linha: any, arq: EstadoArquivo<E>, offsetLinha: number) => void
): boolean {
  let info
  try {
    info = statSync(caminho)
  } catch {
    return false
  }
  let arq = cache.arquivos[caminho]
  if (arq && arq.tamanho === info.size && arq.mtime === info.mtimeMs) return false
  if (!arq || info.size < arq.offset) {
    // arquivo novo ou reescrito: lê do zero
    arq = { tamanho: 0, mtime: 0, offset: 0, estado: estadoInicial(), usos: [], sessoes: {} }
    cache.arquivos[caminho] = arq
  }
  const tamanhoNovo = info.size - arq.offset
  if (tamanhoNovo > 0) {
    const buffer = Buffer.alloc(tamanhoNovo)
    const fd = openSync(caminho, 'r')
    try {
      readSync(fd, buffer, 0, tamanhoNovo, arq.offset)
    } finally {
      closeSync(fd)
    }
    // só até a última quebra de linha: a linha final pode estar sendo escrita agora
    const ultimaQuebra = buffer.lastIndexOf(10)
    if (ultimaQuebra >= 0) {
      let inicio = 0
      while (inicio <= ultimaQuebra) {
        const fim = buffer.indexOf(10, inicio)
        const texto = buffer.toString('utf8', inicio, fim)
        if (texto.trim()) {
          try {
            processar(JSON.parse(texto), arq, arq.offset + inicio)
          } catch {
            // linha inválida: ignora
          }
        }
        inicio = fim + 1
      }
      arq.offset += ultimaQuebra + 1
    }
  }
  arq.tamanho = info.size
  arq.mtime = info.mtimeMs
  return true
}

export function registrarAtividade(sessao: Sessao, t: number): void {
  const ultimo = sessao.ts[sessao.ts.length - 1]
  // guarda no máximo um ponto a cada 30 s: basta para medir tempo ativo
  if (ultimo === undefined || t - ultimo >= 30_000 || t < ultimo) sessao.ts.push(t)
}
