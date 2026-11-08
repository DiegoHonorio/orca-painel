// Worker do Painel de Trabalho. Fica rodando enquanto o plugin está ligado (por causa do item
// na barra de status): coleta os dados, responde ao painel e controla o pomodoro.
import type { OrcaWorkerApi } from 'orca/worker'
import { coletarClaude } from './coleta/claude.ts'
import { coletarCodex } from './coleta/codex.ts'
import { coletarCommits } from './coleta/git.ts'
import type { RegistroUso, Sessao } from './coleta/leitor.ts'
import { listaDePastas } from './coleta/projeto.ts'
import { calcularPeriodo, montarRelatorio } from './relatorio.ts'
import type { EstadoPomodoro, Pomodoro, Tarefa, TipoPeriodo } from './protocol.ts'

type Config = {
  focoMinutos: number
  pausaMinutos: number
  pausaLongaMinutos: number
  ciclosAtePausaLonga: number
  pastasClaude: string
  pastasCodex: string
  pastasRepos: string
  emailsGit: string
}

const PADRAO: Config = {
  focoMinutos: 25,
  pausaMinutos: 5,
  pausaLongaMinutos: 15,
  ciclosAtePausaLonga: 4,
  pastasClaude: '~/.claude',
  pastasCodex: '~/.codex',
  pastasRepos: '~/dev',
  emailsGit: ''
}

const POMODORO_PARADO: EstadoPomodoro = {
  fase: 'parado',
  rodando: false,
  fimEm: null,
  restanteMs: null,
  duracaoMs: 0,
  inicioFase: null,
  rotulo: '',
  ciclos: 0,
  pausaLonga: false
}

let relogio: ReturnType<typeof setInterval> | null = null

