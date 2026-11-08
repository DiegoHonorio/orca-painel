// Monta o relatório de um período (dia, semana ou mês) a partir dos dados coletados.
import type { Commit } from './coleta/git.ts'
import type { RegistroUso, Sessao } from './coleta/leitor.ts'
import { custoEstimado } from './coleta/precos.ts'
import type { Pomodoro, Relatorio, Tarefa, TipoPeriodo } from './protocol.ts'

const LACUNA_MAX = 10 * 60_000 // pausa maior que isso não conta como tempo ativo
const DIAS = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb']
const MESES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez']

export type Periodo = { tipo: TipoPeriodo; inicio: number; fim: number; rotulo: string; baldes: { inicio: number; rotulo: string }[] }

function inicioDoDia(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate())
}

export function calcularPeriodo(tipo: TipoPeriodo, deslocamento: number, agora = new Date()): Periodo {
  const hoje = inicioDoDia(agora)
  if (tipo === 'dia') {
    const ini = new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate() + deslocamento)
    const fim = new Date(ini.getFullYear(), ini.getMonth(), ini.getDate() + 1)
    const rotulo =
      deslocamento === 0 ? 'Hoje' : deslocamento === -1 ? 'Ontem' : `${DIAS[ini.getDay()]}, ${ini.getDate()} ${MESES[ini.getMonth()]}`
    const baldes = Array.from({ length: 24 }, (_, h) => ({
      inicio: new Date(ini.getFullYear(), ini.getMonth(), ini.getDate(), h).getTime(),
      rotulo: `${h}h`
    }))
    return { tipo, inicio: ini.getTime(), fim: fim.getTime(), rotulo, baldes }
  }
  if (tipo === 'semana') {
    const diaSemana = (hoje.getDay() + 6) % 7 // segunda = 0
    const ini = new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate() - diaSemana + 7 * deslocamento)
    const fim = new Date(ini.getFullYear(), ini.getMonth(), ini.getDate() + 7)
    const ultimo = new Date(fim.getTime() - 1)
    const rotulo =
      deslocamento === 0
        ? 'Esta semana'
        : `${ini.getDate()} ${MESES[ini.getMonth()]} – ${ultimo.getDate()} ${MESES[ultimo.getMonth()]}`
    const baldes = Array.from({ length: 7 }, (_, i) => {
      const d = new Date(ini.getFullYear(), ini.getMonth(), ini.getDate() + i)
      return { inicio: d.getTime(), rotulo: `${DIAS[d.getDay()]} ${d.getDate()}` }
    })
    return { tipo, inicio: ini.getTime(), fim: fim.getTime(), rotulo, baldes }
  }
  const ini = new Date(hoje.getFullYear(), hoje.getMonth() + deslocamento, 1)
  const fim = new Date(ini.getFullYear(), ini.getMonth() + 1, 1)
  const nomeMes = `${MESES[ini.getMonth()]} ${ini.getFullYear()}`
  const rotulo = deslocamento === 0 ? `Este mês (${nomeMes})` : nomeMes
  const dias = Math.round((fim.getTime() - ini.getTime()) / 86_400_000)
  const baldes = Array.from({ length: dias }, (_, i) => {
    const d = new Date(ini.getFullYear(), ini.getMonth(), i + 1)
    return { inicio: d.getTime(), rotulo: String(i + 1) }
  })
  return { tipo, inicio: ini.getTime(), fim: fim.getTime(), rotulo, baldes }
}

/** Minutos ativos: soma os intervalos entre atividades próximas (até 10 min) + 1 min por bloco. */
export function minutosAtivos(horarios: number[]): number {
  if (!horarios.length) return 0
  const ts = [...horarios].sort((a, b) => a - b)
  let total = 0
  let blocos = 1
  for (let i = 1; i < ts.length; i++) {
    const lacuna = ts[i] - ts[i - 1]
    if (lacuna <= LACUNA_MAX) total += lacuna
    else blocos++
  }
  return Math.round(total / 60_000 + blocos)
}

function indiceBalde(baldes: { inicio: number }[], t: number): number {
  let i = baldes.length - 1
  while (i > 0 && baldes[i].inicio > t) i--
  return i
}

type Entrada = {
  periodo: Periodo
  usos: RegistroUso[]
  sessoes: Sessao[]
  commits: Commit[]
  pomodoros: Pomodoro[]
  tarefas: Tarefa[]
  anterior: { usos: RegistroUso[]; sessoes: Sessao[]; periodo: Periodo }
}

