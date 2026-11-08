// Descobre o nome do projeto (repositório) de uma pasta: sobe até achar o .git e, quando é um
// worktree (o .git é um arquivo), usa o repositório principal. Assim o trabalho de vários
// worktrees do Orca soma no mesmo projeto.
import { existsSync, readFileSync, statSync } from 'node:fs'
import { homedir } from 'node:os'
import { basename, dirname, join, resolve } from 'node:path'

const cache = new Map<string, string>()

export function expandirHome(caminho: string): string {
  const limpo = caminho.trim()
  if (limpo === '~') return homedir()
  if (limpo.startsWith('~/')) return join(homedir(), limpo.slice(2))
  return limpo
}

export function listaDePastas(valor: unknown, padrao: string): string[] {
  const texto = typeof valor === 'string' && valor.trim() ? valor : padrao
  return texto
    .split(',')
    .map((p) => expandirHome(p))
    .filter(Boolean)
}

function raizDoRepo(pasta: string): string | null {
  let atual = resolve(pasta)
  for (let i = 0; i < 40; i++) {
    const git = join(atual, '.git')
    if (existsSync(git)) {
      try {
        if (statSync(git).isFile()) {
          // "gitdir: /caminho/repo/.git/worktrees/nome"
          const alvo = readFileSync(git, 'utf8').match(/gitdir:\s*(.+)/)?.[1]?.trim()
          const marcador = alvo?.split(/[\\/]\.git[\\/]/)[0]
          if (marcador) return marcador
        }
      } catch {
        // segue com a pasta atual
      }
      return atual
    }
    const pai = dirname(atual)
    if (pai === atual) return null
    atual = pai
  }
  return null
}

export function nomeDoProjeto(cwd: string | undefined | null): string {
  if (!cwd) return '(sem pasta)'
  const salvo = cache.get(cwd)
  if (salvo) return salvo
  let nome: string
  if (resolve(cwd) === homedir()) nome = '~'
  else {
    const raiz = raizDoRepo(cwd)
    nome = basename(raiz ?? cwd) || cwd
  }
  cache.set(cwd, nome)
  return nome
}
