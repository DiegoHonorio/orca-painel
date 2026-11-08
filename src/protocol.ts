// Contrato entre o painel (panel/painel.js) e o worker (src/worker.ts).

export type TipoPeriodo = 'dia' | 'semana' | 'mes'

export type Pomodoro = { inicio: number; fim: number; minutos: number; rotulo: string; completo: boolean }

export type Tarefa = { id: string; texto: string; feita: boolean; criadaEm: number; feitaEm: number | null }

export type EstadoPomodoro = {
  fase: 'parado' | 'foco' | 'pausa'
  rodando: boolean
  /** Quando a fase acaba (ms), se estiver rodando. */
  fimEm: number | null
  /** Quanto falta (ms), se estiver pausado. */
  restanteMs: number | null
  duracaoMs: number
  inicioFase: number | null
  rotulo: string
  /** Focos completos desde a última pausa longa. */
  ciclos: number
  pausaLonga: boolean
}

export type Relatorio = {
  periodo: { tipo: TipoPeriodo; rotulo: string; inicio: number; fim: number }
  geradoEm: number
  totais: {
    tokens: number
    tokensDetalhe: { entrada: number; saida: number; escritaCache: number; leituraCache: number }
    custo: number
    tokensSemPreco: number
    minutosAtivos: number
    sessoes: number
    commits: number
    focoMin: number
    pomodoros: number
    tarefasConcluidas: number
  }
  anterior: { rotulo: string; tokens: number; custo: number; minutosAtivos: number }
  serie: { inicio: number; rotulo: string; tokens: number; custo: number; minutosAtivos: number; focoMin: number; commits: number }[]
  /** Barra (hora ou dia) que contém o momento atual, ou -1 se o período já passou. */
  indiceAtual: number
  /** Tempo ativo e custo por projeto em cada barra: os 4 principais e "outros". */
  pilhas: { projetos: string[]; minutos: number[][]; custo: number[][] }
  projetos: { nome: string; tokens: number; custo: number; minutosAtivos: number; sessoes: number; commits: number }[]
  modelos: { nome: string; ferramenta: string; tokens: number; custo: number | null }[]
  sessoes: {
    id: string
    ferramenta: string
    titulo: string
    projeto: string
    branch: string
    inicio: number
    fim: number
    minutos: number
    tokens: number
    custo: number
  }[]
  commits: { repo: string; hash: string; t: number; msg: string; branch: string }[]
  tarefasConcluidas: { texto: string; feitaEm: number }[]
}

declare module 'orca' {
  interface PluginRequests {
    'relatorio.obter': { input: { tipo: TipoPeriodo; deslocamento: number }; output: Relatorio }
    'pomodoro.obter': { output: EstadoPomodoro }
    'pomodoro.acao': {
      input: { acao: 'iniciar' | 'pausar' | 'continuar' | 'parar' | 'pular'; rotulo?: string }
      output: EstadoPomodoro
    }
    'idioma.sincronizar': { input: { idiomaOrca: string }; output: { idioma: string } }
    'tarefas.obter': { output: Tarefa[] }
    'tarefas.alterar': {
      input: { acao: 'adicionar' | 'alternar' | 'remover' | 'editar' | 'limparFeitas'; id?: string; texto?: string }
      output: Tarefa[]
    }
  }
  interface PluginPanelEvents {
    'pomodoro.mudou': EstadoPomodoro
    'tarefas.mudou': Tarefa[]
    'idioma.mudou': { idioma: string }
  }
}