function somaTokens(u: RegistroUso['u']): number {
  return u[0] + u[1] + u[2] + u[3] + u[4]
}

function totaisSimples(usos: RegistroUso[], sessoes: Sessao[], p: Periodo) {
  let tokens = 0
  let custo = 0
  for (const r of usos) {
    if (r.t < p.inicio || r.t >= p.fim) continue
    tokens += somaTokens(r.u)
    custo += custoDe(r) ?? 0
  }
  const ts = sessoes.flatMap((s) => s.ts.filter((t) => t >= p.inicio && t < p.fim))
  return { tokens, custo, minutosAtivos: minutosAtivos(ts) }
}

function custoDe(r: RegistroUso): number | null {
  return custoEstimado(r.m, { entrada: r.u[0], saida: r.u[1], escritaCache5m: r.u[2], escritaCache1h: r.u[3], leituraCache: r.u[4] })
}

export function montarRelatorio(e: Entrada): Relatorio {
  const { periodo: p } = e
  const dentro = (t: number) => t >= p.inicio && t < p.fim
  const serie = p.baldes.map((b) => ({ rotulo: b.rotulo, tokens: 0, custo: 0, minutosAtivos: 0, focoMin: 0, commits: 0 }))
  const projetos = new Map<string, { nome: string; tokens: number; custo: number; ts: number[]; sessoes: Set<string>; commits: number }>()
  const modelos = new Map<string, { nome: string; ferramenta: string; tokens: number; custo: number | null }>()
  const porSessao = new Map<string, { tokens: number; custo: number }>()
  const tokens = { entrada: 0, saida: 0, escritaCache: 0, leituraCache: 0 }
  let custoTotal = 0
  let semPreco = 0
  // por projeto e por balde, para as barras empilhadas
  const custoPB = new Map<string, number[]>()
  const tsPB = new Map<string, number[][]>()
  const linhaPB = <T>(mapa: Map<string, T[]>, nome: string, vazio: () => T) => {
    let linha = mapa.get(nome)
    if (!linha) {
      linha = p.baldes.map(vazio)
      mapa.set(nome, linha)
    }
    return linha
  }

  const projeto = (nome: string) => {
    let pr = projetos.get(nome)
    if (!pr) {
      pr = { nome, tokens: 0, custo: 0, ts: [], sessoes: new Set(), commits: 0 }
      projetos.set(nome, pr)
    }
    return pr
  }

  for (const r of e.usos) {
    if (!dentro(r.t)) continue
    const total = somaTokens(r.u)
    const custo = custoDe(r)
    tokens.entrada += r.u[0]
    tokens.saida += r.u[1]
    tokens.escritaCache += r.u[2] + r.u[3]
    tokens.leituraCache += r.u[4]
    if (custo === null) semPreco += total
    else custoTotal += custo
    const ib = indiceBalde(p.baldes, r.t)
    const b = serie[ib]
    linhaPB(custoPB, r.p, () => 0)[ib] += custo ?? 0
    b.tokens += total
    b.custo += custo ?? 0
    const pr = projeto(r.p)
    pr.tokens += total
    pr.custo += custo ?? 0
    const mod = modelos.get(r.m) ?? { nome: r.m, ferramenta: r.f, tokens: 0, custo: custo === null ? null : 0 }
    mod.tokens += total
    if (custo !== null) mod.custo = (mod.custo ?? 0) + custo
    modelos.set(r.m, mod)
    const s = porSessao.get(r.s) ?? { tokens: 0, custo: 0 }
    s.tokens += total
    s.custo += custo ?? 0
    porSessao.set(r.s, s)
  }

  const todosTs: number[] = []
  const sessoes: Relatorio['sessoes'] = []
  for (const s of e.sessoes) {
    const ts = s.ts.filter(dentro)
    const uso = porSessao.get(s.id)
    if (!ts.length && !uso) continue
    todosTs.push(...ts)
    const pr = projeto(s.p)
    pr.ts.push(...ts)
    pr.sessoes.add(s.id)
    const linhaTs = linhaPB(tsPB, s.p, () => [] as number[])
    for (const t of ts) linhaTs[indiceBalde(p.baldes, t)].push(t)
    const ordenados = [...ts].sort((a, b) => a - b)
    sessoes.push({
      id: s.id,
      ferramenta: s.f,
      titulo: s.titulo || '(sem título)',
      projeto: s.p,
      branch: s.b,
      inicio: ordenados[0] ?? p.inicio,
      fim: ordenados[ordenados.length - 1] ?? p.inicio,
      minutos: minutosAtivos(ts),
      tokens: uso?.tokens ?? 0,
      custo: uso?.custo ?? 0
    })
  }
  // tempo ativo real (sem contar duas vezes agentes em paralelo), por balde
  const tsPorBalde = new Map<number, number[]>()
  for (const t of todosTs) {
    const i = indiceBalde(p.baldes, t)
    const lista = tsPorBalde.get(i) ?? []
    lista.push(t)
    tsPorBalde.set(i, lista)
  }
  for (const [i, lista] of tsPorBalde) serie[i].minutosAtivos = minutosAtivos(lista)

  for (const c of e.commits) {
    if (!dentro(c.t)) continue
    serie[indiceBalde(p.baldes, c.t)].commits++
    projeto(c.repo).commits++
  }

  let focoMin = 0
  let pomodorosCompletos = 0
  for (const po of e.pomodoros) {
    if (!dentro(po.inicio)) continue
    focoMin += po.minutos
    if (po.completo) pomodorosCompletos++
    serie[indiceBalde(p.baldes, po.inicio)].focoMin += po.minutos
  }

  const tarefasConcluidas = e.tarefas.filter((t) => t.feitaEm && dentro(t.feitaEm))
  const ant = totaisSimples(e.anterior.usos, e.anterior.sessoes, e.anterior.periodo)
  const totalTokens = tokens.entrada + tokens.saida + tokens.escritaCache + tokens.leituraCache
  const listaProjetos = [...projetos.values()]
    .map((pr) => ({
      nome: pr.nome,
      tokens: pr.tokens,
      custo: pr.custo,
      minutosAtivos: minutosAtivos(pr.ts),
      sessoes: pr.sessoes.size,
      commits: pr.commits
    }))
    .sort((a, b) => b.minutosAtivos - a.minutosAtivos || b.custo - a.custo || b.commits - a.commits)

  // barras empilhadas: os 4 projetos principais e o resto somado em "outros"
  const principais = listaProjetos.filter((pr) => pr.minutosAtivos > 0 || pr.custo > 0).slice(0, 4).map((pr) => pr.nome)
  const outros = [...new Set([...tsPB.keys(), ...custoPB.keys()])].filter((nome) => !principais.includes(nome))
  const pilhas = {
    projetos: outros.length ? [...principais, 'outros'] : principais,
    minutos: p.baldes.map((_, i) => {
      const linha = principais.map((nome) => minutosAtivos(tsPB.get(nome)?.[i] ?? []))
      if (outros.length) linha.push(minutosAtivos(outros.flatMap((nome) => tsPB.get(nome)?.[i] ?? [])))
      return linha
    }),
    custo: p.baldes.map((_, i) => {
      const linha = principais.map((nome) => Math.round((custoPB.get(nome)?.[i] ?? 0) * 100) / 100)
      if (outros.length) linha.push(Math.round(outros.reduce((a, nome) => a + (custoPB.get(nome)?.[i] ?? 0), 0) * 100) / 100)
      return linha
    })
  }
  const agora = Date.now()

  return {
    periodo: { tipo: p.tipo, rotulo: p.rotulo, inicio: p.inicio, fim: p.fim },
    geradoEm: Date.now(),
    totais: {
      tokens: totalTokens,
      tokensDetalhe: tokens,
      custo: custoTotal,
      tokensSemPreco: semPreco,
      minutosAtivos: minutosAtivos(todosTs),
      sessoes: sessoes.length,
      commits: e.commits.filter((c) => dentro(c.t)).length,
      focoMin,
      pomodoros: pomodorosCompletos,
      tarefasConcluidas: tarefasConcluidas.length
    },
    anterior: { rotulo: e.anterior.periodo.rotulo, ...ant },
    serie: serie.map((s) => ({ ...s, custo: Math.round(s.custo * 100) / 100 })),
    indiceAtual: dentro(agora) ? indiceBalde(p.baldes, agora) : -1,
    pilhas,
    projetos: listaProjetos,
    modelos: [...modelos.values()].sort((a, b) => b.tokens - a.tokens),
    sessoes: sessoes.sort((a, b) => b.fim - a.fim).slice(0, 300),
    commits: e.commits
      .filter((c) => dentro(c.t))
      .slice(0, 300)
      .map((c) => ({ repo: c.repo, hash: c.hash, t: c.t, msg: c.msg.slice(0, 200), branch: c.branch })),
    tarefasConcluidas: tarefasConcluidas.map((t) => ({ texto: t.texto, feitaEm: t.feitaEm! }))
  }
}