export default function activate(orca: OrcaWorkerApi): void {
  let pomodoro: EstadoPomodoro = { ...POMODORO_PARADO }
  let textoBarra = ''

  const config = async (): Promise<Config> => {
    try {
      const { settings } = await orca.host.call('settings.get')
      return { ...PADRAO, ...(settings as Partial<Config>) }
    } catch {
      return PADRAO
    }
  }

  const ler = async <T>(chave: string, padrao: T): Promise<T> => {
    const valor = await orca.storage.get(chave)
    return (valor ?? padrao) as T
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const gravar = (chave: string, valor: unknown) => orca.storage.set(chave, valor as any)

  const avisar = (title: string, body?: string) =>
    orca.host.call('notifications.show', body ? { title, body } : { title }).catch(() => undefined)

  // ---------- Pomodoro ----------

  const restante = (p: EstadoPomodoro) =>
    p.rodando && p.fimEm ? Math.max(0, p.fimEm - Date.now()) : (p.restanteMs ?? 0)

  const atualizarBarra = async () => {
    let texto = 'Pomodoro'
    let icon: 'play' | 'pause' | 'zap' = 'play'
    let tone: 'neutral' | 'accent' | 'success' | 'warning' = 'neutral'
    if (pomodoro.fase !== 'parado') {
      const min = Math.ceil(restante(pomodoro) / 60_000)
      const nome = pomodoro.fase === 'foco' ? 'Foco' : pomodoro.pausaLonga ? 'Pausa longa' : 'Pausa'
      texto = `${nome} · ${min} min${pomodoro.rodando ? '' : ' (pausado)'}`
      icon = pomodoro.rodando ? 'pause' : 'play'
      tone = pomodoro.fase === 'foco' ? 'accent' : 'success'
      if (!pomodoro.rodando) tone = 'warning'
    }
    if (texto === textoBarra) return
    textoBarra = texto
    await orca.host
      .call('statusBar.update', {
        id: 'pomodoro',
        text: texto,
        icon,
        tone,
        tooltip: pomodoro.rotulo ? `Pomodoro: ${pomodoro.rotulo}` : 'Pomodoro: clique para iniciar ou pausar'
      })
      .catch(() => undefined)
  }

  const publicar = async () => {
    await gravar('pomodoroEstado', pomodoro)
    orca.panels.post('pomodoro.mudou', pomodoro)
    await atualizarBarra()
  }

  const registrarFoco = async (completo: boolean) => {
    if (pomodoro.fase !== 'foco' || !pomodoro.inicioFase) return
    const feitoMs = pomodoro.duracaoMs - restante(pomodoro)
    const minutos = Math.round(feitoMs / 60_000)
    if (minutos < 1) return
    const lista = await ler<Pomodoro[]>('pomodoros', [])
    lista.push({ inicio: pomodoro.inicioFase, fim: Date.now(), minutos, rotulo: pomodoro.rotulo, completo })
    await gravar('pomodoros', lista)
  }

  const iniciarFase = async (fase: 'foco' | 'pausa', pausaLonga = false) => {
    const c = await config()
    const minutos = fase === 'foco' ? c.focoMinutos : pausaLonga ? c.pausaLongaMinutos : c.pausaMinutos
    const duracaoMs = minutos * 60_000
    pomodoro = {
      ...pomodoro,
      fase,
      rodando: true,
      duracaoMs,
      fimEm: Date.now() + duracaoMs,
      restanteMs: null,
      inicioFase: Date.now(),
      pausaLonga
    }
  }

  const acao = async (tipo: 'iniciar' | 'pausar' | 'continuar' | 'parar' | 'pular', rotulo?: string) => {
    if (rotulo !== undefined) pomodoro.rotulo = rotulo.slice(0, 120)
    if (tipo === 'iniciar') await iniciarFase('foco')
    else if (tipo === 'pausar' && pomodoro.rodando) {
      pomodoro = { ...pomodoro, rodando: false, restanteMs: restante(pomodoro), fimEm: null }
    } else if (tipo === 'continuar' && !pomodoro.rodando && pomodoro.fase !== 'parado') {
      pomodoro = { ...pomodoro, rodando: true, fimEm: Date.now() + (pomodoro.restanteMs ?? 0), restanteMs: null }
    } else if (tipo === 'parar') {
      await registrarFoco(false)
      pomodoro = { ...POMODORO_PARADO, rotulo: pomodoro.rotulo, ciclos: pomodoro.ciclos }
    } else if (tipo === 'pular') {
      await terminarFase(false)
      return pomodoro
    }
    await publicar()
    return pomodoro
  }

  const terminarFase = async (natural: boolean) => {
    if (pomodoro.fase === 'foco') {
      await registrarFoco(natural)
      const c = await config()
      const ciclos = pomodoro.ciclos + (natural ? 1 : 0)
      const longa = ciclos >= c.ciclosAtePausaLonga
      pomodoro.ciclos = longa ? 0 : ciclos
      await iniciarFase('pausa', longa)
      if (natural) void avisar('Foco concluído 🍅', longa ? `Pausa longa de ${c.pausaLongaMinutos} min.` : `Pausa de ${c.pausaMinutos} min.`)
    } else if (pomodoro.fase === 'pausa') {
      pomodoro = { ...POMODORO_PARADO, rotulo: pomodoro.rotulo, ciclos: pomodoro.ciclos }
      if (natural) void avisar('Pausa acabou', 'Hora de voltar ao foco.')
    }
    await publicar()
  }

  relogio = setInterval(() => {
    if (pomodoro.rodando && pomodoro.fimEm && Date.now() >= pomodoro.fimEm) void terminarFase(true)
    else void atualizarBarra()
  }, 1000)

  void (async () => {
    const salvo = await ler<EstadoPomodoro | null>('pomodoroEstado', null)
    if (salvo && salvo.fase) pomodoro = salvo
    await atualizarBarra()
  })()

  orca.commands.register('pomodoro.alternar', async () => {
    if (pomodoro.fase === 'parado') await acao('iniciar')
    else await acao(pomodoro.rodando ? 'pausar' : 'continuar')
  })
  orca.commands.register('pomodoro.parar', async () => {
    await acao('parar')
  })

  orca.panels.handle('pomodoro.obter', async () => pomodoro)
  orca.panels.handle('pomodoro.acao', async ({ acao: tipo, rotulo }) => acao(tipo, rotulo))

  // ---------- Tarefas ----------

  orca.panels.handle('tarefas.obter', async () => ler<Tarefa[]>('tarefas', []))
  orca.panels.handle('tarefas.alterar', async ({ acao: tipo, id, texto }) => {
    let lista = await ler<Tarefa[]>('tarefas', [])
    if (tipo === 'adicionar' && texto?.trim()) {
      lista.unshift({ id: `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`, texto: texto.trim().slice(0, 300), feita: false, criadaEm: Date.now(), feitaEm: null })
    } else if (tipo === 'alternar') {
      lista = lista.map((t) => (t.id === id ? { ...t, feita: !t.feita, feitaEm: t.feita ? null : Date.now() } : t))
    } else if (tipo === 'editar' && texto?.trim()) {
      lista = lista.map((t) => (t.id === id ? { ...t, texto: texto.trim().slice(0, 300) } : t))
    } else if (tipo === 'remover') {
      lista = lista.filter((t) => t.id !== id)
    } else if (tipo === 'limparFeitas') {
      // tarefas feitas saem da lista, mas continuam contando no histórico
      const historico = await ler<Tarefa[]>('tarefasArquivadas', [])
      await gravar('tarefasArquivadas', [...historico, ...lista.filter((t) => t.feita)])
      lista = lista.filter((t) => !t.feita)
    }
    await gravar('tarefas', lista)
    orca.panels.post('tarefas.mudou', lista)
    return lista
  })

  // ---------- Relatório ----------

  let coletaEmAndamento: Promise<{ usos: RegistroUso[]; sessoes: Sessao[] }> | null = null
  const coletar = (c: Config) => {
    if (!coletaEmAndamento) {
      coletaEmAndamento = (async () => {
        const caches = [coletarClaude(listaDePastas(c.pastasClaude, PADRAO.pastasClaude)), coletarCodex(listaDePastas(c.pastasCodex, PADRAO.pastasCodex))]
        const vistos = new Set<string>()
        const usos: RegistroUso[] = []
        const sessoes = new Map<string, Sessao>()
        for (const cache of caches) {
          for (const arq of Object.values(cache.arquivos)) {
            for (const r of arq.usos) {
              if (vistos.has(r.k)) continue
              vistos.add(r.k)
              usos.push(r)
            }
            for (const s of Object.values(arq.sessoes)) {
              const existente = sessoes.get(s.id)
              if (!existente) sessoes.set(s.id, { ...s, ts: [...s.ts] })
              else {
                // a mesma sessão pode estar em vários arquivos (subagentes, retomadas)
                existente.ts.push(...s.ts)
                if (!existente.titulo) existente.titulo = s.titulo
                if (!existente.b) existente.b = s.b
              }
            }
          }
        }
        return { usos, sessoes: [...sessoes.values()] }
      })().finally(() => {
        coletaEmAndamento = null
      })
    }
    return coletaEmAndamento
  }

  orca.panels.handle('relatorio.obter', async ({ tipo, deslocamento }) => {
    const c = await config()
    const periodo = calcularPeriodo(tipo as TipoPeriodo, Math.min(0, Math.round(deslocamento)))
    const anterior = calcularPeriodo(tipo as TipoPeriodo, Math.min(0, Math.round(deslocamento)) - 1)
    const [{ usos, sessoes }, commits, pomodoros, tarefas, arquivadas] = await Promise.all([
      coletar(c),
      coletarCommits(listaDePastas(c.pastasRepos, PADRAO.pastasRepos), c.emailsGit, periodo.inicio, periodo.fim),
      ler<Pomodoro[]>('pomodoros', []),
      ler<Tarefa[]>('tarefas', []),
      ler<Tarefa[]>('tarefasArquivadas', [])
    ])
    return montarRelatorio({ periodo, usos, sessoes, commits, pomodoros, tarefas: [...tarefas, ...arquivadas], anterior: { usos, sessoes, periodo: anterior } })
  })

  // aquece o cache em segundo plano para o primeiro relatório abrir rápido
  setTimeout(() => void config().then(coletar).catch((e) => orca.log(`coleta falhou: ${e}`)), 2000)

}

export function deactivate(): void {
  if (relogio) clearInterval(relogio)
}
