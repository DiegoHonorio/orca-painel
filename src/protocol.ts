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

export type SistemaMaquina = {
  cpu: { total: number; nucleos: number[] }
  /** Bytes. "apps" é o que os programas ocupam; cache e buffers o sistema libera quando precisa. */
  mem: { total: number; disponivel: number; apps: number; buffers: number; cache: number; livre: number; swapTotal: number; swapUsado: number }
  carga: number[] | null
  ligadoHaS: number
}
export type SistemaProcesso = { nome: string; processos: number; cpu: number; mem: number; agente: boolean }
export type SistemaPorta = { porta: number; programa: string; projeto: string | null; desde: number | null; publica: boolean }
export type SistemaGpu = {
  nome: string
  fabricante: 'nvidia' | 'amd' | 'intel' | 'apple'
  /** % de uso; null quando a GPU não informa (Intel sem root). */
  uso: number | null
  memUsada: number | null
  memTotal: number | null
  temp: number | null
  watts: number | null
  freqMhz: number | null
  freqMaxMhz: number | null
  /** GPU dedicada em repouso: não é consultada para não acordar. */
  dormindo: boolean
  processos: { nome: string; mem: number }[]
}
export type SistemaDisco = { nome: string; total: number; usado: number }
export type SistemaFaixa = {
  rede: { rx: number; tx: number } | null
  bateria: { pct: number; carregando: boolean; cheia: boolean; minutos: number | null } | null
}
export type Sistema = SistemaMaquina & {
  /** null quando o sistema operacional não é suportado. */
  processos: SistemaProcesso[] | null
  gpus: SistemaGpu[] | null
  portas?: SistemaPorta[] | null
  discos?: SistemaDisco[]
  intervaloS: number
}

/** "aberto": há um processo de agente na pasta, mas o Orca ainda não informou o estado. */
export type EstadoChat = 'esperando' | 'trabalhando' | 'concluido' | 'aberto'
export type Chat = { id: string; workspaceId: string; titulo: string | null; estado: EstadoChat; desde: number | null }
export type Chats = {
  /** Só os workspaces com chat; `pasta` é o repositório principal (worktrees somam nele). */
  workspaces: { id: string; nome: string; pasta: string; branch: string | null; tipo: 'worktree' | 'folder' }[]
  chats: Chat[]
  /** Se este Orca sabe abrir um workspace a pedido do plugin. */
  podeAbrir: boolean
  /** Quantas pastas do Orca não têm chat aberto. */
  semChat: number
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
    'sistema.obter': { input: { portas: boolean; discos: boolean }; output: Sistema }
    'sistema.faixa': { output: SistemaFaixa }
    'chats.obter': { output: Chats }
    'chats.abrir': { input: { workspaceId: string }; output: { ok: boolean } }
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
    'chats.mudou': null
  }
}
