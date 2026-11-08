// Textos do worker (barra de status e notificações) nos mesmos idiomas do painel.

export type Idioma = 'pt-BR' | 'en' | 'es' | 'zh-CN'

type Textos = {
  pomodoro: string
  foco: string
  pausa: string
  pausaLonga: string
  pausado: string
  min: (n: number) => string
  tooltipParado: string
  tooltipRotulo: (r: string) => string
  focoConcluido: string
  pausaDe: (n: number) => string
  pausaLongaDe: (n: number) => string
  pausaAcabou: string
  voltarAoFoco: string
}

const TEXTOS: Record<Idioma, Textos> = {
  'pt-BR': {
    pomodoro: 'Pomodoro', foco: 'Foco', pausa: 'Pausa', pausaLonga: 'Pausa longa', pausado: 'pausado',
    min: (n) => `${n} min`, tooltipParado: 'Pomodoro: clique para iniciar ou pausar', tooltipRotulo: (r) => `Pomodoro: ${r}`,
    focoConcluido: 'Foco concluído 🍅', pausaDe: (n) => `Pausa de ${n} min.`, pausaLongaDe: (n) => `Pausa longa de ${n} min.`,
    pausaAcabou: 'A pausa acabou', voltarAoFoco: 'Hora de voltar ao foco.'
  },
  en: {
    pomodoro: 'Pomodoro', foco: 'Focus', pausa: 'Break', pausaLonga: 'Long break', pausado: 'paused',
    min: (n) => `${n} min`, tooltipParado: 'Pomodoro: click to start or pause', tooltipRotulo: (r) => `Pomodoro: ${r}`,
    focoConcluido: 'Focus done 🍅', pausaDe: (n) => `${n}-minute break.`, pausaLongaDe: (n) => `${n}-minute long break.`,
    pausaAcabou: 'Break is over', voltarAoFoco: 'Time to get back to focus.'
  },
  es: {
    pomodoro: 'Pomodoro', foco: 'Foco', pausa: 'Descanso', pausaLonga: 'Descanso largo', pausado: 'en pausa',
    min: (n) => `${n} min`, tooltipParado: 'Pomodoro: haz clic para iniciar o pausar', tooltipRotulo: (r) => `Pomodoro: ${r}`,
    focoConcluido: 'Foco terminado 🍅', pausaDe: (n) => `Descanso de ${n} min.`, pausaLongaDe: (n) => `Descanso largo de ${n} min.`,
    pausaAcabou: 'Terminó el descanso', voltarAoFoco: 'Hora de volver a enfocarte.'
  },
  'zh-CN': {
    pomodoro: '番茄钟', foco: '专注', pausa: '休息', pausaLonga: '长休息', pausado: '已暂停',
    min: (n) => `${n} 分钟`, tooltipParado: '番茄钟：点击开始或暂停', tooltipRotulo: (r) => `番茄钟：${r}`,
    focoConcluido: '专注完成 🍅', pausaDe: (n) => `休息 ${n} 分钟。`, pausaLongaDe: (n) => `长休息 ${n} 分钟。`,
    pausaAcabou: '休息结束', voltarAoFoco: '该回来专注了。'
  }
}

/** Converte uma tag (pt, pt-PT, en-US, zh-Hans, auto…) num idioma suportado, ou null. */
export function resolverIdioma(tag: unknown): Idioma | null {
  const t = String(tag ?? '').toLowerCase()
  if (t.startsWith('pt')) return 'pt-BR'
  if (t.startsWith('es')) return 'es'
  if (t.startsWith('zh')) return 'zh-CN'
  if (t.startsWith('en')) return 'en'
  return null
}

/** Idioma do sistema, para quando o painel ainda não informou o do Orca. */
export function idiomaDoSistema(): Idioma {
  const env = process.env.LC_ALL || process.env.LC_MESSAGES || process.env.LANG || Intl.DateTimeFormat().resolvedOptions().locale
  return resolverIdioma(env) ?? 'en'
}

export function textos(idioma: Idioma): Textos {
  return TEXTOS[idioma] ?? TEXTOS.en
}
