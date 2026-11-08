// Painel de Trabalho (modelo A1). Conversa com o worker via window.orca.plugin (request/on).
// Textos em panel/i18n.js; o idioma segue a configuração do plugin ou o idioma do Orca.
;(() => {
  const orca = window.orca
  const t = (...a) => window.i18n.t(...a)
  const $ = (id) => document.getElementById(id)
  const NS = 'http://www.w3.org/2000/svg'

  const C = { fg: '#e6e8ec', mut: '#8c93a1', dim: '#5d6472', line: '#2a2e37', acc: '#7c8cff', ok: '#4cc38a', warn: '#e0a458', pausa: '#4cc38a' }
  const CORES = ['#7c8cff', '#4cc3c3', '#e0a458', '#d17ad6']
  const COR_OUTROS = '#5d6472'
  // nomes especiais que o worker usa e o painel traduz
  const OUTROS = 'outros'
  const SEM_PASTA = '(sem pasta)'

  const estado = { tipo: 'dia', deslocamento: 0, aba: 'resumo', relatorio: null, pomodoro: null, tarefas: [], cores: new Map() }

  // ---------- utilidades ----------

  function el(tag, attrs = {}, ...filhos) {
    const n = document.createElement(tag)
    for (const [k, v] of Object.entries(attrs)) {
      if (v === undefined || v === null || v === false) continue
      if (k === 'class') n.className = v
      else if (k === 'style') n.setAttribute('style', v)
      else if (k.startsWith('on')) n.addEventListener(k.slice(2), v)
      else n.setAttribute(k, v === true ? '' : String(v))
    }
    for (const f of filhos.flat()) {
      if (f === undefined || f === null || f === false) continue
      n.append(f instanceof Node ? f : document.createTextNode(String(f)))
    }
    return n
  }
  function s(tag, attrs = {}, texto) {
    const n = document.createElementNS(NS, tag)
    for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, String(v))
    if (texto !== undefined) n.textContent = texto
    return n
  }
  const svg = (w, h) => s('svg', { viewBox: `0 0 ${w} ${h}` })

  const loc = () => window.i18n.idioma
  const fmtNum = (n) => new Intl.NumberFormat(loc()).format(n)
  const fmtTokens = (n) => new Intl.NumberFormat(loc(), { notation: 'compact', maximumFractionDigits: n >= 1e9 ? 2 : 1 }).format(n)
  const fmtCusto = (n) => {
    const casas = n >= 100 ? 0 : 2
    return new Intl.NumberFormat(loc(), { style: 'currency', currency: 'USD', minimumFractionDigits: casas, maximumFractionDigits: casas }).format(n)
  }
  const fmtMin = (m) => {
    m = Math.round(m)
    if (m < 60) return `${m}m`
    const h = Math.floor(m / 60)
    const r = m % 60
    return r ? `${h}h ${String(r).padStart(2, '0')}m` : `${h}h`
  }
  const fmtHora = (ms) => new Date(ms).toLocaleTimeString(loc(), { hour: '2-digit', minute: '2-digit' })
  const fmtData = (ms, opcoes) => new Date(ms).toLocaleDateString(loc(), opcoes)
  const fmtDia = (ms) => {
    const d = new Date(ms)
    const hoje = new Date()
    const ontem = new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate() - 1)
    if (d.toDateString() === hoje.toDateString()) return t('hoje')
    if (d.toDateString() === ontem.toDateString()) return t('ontem')
    return fmtData(ms, { weekday: 'short', day: 'numeric', month: 'short' })
  }
  const fmtRelogio = (ms) => {
    const x = Math.max(0, Math.ceil(ms / 1000))
    return `${String(Math.floor(x / 60)).padStart(2, '0')}:${String(x % 60).padStart(2, '0')}`
  }
  const nomeProjeto = (nome) => (nome === OUTROS ? t('outros') : nome === SEM_PASTA ? t('semPasta') : nome)

  function rotuloPeriodo(p) {
    const d = estado.deslocamento
    if (p.tipo === 'dia') return d === 0 ? t('hoje') : d === -1 ? t('ontem') : fmtData(p.inicio, { weekday: 'short', day: 'numeric', month: 'short' })
    if (p.tipo === 'semana') {
      if (d === 0) return t('estaSemana')
      if (d === -1) return t('semanaPassada')
      return `${fmtData(p.inicio, { day: 'numeric', month: 'short' })} – ${fmtData(p.fim - 1, { day: 'numeric', month: 'short' })}`
    }
    return d === 0 ? t('esteMes', fmtData(p.inicio, { month: 'short', year: 'numeric' })) : fmtData(p.inicio, { month: 'long', year: 'numeric' })
  }

  function rotuloBalde(r, i) {
    const inicio = r.serie[i].inicio
    if (inicio === undefined) return r.serie[i].rotulo
    if (r.periodo.tipo === 'dia') return `${new Date(inicio).getHours()}h`
    if (r.periodo.tipo === 'semana') return fmtData(inicio, { weekday: 'short', day: 'numeric' })
    return String(new Date(inicio).getDate())
  }

  async function pedir(nome, entrada, timeoutMs = 120000) {
    if (!orca?.plugin?.request) throw new Error(t('apiIndisponivel'))
    return orca.plugin.request(nome, entrada, { timeoutMs })
  }

  function mostrarStatus(texto, erro = false) {
    const st = $('status')
    st.hidden = !texto
    st.textContent = texto || ''
    st.classList.toggle('erro', erro)
  }

  const corDoProjeto = (nome) => estado.cores.get(nome) ?? COR_OUTROS

  // ---------- pomodoro ----------

  function restanteMs(p) {
    if (!p) return 0
    if (p.rodando && p.fimEm) return Math.max(0, p.fimEm - Date.now())
    return p.restanteMs ?? 0
  }

  function desenharAnel(p) {
    const T = 100
    const cx = T / 2
    const grosso = 7
    const r = cx - grosso - 6
    const c = 2 * Math.PI * r
    const cor = p.fase === 'pausa' ? C.pausa : C.acc
    const resta = p.fase === 'parado' ? 0 : restanteMs(p)
    const frac = p.fase === 'parado' || !p.duracaoMs ? 0 : resta / p.duracaoMs
    const g = svg(T, T)
    g.append(s('circle', { cx, cy: cx, r, fill: 'none', stroke: C.line, 'stroke-width': grosso }))
    if (frac > 0) {
      g.append(s('circle', { class: 'anel-progresso', cx, cy: cx, r, fill: 'none', stroke: cor, 'stroke-width': grosso, 'stroke-linecap': 'round', 'stroke-dasharray': `${c * frac} ${c}`, transform: `rotate(-90 ${cx} ${cx})`, opacity: p.rodando ? 1 : 0.5 }))
    }
    // marcadores dos 4 ciclos no anel externo
    const R = cx - 3
    const cR = 2 * Math.PI * R
    const total = 4
    const seg = cR / total
    for (let i = 0; i < total; i++) {
      const cheio = i < (p.ciclos ?? 0)
      g.append(s('circle', { cx, cy: cx, r: R, fill: 'none', stroke: cheio ? C.acc : C.line, 'stroke-width': 3, 'stroke-linecap': 'round', 'stroke-dasharray': `${seg - 6} ${cR}`, 'stroke-dashoffset': -(i * seg + 3), transform: `rotate(-90 ${cx} ${cx})` }))
    }
    const tempo = p.fase === 'parado' ? fmtRelogio(25 * 60000) : fmtRelogio(resta)
    g.append(s('text', { x: cx, y: cx + 6, 'text-anchor': 'middle', fill: p.fase === 'parado' ? C.mut : C.fg, 'font-size': 20, 'font-weight': 600, 'font-family': 'Geist Mono, ui-monospace, monospace' }, tempo))
    const sub = p.fase === 'parado' ? t('pronto') : t('deTempo', fmtRelogio(p.duracaoMs))
    g.append(s('text', { x: cx, y: cx + 21, 'text-anchor': 'middle', fill: C.mut, 'font-size': 9, 'font-family': 'Geist, system-ui, sans-serif' }, sub))
    $('pomoAnel').replaceChildren(g)
  }

  function desenharPomodoro() {
    const p = estado.pomodoro
    if (!p) return
    const raiz = $('pomodoro')
    raiz.dataset.fase = p.fase
    raiz.dataset.pausado = String(p.fase !== 'parado' && !p.rodando)
    const ciclo = Math.min(4, (p.ciclos ?? 0) + 1)
    const nome = p.fase === 'foco' ? t('focoCiclo', ciclo, 4) : p.fase === 'pausa' ? t(p.pausaLonga ? 'pausaLonga' : 'pausa') : t('pomodoro')
    $('pomoFase').querySelector('span').textContent = p.fase !== 'parado' && !p.rodando ? `${nome} · ${t('pausado')}` : nome
    $('pomoPrincipal').textContent = p.fase === 'parado' ? t('iniciarFoco') : p.rodando ? t('pausar') : t('continuar')
    $('pomoPular').hidden = p.fase === 'parado'
    $('pomoParar').hidden = p.fase === 'parado'
    const rotulo = $('pomoRotulo')
    if (document.activeElement !== rotulo) rotulo.value = p.rotulo || ''
    desenharAnel(p)
  }

  async function acaoPomodoro(acao) {
    try {
      estado.pomodoro = await pedir('pomodoro.acao', { acao, rotulo: $('pomoRotulo').value })
      desenharPomodoro()
      if (acao === 'parar' || acao === 'pular') carregarRelatorio(true)
    } catch (e) {
      mostrarStatus(t('erroPomodoro', e.message || e), true)
    }
  }

  $('pomoPrincipal').addEventListener('click', () => {
    const p = estado.pomodoro
    if (!p || p.fase === 'parado') acaoPomodoro('iniciar')
    else acaoPomodoro(p.rodando ? 'pausar' : 'continuar')
  })
  $('pomoParar').addEventListener('click', () => acaoPomodoro('parar'))
  $('pomoPular').addEventListener('click', () => acaoPomodoro('pular'))
  $('pomoRotulo').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      if (!estado.pomodoro || estado.pomodoro.fase === 'parado') acaoPomodoro('iniciar')
      else $('pomoRotulo').blur()
    }
  })
  $('pomoRotulo').addEventListener('change', () => {
    // salva o rótulo sem mudar a fase
    if (estado.pomodoro && estado.pomodoro.fase !== 'parado') acaoPomodoro(estado.pomodoro.rodando ? 'continuar' : 'pausar')
  })

  setInterval(() => {
    if (estado.pomodoro && estado.pomodoro.rodando) desenharAnel(estado.pomodoro)
  }, 1000)

  // ---------- resumo ----------

  function sparkline(serie, cor) {
    const W = 64
    const H = 20
    const g = svg(W, H)
    g.setAttribute('width', W)
    g.setAttribute('height', H)
    const max = Math.max(...serie)
    if (!serie.length || max <= 0) {
      g.append(s('line', { x1: 2, x2: W - 2, y1: H - 3, y2: H - 3, stroke: C.line, 'stroke-width': 1.4 }))
      return g
    }
    const pts = serie.map((y, i) => [(i / Math.max(1, serie.length - 1)) * (W - 4) + 2, H - 3 - (y / max) * (H - 6)])
    const linha = pts.map((p) => p.map((v) => v.toFixed(1)).join(',')).join(' L')
    g.append(s('path', { d: `M${linha} L${W - 2},${H} L2,${H} Z`, fill: cor, 'fill-opacity': 0.14 }))
    g.append(s('path', { d: `M${linha}`, fill: 'none', stroke: cor, 'stroke-width': 1.4, 'stroke-linejoin': 'round' }))
    const u = pts[pts.length - 1]
    g.append(s('circle', { cx: u[0], cy: u[1], r: 2.4, fill: cor }))
    return g
  }

  function delta(atual, anterior) {
    if (!anterior) return el('span', {}, t('semComparacao'))
    const pct = Math.round(((atual - anterior) / anterior) * 100)
    return el('span', { class: `num ${pct > 0 ? 'up' : pct < 0 ? 'dn' : ''}`, title: t('comparadoAnterior') }, `${pct > 0 ? '+' : ''}${pct}%`)
  }

  function desenharKpis(r) {
    const tot = r.totais
    // no dia, a tendência para na hora atual
    const ate = r.indiceAtual >= 0 ? r.indiceAtual + 1 : r.serie.length
    const serie = (campo) => r.serie.slice(0, ate).map((b) => b[campo])
    const repos = new Set(r.commits.map((c) => c.repo)).size
    const kpi = (rotulo, valor, rodape, spark) =>
      el('div', { class: 'kpi' }, el('span', { class: 'l' }, rotulo), el('span', { class: 'v num', title: valor }, valor), el('div', { class: 'rod' }, rodape, spark))
    $('kpis').replaceChildren(
      kpi(t('tempoAtivo'), fmtMin(tot.minutosAtivos), delta(tot.minutosAtivos, r.anterior.minutosAtivos), sparkline(serie('minutosAtivos'), C.acc)),
      kpi(t('foco'), fmtMin(tot.focoMin), el('span', {}, t('nPomodoros', tot.pomodoros, fmtNum(tot.pomodoros))), sparkline(serie('focoMin'), C.acc)),
      kpi(t('custoEstimado'), fmtCusto(tot.custo), delta(tot.custo, r.anterior.custo), sparkline(serie('custo'), C.warn)),
      kpi(t('commits'), fmtNum(tot.commits), el('span', {}, repos ? t('nRepositorios', repos, fmtNum(repos)) : t('nenhum')), sparkline(serie('commits'), C.ok))
    )
  }

  function desenharRosca(r) {
    const projetos = r.projetos.filter((p) => p.minutosAtivos > 0)
    const principais = projetos.slice(0, 4)
    const resto = projetos.slice(4).reduce((a, p) => a + p.minutosAtivos, 0)
    const itens = principais.map((p) => ({ nome: p.nome, min: p.minutosAtivos, cor: corDoProjeto(p.nome) }))
    if (resto > 0) itens.push({ nome: OUTROS, min: resto, cor: COR_OUTROS })
    const soma = itens.reduce((a, i) => a + i.min, 0)
    const T = 116
    const cx = T / 2
    const r0 = 46
    const c = 2 * Math.PI * r0
    const g = svg(T, T)
    if (!soma) {
      g.append(s('circle', { cx, cy: cx, r: r0, fill: 'none', stroke: C.line, 'stroke-width': 12 }))
    } else {
      let acum = 0
      itens.forEach((it, i) => {
        const parte = (it.min / soma) * c
        const folga = itens.length > 1 ? 2.5 : 0
        g.append(s('circle', { cx, cy: cx, r: r0, fill: 'none', stroke: it.cor, 'stroke-width': i === 0 ? 15 : 12, 'stroke-dasharray': `${Math.max(0.5, parte - folga)} ${c}`, 'stroke-dashoffset': -acum, transform: `rotate(-90 ${cx} ${cx})` }))
        acum += parte
      })
    }
    g.append(s('text', { x: cx, y: cx + 1, 'text-anchor': 'middle', fill: C.fg, 'font-size': 15, 'font-weight': 600, 'font-family': 'Geist Mono, ui-monospace, monospace' }, fmtMin(r.totais.minutosAtivos)))
    g.append(s('text', { x: cx, y: cx + 15, 'text-anchor': 'middle', fill: C.mut, 'font-size': 9, 'font-family': 'Geist, system-ui, sans-serif' }, projetos.length ? t('nProjetos', projetos.length, fmtNum(projetos.length)) : t('semAtividade')))
    $('donut').replaceChildren(g)
    $('legenda').replaceChildren(
      ...(itens.length
        ? itens.map((it) => el('div', {}, el('i', { style: `background:${it.cor}` }), el('span', { title: nomeProjeto(it.nome) }, nomeProjeto(it.nome)), el('em', { class: 'num' }, fmtMin(it.min)), el('strong', { class: 'num' }, `${Math.round((it.min / soma) * 100)}%`)))
        : [el('div', { class: 'vazio' }, t('nadaRegistrado'))])
    )
  }

  const METRICAS = {
    minutos: { fmt: fmtMin, empilhada: 'minutos', campo: 'minutosAtivos', cor: C.acc },
    custo: { fmt: fmtCusto, empilhada: 'custo', campo: 'custo', cor: C.warn },
    focoMin: { fmt: fmtMin, campo: 'focoMin', cor: C.acc },
    commits: { fmt: (n) => t('nCommits', n, fmtNum(n)), campo: 'commits', cor: C.ok },
    tokens: { fmt: fmtTokens, campo: 'tokens', cor: C.acc }
  }

  function escalaBonita(max, metrica) {
    if (metrica === 'minutos' || metrica === 'focoMin') {
      const passos = [15, 30, 60, 120, 180, 240, 360, 480]
      const passo = passos.find((p) => max / p <= 3) ?? Math.ceil(max / 3 / 60) * 60
      return { topo: Math.max(passo, Math.ceil(max / passo) * passo), passo }
    }
    const bruto = max / 3 || 1
    const mag = 10 ** Math.floor(Math.log10(bruto))
    const passo = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((p) => p >= bruto) ?? bruto
    return { topo: Math.max(passo, Math.ceil(max / passo) * passo), passo }
  }

  function rotuloEixo(v, metrica) {
    if (metrica === 'minutos' || metrica === 'focoMin') return v >= 60 ? `${+(v / 60).toFixed(1)}h` : `${v}m`
    if (metrica === 'custo') return `$${v >= 1000 ? `${+(v / 1000).toFixed(1)}k` : +v.toFixed(2)}`
    if (metrica === 'tokens') return fmtTokens(v)
    return String(v)
  }

  function desenharBarras(r) {
    const metrica = $('metrica').value
    const m = METRICAS[metrica]
    const n = r.serie.length
    const pilha = m.empilhada ? r.pilhas[m.empilhada] : null
    // Empilhado: cada barra mede o total do período (tempo ativo real, sem contar agentes em
    // paralelo duas vezes) e as cores dividem esse total na proporção de cada projeto.
    const valores = r.serie.map((b, i) => {
      if (!pilha) return [b[m.campo]]
      const partes = pilha[i]
      const somaPartes = partes.reduce((a, v) => a + v, 0)
      const alvo = b[m.campo]
      return somaPartes > 0 && alvo > 0 ? partes.map((v) => (v / somaPartes) * alvo) : partes.map(() => 0)
    })
    const totais = valores.map((v) => v.reduce((a, b) => a + b, 0))
    const max = Math.max(...totais, 0)
    const coresPilha = pilha ? r.pilhas.projetos.map((nome) => corDoProjeto(nome)) : [m.cor]

    const W = 330
    const H = 128
    const base = 104
    const topo = 14
    const esq = 26
    const g = svg(W, H)
    g.setAttribute('role', 'img')
    const dica = $('dica')
    const dicaPadrao = max ? t('total', m.fmt(totais.reduce((a, b) => a + b, 0))) : t('semDados')
    dica.textContent = dicaPadrao

    const { topo: escala, passo } = escalaBonita(max, metrica)
    const y = (v) => base - (v / escala) * (base - topo)
    for (let v = passo; v <= escala + 1e-9; v += passo) {
      g.append(s('line', { x1: esq, x2: W, y1: y(v), y2: y(v), stroke: C.line, 'stroke-dasharray': '2 3' }))
      g.append(s('text', { x: 0, y: y(v) + 3, fill: C.dim, 'font-size': 9, 'font-family': 'Geist Mono, ui-monospace, monospace' }, rotuloEixo(v, metrica)))
    }
    g.append(s('line', { x1: esq, x2: W, y1: base + 0.5, y2: base + 0.5, stroke: C.line }))

    const passoX = (W - esq) / n
    const larg = Math.max(2, passoX * (n > 12 ? 0.62 : 0.52))
    const cadaRotulo = n > 16 ? Math.ceil(n / 8) : n > 8 ? 3 : 1
    valores.forEach((partes, i) => {
      const x = esq + i * passoX + (passoX - larg) / 2
      const atual = i === r.indiceAtual
      const grupo = s('g', { opacity: r.indiceAtual >= 0 && !atual ? 0.72 : 1 })
      let yTopo = base
      partes.forEach((v, j) => {
        if (!v) return
        const alt = (v / escala) * (base - topo)
        grupo.append(s('rect', { x, y: yTopo - alt + 1, width: larg, height: Math.max(0.8, alt - (partes.length > 1 ? 1.5 : 1)), rx: larg > 6 ? 2 : 1, fill: coresPilha[j] ?? COR_OUTROS }))
        yTopo -= alt
      })
      // área invisível para o mouse
      const alvo = s('rect', { x: esq + i * passoX, y: topo, width: passoX, height: base - topo + 14, fill: 'transparent' })
      const detalhe = pilha && totais[i] ? ` · ${partes.map((v, j) => (v ? `${nomeProjeto(r.pilhas.projetos[j])} ${m.fmt(v)}` : null)).filter(Boolean).join(', ')}` : ''
      alvo.addEventListener('mouseenter', () => (dica.textContent = `${rotuloBalde(r, i)}: ${m.fmt(totais[i])}${detalhe}`))
      grupo.append(alvo)
      g.append(grupo)
      if (atual && totais[i]) {
        g.append(s('text', { x: x + larg / 2, y: Math.max(9, yTopo - 4), 'text-anchor': 'middle', fill: C.fg, 'font-size': 9.5, 'font-weight': 600, 'font-family': 'Geist Mono, ui-monospace, monospace' }, m.fmt(totais[i])))
      }
      // rótulos espaçados; perto do destaque "agora/hoje" eles saem para não sobrepor
      const pertoDoAtual = r.indiceAtual >= 0 && !atual && cadaRotulo > 1 && Math.abs(i - r.indiceAtual) < Math.ceil(cadaRotulo / 2) + 1
      if ((i % cadaRotulo === 0 && !pertoDoAtual) || atual) {
        const rot = atual ? (r.periodo.tipo === 'dia' ? t('agora') : t('hojeCurto')) : rotuloBalde(r, i)
        g.append(s('text', { x: x + larg / 2, y: H - 6, 'text-anchor': 'middle', fill: atual ? C.fg : C.mut, 'font-size': 10, 'font-weight': atual ? 600 : 400, 'font-family': 'Geist, system-ui, sans-serif' }, rot))
      }
    })
    g.addEventListener('mouseleave', () => (dica.textContent = dicaPadrao))
    $('barras').replaceChildren(g)
  }

  function linhaSessao(sessao) {
    const titulo = sessao.titulo || t('semTitulo')
    const projeto = nomeProjeto(sessao.projeto)
    return el(
      'div',
      {},
      el('i', { style: `background:${corDoProjeto(sessao.projeto)}` }),
      el('b', { title: titulo }, titulo),
      el('em', { class: 'num' }, fmtMin(sessao.minutos)),
      el(
        'span',
        { title: `${projeto}${sessao.branch ? ` · ${sessao.branch}` : ''}` },
        el('span', { class: 'selo' }, sessao.ferramenta),
        [projeto, sessao.branch, `${fmtHora(sessao.inicio)}–${fmtHora(sessao.fim)}`, sessao.custo ? fmtCusto(sessao.custo) : null].filter(Boolean).join(' · ')
      )
    )
  }

  function desenharUltimasSessoes(r) {
    const ultimas = r.sessoes.slice(0, 3)
    $('ultimasSessoes').replaceChildren(...(ultimas.length ? ultimas.map(linhaSessao) : [el('div', { class: 'vazio' }, t('nenhumaSessao'))]))
    $('verSessoes').hidden = r.sessoes.length <= 3
  }

  function desenharModelos(r) {
    $('tokensTotal').textContent = r.totais.tokens ? t('nTokens', fmtTokens(r.totais.tokens)) : ''
    const max = Math.max(...r.modelos.map((m) => m.tokens), 1)
    $('modelos').replaceChildren(
      ...(r.modelos.length
        ? r.modelos.map((m) =>
            el(
              'div',
              {},
              el('i', { style: `background:${C.acc};opacity:${0.35 + 0.65 * (m.tokens / max)}` }),
              el('b', {}, el('span', { class: 'selo' }, m.ferramenta), m.nome),
              el('em', { class: 'num' }, m.custo === null ? '—' : fmtCusto(m.custo)),
              el('span', { class: 'num' }, t('nTokens', fmtTokens(m.tokens)))
            )
          )
        : [el('div', { class: 'vazio' }, t('nenhumModelo'))])
    )
  }

  // ---------- abas de lista ----------

  function agruparPorDia(itens, chave) {
    const grupos = []
    let atual = null
    for (const item of itens) {
      const dia = fmtDia(item[chave])
      if (!atual || atual.dia !== dia) {
        atual = { dia, itens: [] }
        grupos.push(atual)
      }
      atual.itens.push(item)
    }
    return grupos
  }

  function desenharSessoes(r) {
    $('nSessoes').textContent = r.sessoes.length ? String(r.sessoes.length) : ''
    if (!r.sessoes.length) {
      $('sessoes').replaceChildren(el('div', { class: 'vazio' }, t('nenhumaSessao')))
      return
    }
    const blocos = []
    for (const g of agruparPorDia(r.sessoes, 'fim')) {
      if (r.periodo.tipo !== 'dia') blocos.push(el('div', { class: 'grupo' }, g.dia))
      blocos.push(...g.itens.map(linhaSessao))
    }
    $('sessoes').replaceChildren(...blocos)
  }

  function desenharCommits(r) {
    $('nCommits').textContent = r.commits.length ? String(r.commits.length) : ''
    if (!r.commits.length) {
      $('commits').replaceChildren(el('div', { class: 'vazio' }, t('nenhumCommit')))
      return
    }
    const blocos = []
    for (const g of agruparPorDia(r.commits, 't')) {
      blocos.push(el('div', { class: 'grupo' }, `${g.dia} · ${g.itens.length}`))
      for (const c of g.itens) {
        blocos.push(
          el(
            'div',
            {},
            el('i', { style: `background:${corDoProjeto(c.repo)}` }),
            el('b', { title: c.msg }, c.msg),
            el('em', { class: 'num' }, fmtHora(c.t)),
            el('span', { class: 'num' }, [c.repo, c.branch, c.hash].filter(Boolean).join(' · '))
          )
        )
      }
    }
    $('commits').replaceChildren(...blocos)
  }

  function desenharConcluidasNoPeriodo(r) {
    const lista = [...r.tarefasConcluidas].sort((a, b) => b.feitaEm - a.feitaEm)
    if (!lista.length) {
      $('concluidasPeriodo').replaceChildren()
      return
    }
    $('concluidasPeriodo').replaceChildren(
      el('div', { class: 'cab' }, el('h3', {}, t('concluidasPeriodo')), el('small', { class: 'num' }, String(lista.length))),
      el('div', { class: 'lista' }, ...lista.map((x) => el('div', {}, el('i', { style: `background:${C.ok}` }), el('b', { title: x.texto }, x.texto), el('em', { class: 'num' }, fmtHora(x.feitaEm)), el('span', {}, fmtDia(x.feitaEm)))))
    )
  }

  function desenharRelatorio() {
    const r = estado.relatorio
    $('proximo').disabled = estado.deslocamento >= 0
    $('tituloBarras').textContent = estado.tipo === 'dia' ? t('porHora') : t('porDia')
    if (!r) {
      $('rotuloPeriodo').textContent = '…'
      return
    }
    $('rotuloPeriodo').textContent = rotuloPeriodo(r.periodo)
    // cores fixas por projeto dentro do período: as 4 principais e cinza para o resto
    estado.cores = new Map()
    r.pilhas.projetos.forEach((nome, i) => estado.cores.set(nome, nome === OUTROS ? COR_OUTROS : CORES[i] ?? COR_OUTROS))
    desenharKpis(r)
    desenharRosca(r)
    desenharBarras(r)
    desenharUltimasSessoes(r)
    desenharModelos(r)
    desenharSessoes(r)
    desenharCommits(r)
    desenharConcluidasNoPeriodo(r)
  }

  let pedidoAtual = 0
  async function carregarRelatorio(silencioso = false) {
    const meu = ++pedidoAtual
    if (!silencioso || !estado.relatorio) mostrarStatus(estado.relatorio ? t('atualizando') : t('lendo'))
    try {
      const r = await pedir('relatorio.obter', { tipo: estado.tipo, deslocamento: estado.deslocamento })
      if (meu !== pedidoAtual) return
      estado.relatorio = r
      mostrarStatus('')
      desenharRelatorio()
    } catch (e) {
      if (meu !== pedidoAtual) return
      mostrarStatus(t('erroRelatorio', e.message || e), true)
    }
  }

  document.querySelectorAll('.seg .s button').forEach((b) =>
    b.addEventListener('click', () => {
      document.querySelectorAll('.seg .s button').forEach((x) => x.classList.toggle('on', x === b))
      estado.tipo = b.dataset.tipo
      estado.deslocamento = 0
      carregarRelatorio()
    })
  )
  $('anterior').addEventListener('click', () => {
    estado.deslocamento--
    carregarRelatorio()
  })
  $('proximo').addEventListener('click', () => {
    if (estado.deslocamento < 0) estado.deslocamento++
    carregarRelatorio()
  })
  $('atualizar').addEventListener('click', () => carregarRelatorio())
  $('metrica').addEventListener('change', () => estado.relatorio && desenharBarras(estado.relatorio))

  function abrirAba(aba) {
    estado.aba = aba
    document.querySelectorAll('.abas button').forEach((x) => x.classList.toggle('on', x.dataset.aba === aba))
    document.querySelectorAll('[data-painel]').forEach((sec) => (sec.hidden = sec.dataset.painel !== aba))
  }
  document.querySelectorAll('.abas button').forEach((b) => b.addEventListener('click', () => abrirAba(b.dataset.aba)))
  $('verSessoes').addEventListener('click', () => abrirAba('sessoes'))

  // ---------- tarefas ----------

  function desenharTarefas() {
    const lista = estado.tarefas
    const pendentes = lista.filter((x) => !x.feita).length
    $('nTarefas').textContent = pendentes ? String(pendentes) : ''
    const ul = $('tarefas')
    if (!lista.length) {
      ul.replaceChildren(el('li', { class: 'vazio' }, t('nenhumaTarefa')))
    } else {
      const ordenada = [...lista.filter((x) => !x.feita), ...lista.filter((x) => x.feita)]
      ul.replaceChildren(
        ...ordenada.map((x) =>
          el(
            'li',
            { class: x.feita ? 'feita' : '' },
            el('input', { type: 'checkbox', checked: x.feita, 'aria-label': t('concluida'), onchange: () => alterarTarefa('alternar', x.id) }),
            el('span', { class: 'texto' }, x.texto),
            el('button', { class: 'ic', 'aria-label': t('removerTarefa'), title: t('remover'), onclick: () => alterarTarefa('remover', x.id) }, '×')
          )
        )
      )
    }
    $('limparFeitas').hidden = !lista.some((x) => x.feita)
  }

  async function alterarTarefa(acao, id, texto) {
    try {
      estado.tarefas = await pedir('tarefas.alterar', { acao, id, texto }, 15000)
      desenharTarefas()
      if (acao === 'alternar') carregarRelatorio(true)
    } catch (e) {
      mostrarStatus(t('erroTarefas', e.message || e), true)
    }
  }

  $('novaTarefa').addEventListener('submit', (e) => {
    e.preventDefault()
    const campo = $('textoTarefa')
    const texto = campo.value.trim()
    if (!texto) return
    campo.value = ''
    alterarTarefa('adicionar', undefined, texto)
  })
  $('limparFeitas').addEventListener('click', () => alterarTarefa('limparFeitas'))

  // ---------- idioma ----------

  function aplicarIdioma(tag) {
    window.i18n.definir(tag)
    window.i18n.aplicar()
    desenharPomodoro()
    desenharTarefas()
    desenharRelatorio()
    window.sistemaPainel?.redesenhar()
  }

  // ---------- início ----------

  if (orca?.plugin?.on) {
    orca.plugin.on('pomodoro.mudou', (p) => {
      const mudouFase = estado.pomodoro && estado.pomodoro.fase !== p.fase
      estado.pomodoro = p
      desenharPomodoro()
      if (mudouFase) carregarRelatorio(true)
    })
    orca.plugin.on('tarefas.mudou', (lista) => {
      estado.tarefas = lista
      desenharTarefas()
    })
    orca.plugin.on('idioma.mudou', ({ idioma }) => aplicarIdioma(idioma))
  }

  // idioma inicial: o do Orca; o worker confirma, porque a configuração do plugin pode fixar outro
  const idiomaOrca = orca?.locale || navigator.language
  estado.pomodoro = { fase: 'parado', rodando: false, fimEm: null, restanteMs: null, duracaoMs: 0, inicioFase: null, rotulo: '', ciclos: 0, pausaLonga: false }
  aplicarIdioma(idiomaOrca)
  pedir('idioma.sincronizar', { idiomaOrca }, 15000)
    .then(({ idioma }) => {
      if (idioma !== window.i18n.idioma) aplicarIdioma(idioma)
    })
    .catch(() => undefined)
  pedir('pomodoro.obter', undefined, 30000)
    .then((p) => {
      estado.pomodoro = p
      desenharPomodoro()
    })
    .catch(() => undefined)
  pedir('tarefas.obter', undefined, 30000)
    .then((lista) => {
      estado.tarefas = lista
      desenharTarefas()
    })
    .catch(() => undefined)
  carregarRelatorio()

  // atualiza sozinho a cada 2 min enquanto o painel estiver visível
  const trabalhoVisivel = () => !document.hidden && !document.getElementById('visaoTrabalho').hidden
  setInterval(() => {
    if (trabalhoVisivel()) carregarRelatorio(true)
  }, 120000)
  document.addEventListener('visibilitychange', () => {
    if (trabalhoVisivel()) carregarRelatorio(true)
  })
})()
