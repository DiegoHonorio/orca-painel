// Seus commits no período, em todos os repositórios encontrados nas pastas configuradas.
import { execFile } from 'node:child_process'
import { existsSync, readdirSync } from 'node:fs'
import { basename, join } from 'node:path'
import { promisify } from 'node:util'

const exec = promisify(execFile)

// Só leitura: sem travas no repositório, sem hooks e sem fsmonitor (que poderia executar
// um programa configurado no repositório).
const GIT_SEGURO = ['-c', 'core.fsmonitor=false', '-c', 'core.hooksPath=/dev/null', '--no-optional-locks']
const AMBIENTE = { ...process.env, GIT_OPTIONAL_LOCKS: '0', GIT_TERMINAL_PROMPT: '0' }

export type Commit = { repo: string; hash: string; t: number; msg: string; branch: string }

let reposCache: { chave: string; em: number; repos: string[] } | null = null

const IGNORAR = new Set(['node_modules', '.git', 'dist', 'build', '.next', 'vendor', '.venv', 'target'])

function acharRepos(raizes: string[]): string[] {
  const chave = raizes.join('|')
  if (reposCache && reposCache.chave === chave && Date.now() - reposCache.em < 10 * 60_000) return reposCache.repos
  const repos: string[] = []
  const visitar = (pasta: string, nivel: number) => {
    if (existsSync(join(pasta, '.git'))) {
      repos.push(pasta)
      return
    }
    if (nivel >= 3) return
    let itens
    try {
      itens = readdirSync(pasta, { withFileTypes: true })
    } catch {
      return
    }
    for (const item of itens) {
      if (item.isDirectory() && !IGNORAR.has(item.name) && !item.name.startsWith('.')) visitar(join(pasta, item.name), nivel + 1)
    }
  }
  for (const raiz of raizes) visitar(raiz, 0)
  reposCache = { chave, em: Date.now(), repos }
  return repos
}

async function emailsPadrao(): Promise<string[]> {
  try {
    const { stdout } = await exec('git', ['config', '--global', 'user.email'], { env: AMBIENTE })
    return stdout.trim() ? [stdout.trim()] : []
  } catch {
    return []
  }
}

export async function coletarCommits(raizes: string[], emailsConfig: string, inicio: number, fim: number): Promise<Commit[]> {
  const emails = emailsConfig
    .split(',')
    .map((e) => e.trim())
    .filter(Boolean)
  const autores = emails.length ? emails : await emailsPadrao()
  const repos = acharRepos(raizes)
  const vistos = new Set<string>()
  const commits: Commit[] = []
  const filtroAutor = autores.map((a) => `--author=${a}`)
  let i = 0
  const trabalhador = async () => {
    while (i < repos.length) {
      const repo = repos[i++]
      try {
        const { stdout } = await exec(
          'git',
          [
            ...GIT_SEGURO,
            '-C', repo, 'log', '--all', '--source', '--no-merges',
            `--since=@${Math.floor(inicio / 1000)}`, `--until=@${Math.floor(fim / 1000)}`,
            ...filtroAutor,
            '--format=%H%x1f%at%x1f%s%x1f%S'
          ],
          { timeout: 15_000, maxBuffer: 8 * 1024 * 1024, env: AMBIENTE }
        )
        for (const linha of stdout.split('\n')) {
          if (!linha) continue
          const [hash, at, msg, ref] = linha.split('\x1f')
          if (vistos.has(hash)) continue
          vistos.add(hash)
          const t = Number(at) * 1000
          if (t < inicio || t >= fim) continue
          commits.push({ repo: basename(repo), hash: hash.slice(0, 8), t, msg, branch: (ref ?? '').replace(/^refs\/(heads|remotes\/[^/]+)\//, '') })
        }
      } catch {
        // repositório sem commits ou inacessível
      }
    }
  }
  await Promise.all(Array.from({ length: 6 }, trabalhador))
  return commits.sort((a, b) => b.t - a.t)
}
