// Chats abertos: os agentes que estão em terminais do Orca, agrupados pela pasta (repositório).
// O estado vem dos eventos `agent.status.changed` do Orca; a pasta, de `workspace.list`. No Linux,
// os processos de agente (e o cwd de cada um) confirmam quais chats seguem abertos e mostram os
// que o worker ainda não ouviu desde que ligou.
import { readlinkSync } from 'node:fs'
import { sep } from 'node:path'
import type { OrcaWorkerApi, PluginEvents } from 'orca/worker'
import { nomeDoProjeto } from './coleta/projeto.ts'
import type { Chat, Chats, EstadoChat } from './protocol.ts'
import { LINUX, camposStat, listarPids } from './sistema/util.ts'

type Agente = { workspaceId: string; terminalId: string | null; titulo: string | null; estado: EstadoChat; desde: number; visto: number }
type Workspace = { id: string; kind: 'worktree' | 'folder'; name: string; path: string; branch: string | null }

const AGENTES = /^(claude|codex|opencode|gemini|aider|cursor-agent|goose|amp|qwen|copilot)$/i
const CHAVE = 'chatsAgentes'
/** Um chat recém-ouvido não é removido por falta de processo (o agente pode estar subindo). */
const CARENCIA_MS = 90_000

function estadoDe(s: 'working' | 'blocked' | 'waiting' | 'done'): EstadoChat {
  return s === 'working' ? 'trabalhando' : s === 'done' ? 'concluido' : 'esperando'
}

/** cwd de cada processo de agente em execução (Linux); null quando não dá para saber. */
function pastasComAgente(): string[] | null {
  if (!LINUX) return null
  const pastas: string[] = []
  for (const pid of listarPids()) {
    const st = camposStat(pid)
    if (!st || !AGENTES.test(st.nome)) continue
    try {
      pastas.push(readlinkSync(`/proc/${pid}/cwd`))
    } catch {
      // processo de outro usuário ou que acabou de sair
    }
  }
  return pastas
}

const dentro = (pasta: string, raiz: string) => pasta === raiz || pasta.startsWith(raiz.endsWith(sep) ? raiz : raiz + sep)

export function iniciarChats(orca: OrcaWorkerApi, opcoes: { avisar: (titulo: string, corpo?: string) => void; querAviso: () => Promise<boolean>; textos: () => { esperando: string; chatSemTitulo: string } }) {
  const agentes = new Map<string, Agente>()
  let workspaces: Workspace[] = []
  let lidoEm = 0
  let gravarTimer: ReturnType<typeof setTimeout> | null = null

  const gravar = () => {
    if (gravarTimer) return
    gravarTimer = setTimeout(() => {
      gravarTimer = null
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      void orca.storage.set(CHAVE, Object.fromEntries(agentes) as any).catch(() => undefined)
    }, 2000)
  }

  const avisarPanel = () => orca.panels.post('chats.mudou', null)

  void (async () => {
    const salvo = (await orca.storage.get(CHAVE).catch(() => null)) as Record<string, Agente> | null
    if (salvo) for (const [k, a] of Object.entries(salvo)) if (!agentes.has(k)) agentes.set(k, a)
  })()

  const lerWorkspaces = async (): Promise<Workspace[]> => {
    if (Date.now() - lidoEm < 10_000) return workspaces
    try {
      const r = await orca.host.call('workspace.list')
      workspaces = r.workspaces.filter((w) => !w.hostId)
      lidoEm = Date.now()
    } catch (e) {
      orca.log(`workspace.list falhou: ${e}`)
    }
    return workspaces
  }

  orca.events.on('agent.status.changed', async (p: PluginEvents['agent.status.changed']) => {
    if (!p.workspaceId) return
    const bruto = p.mainAgent?.state ?? p.state
    const estado = estadoDe(bruto)
    const antes = agentes.get(p.paneKey)
    const agente: Agente = {
      workspaceId: p.workspaceId,
      terminalId: p.terminalId ?? antes?.terminalId ?? null,
      titulo: p.title || antes?.titulo || null,
      estado,
      desde: antes?.estado === estado ? antes.desde : (p.mainAgent?.stateStartedAt ?? p.receivedAt ?? Date.now()),
      visto: Date.now()
    }
    agentes.set(p.paneKey, agente)
    gravar()
    avisarPanel()
    if (estado === 'esperando' && antes && antes.estado === 'trabalhando' && (await opcoes.querAviso())) {
      const ws = (await lerWorkspaces()).find((w) => w.id === p.workspaceId)
      const tx = opcoes.textos()
      opcoes.avisar(`${tx.esperando}: ${ws ? nomeDoProjeto(ws.path) : ''}`.trim(), agente.titulo ?? tx.chatSemTitulo)
    }
  })

  orca.events.on('workspace.removed', ({ workspaceId }) => {
    for (const [k, a] of agentes) if (a.workspaceId === workspaceId) agentes.delete(k)
    lidoEm = 0
    gravar()
    avisarPanel()
  })

  orca.events.on('workspace.created', () => {
    lidoEm = 0
  })

  const obter = async (): Promise<Chats> => {
    const lista = await lerWorkspaces()
    const porId = new Map(lista.map((w) => [w.id, w]))
    const pastas = pastasComAgente()
    const agora = Date.now()
    // apaga os chats cujo workspace sumiu ou que não têm mais processo de agente na pasta
    for (const [k, a] of agentes) {
      const ws = porId.get(a.workspaceId)
      const semProcesso = pastas && ws && agora - a.visto > CARENCIA_MS && !pastas.some((p) => dentro(p, ws.path))
      if ((lista.length && !ws) || semProcesso) {
        agentes.delete(k)
        gravar()
      }
    }
    const chats: Chat[] = []
    const usados = new Map<string, number>()
    for (const [k, a] of agentes) {
      const ws = porId.get(a.workspaceId)
      if (!ws) continue
      usados.set(ws.id, (usados.get(ws.id) ?? 0) + 1)
      chats.push({ id: k, workspaceId: ws.id, titulo: a.titulo, estado: a.estado, desde: a.desde })
    }
    // processos de agente em pastas de onde o worker ainda não ouviu nenhum evento
    if (pastas) {
      const ordem = [...lista].sort((a, b) => b.path.length - a.path.length)
      const sobra = new Map<string, number>()
      for (const p of pastas) {
        const ws = ordem.find((w) => dentro(p, w.path))
        if (ws) sobra.set(ws.id, (sobra.get(ws.id) ?? 0) + 1)
      }
      for (const [id, n] of sobra) {
        if (usados.has(id)) continue
        for (let i = 0; i < n; i++) chats.push({ id: `proc:${id}:${i}`, workspaceId: id, titulo: null, estado: 'aberto', desde: null })
      }
    }
    const ids = new Set(chats.map((c) => c.workspaceId))
    const pastaDe = (w: Workspace) => (w.kind === 'folder' ? w.name : nomeDoProjeto(w.path))
    const comChat = lista.filter((w) => ids.has(w.id))
    const todasPastas = new Set(lista.map(pastaDe))
    return {
      workspaces: comChat.map((w) => ({ id: w.id, nome: w.name, pasta: pastaDe(w), branch: w.branch, tipo: w.kind })),
      chats,
      podeAbrir: orca.host.has('workspace.open'),
      semChat: todasPastas.size - new Set(comChat.map(pastaDe)).size
    }
  }

  orca.panels.handle('chats.obter', obter)
  orca.panels.handle('chats.abrir', async ({ workspaceId }) => {
    await orca.host.call('workspace.open', { workspaceId })
    return { ok: true }
  })
}
