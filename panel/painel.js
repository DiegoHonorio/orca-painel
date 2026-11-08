// Painel de Trabalho (modelo A1). Conversa com o worker via window.orca.plugin (request/on).
;(() => {
  const orca = window.orca
  const $ = (id) => document.getElementById(id)
  const NS = 'http://www.w3.org/2000/svg'

  const C = { fg: '#e6e8ec', mut: '#8c93a1', dim: '#5d6472', line: '#2a2e37', acc: '#7c8cff', ok: '#4cc38a', warn: '#e0a458', pausa: '#4cc38a' }
  const CORES = ['#7c8cff', '#4cc3c3', '#e0a458', '#d17ad6']
  const COR_OUTROS = '#5d6472'

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
  function svg(w, h) {
    const n = s('svg', { viewBox: `0 0 ${w} ${h}` })
    return n
  }

  const fmtNum = new Intl.NumberFormat('pt-BR')
  const fmtTokens = (n) => {
    if (n >= 1e9) return `${(n / 1e9).toFixed(2).replace('.', ',')} bi`
    if (n >= 1e6) return `${(n / 1e6).toFixed(1).replace('.', ',')} mi`
    if (n >= 1e3) return `${Math.round(n / 1e3)} mil`
    return fmtNum.format(Math.round(n))
  }
  const fmtCusto = (n) => (n >= 100 ? `US$ ${fmtNum.format(Math.round(n))}` : `US$ ${n.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`)
  const fmtMin = (m) => {
    m = Math.round(m)
    if (m < 60) return `${m}m`
    const h = Math.floor(m / 60)
    const r = m % 60
    return r ? `${h}h ${String(r).padStart(2, '0')}m` : `${h}h`
  }
  const fmtHora = (t) => new Date(t).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
  const fmtDia = (t) => {
    const d = new Date(t)
    const hoje = new Date()
    const ontem = new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate() - 1)
    if (d.toDateString() === hoje.toDateString()) return 'Hoje'
    if (d.toDateString() === ontem.toDateString()) return 'Ontem'
    return d.toLocaleDateString('pt-BR', { weekday: 'short', day: 'numeric', month: 'short' })
  }
  const fmtRelogio = (ms) => {
    const t = Math.max(0, Math.ceil(ms / 1000))
    return `${String(Math.floor(t / 60)).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}`
  }
  const plural = (n, um, varios) => `${fmtNum.format(n)} ${n === 1 ? um : varios}`

  async function pedir(nome, entrada, timeoutMs = 120000) {
    if (!orca?.plugin?.request) throw new Error('API do Orca indisponível neste painel.')
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
    const tempo = p.fase === 'parado' ? fmtRelogio((estado.focoPadraoMin ?? 25) * 60000) : fmtRelogio(resta)
    g.append(s('text', { x: cx, y: cx + 6, 'text-anchor': 'middle', fill: p.fase === 'parado' ? C.mut : C.fg, 'font-size': 20, 'font-weight': 600, 'font-family': 'Geist Mono, ui-monospace, monospace' }, tempo))
    const sub = p.fase === 'parado' ? 'pronto' : `de ${fmtRelogio(p.duracaoMs)}`
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
    const nome = p.fase === 'foco' ? `Foco · ${ciclo} de 4` : p.fase === 'pausa' ? (p.pausaLonga ? 'Pausa longa' : 'Pausa') : 'Pomodoro'
    $('pomoFase').querySelector('span').textContent = p.fase !== 'parado' && !p.rodando ? `${nome} · pausado` : nome
    const principal = $('pomoPrincipal')
    principal.textContent = p.fase === 'parado' ? 'Iniciar foco' : p.rodando ? 'Pausar' : 'Continuar'
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
      mostrarStatus(`Pomodoro: ${e.message || e}`, true)
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
    if (!anterior) return el('span', {}, 'sem comparação')
    const pct = Math.round(((atual - anterior) / anterior) * 100)
    return el('span', { class: `num ${pct > 0 ? 'up' : pct < 0 ? 'dn' : ''}`, title: 'Comparado com o período anterior' }, `${pct > 0 ? '+' : ''}${pct}%`)
  }

  function desenharKpis(r) {
    const t = r.totais
    // no dia, a tendência para na hora atual
    const ate = r.indiceAtual >= 0 ? r.indiceAtual + 1 : r.serie.length
    const serie = (campo) => r.serie.slice(0, ate).map((b) => b[campo])
    const repos = new Set(r.commits.map((c) => c.repo)).size
    const kpi = (rotulo, valor, rodape, spark) =>
      el('div', { class: 'kpi' }, el('span', { class: 'l' }, rotulo), el('span', { class: 'v num', title: valor }, valor), el('div', { class: 'rod' }, rodape, spark))
    $('kpis').replaceChildren(
      kpi('Tempo ativo', fmtMin(t.minutosAtivos), delta(t.minutosAtivos, r.anterior.minutosAtivos), sparkline(serie('minutosAtivos'), C.acc)),
      kpi('Foco', fmtMin(t.focoMin), el('span', {}, plural(t.pomodoros, 'pomodoro', 'pomodoros')), sparkline(serie('focoMin'), C.acc)),
      kpi('Custo estimado', fmtCusto(t.custo), delta(t.custo, r.anterior.custo), sparkline(serie('custo'), C.warn)),
      kpi('Commits', fmtNum.format(t.commits), el('span', {}, repos ? plural(repos, 'repositório', 'repositórios') : 'nenhum'), sparkline(serie('commits'), C.ok))
    )
  }

  function desenharRosca(r) {
    const projetos = r.projetos.filter((p) => p.minutosAtivos > 0)
    const principais = projetos.slice(0, 4)
    const resto = projetos.slice(4).reduce((a, p) => a + p.minutosAtivos, 0)
    const itens = principais.map((p) => ({ nome: p.nome, min: p.minutosAtivos, cor: corDoProjeto(p.nome) }))
    if (resto > 0) itens.push({ nome: 'outros', min: resto, cor: COR_OUTROS })
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
    g.append(s('text', { x: cx, y: cx + 15, 'text-anchor': 'middle', fill: C.mut, 'font-size': 9, 'font-family': 'Geist, system-ui, sans-serif' }, projetos.length ? plural(projetos.length, 'projeto', 'projetos') : 'sem atividade'))
    $('donut').replaceChildren(g)
    $('legenda').replaceChildren(
      ...(itens.length
        ? itens.map((it) => el('div', {}, el('i', { style: `background:${it.cor}` }), el('span', { title: it.nome }, it.nome), el('em', { class: 'num' }, fmtMin(it.min)), el('strong', { class: 'num' }, `${Math.round((it.min / soma) * 100)}%`)))
        : [el('div', { class: 'vazio' }, 'Nada registrado neste período.')])
    )
  }

  const METRICAS = {
    minutos: { fmt: fmtMin, empilhada: 'minutos', campo: 'minutosAtivos', cor: C.acc },
    custo: { fmt: fmtCusto, empilhada: 'custo', campo: 'custo', cor: C.warn },
    focoMin: { fmt: fmtMin, campo: 'focoMin', cor: C.acc },
    commits: { fmt: (n) => plural(n, 'commit', 'commits'), campo: 'commits', cor: C.ok },
    tokens: { fmt: fmtTokens, campo: 'tokens', cor: C.acc }
  }

  function escalaBonita(max, fmt, metrica) {
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
    if (metrica === 'tokens') return fmtTokens(v).replace(' ', '')
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
    const dicaPadrao = max ? `Total: ${m.fmt(totais.reduce((a, b) => a + b, 0))}` : 'Sem dados no período'
    dica.textContent = dicaPadrao

    const { topo: escala, passo } = escalaBonita(max, m.fmt, metrica)
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
      const detalhe = pilha && totais[i] ? ` · ${partes.map((v, j) => (v ? `${r.pilhas.projetos[j]} ${m.fmt(v)}` : null)).filter(Boolean).join(', ')}` : ''
      alvo.addEventListener('mouseenter', () => (dica.textContent = `${r.serie[i].rotulo}: ${m.fmt(totais[i])}${detalhe}`))
      grupo.append(alvo)
      g.append(grupo)
      if (atual && totais[i]) {
        g.append(s('text', { x: x + larg / 2, y: Math.max(9, yTopo - 4), 'text-anchor': 'middle', fill: C.fg, 'font-size': 9.5, 'font-weight': 600, 'font-family': 'Geist Mono, ui-monospace, monospace' }, m.fmt(totais[i])))
      }
      // rótulos espaçados; perto do destaque "agora/hoje" eles saem para não sobrepor
      const pertoDoAtual = r.indiceAtual >= 0 && !atual && cadaRotulo > 1 && Math.abs(i - r.indiceAtual) < Math.ceil(cadaRotulo / 2) + 1
      if ((i % cadaRotulo === 0 && !pertoDoAtual) || atual) {
        const rot = atual ? (r.periodo.tipo === 'dia' ? 'agora' : 'hoje') : r.serie[i].rotulo
        g.append(s('text', { x: x + larg / 2, y: H - 6, 'text-anchor': 'middle', fill: atual ? C.fg : C.mut, 'font-size': 10, 'font-weight': atual ? 600 : 400, 'font-family': 'Geist, system-ui, sans-serif' }, rot))
      }
    })
    g.addEventListener('mouseleave', () => (dica.textContent = dicaPadrao))
    $('barras').replaceChildren(g)
  }

  function linhaSessao(sessao) {
    return el(
      'div',
      {},
      el('i', { style: `background:${corDoProjeto(sessao.projeto)}` }),
      el('b', { title: sessao.titulo }, sessao.titulo),
      el('em', { class: 'num' }, fmtMin(sessao.minutos)),
      el(
        'span',
        { title: `${sessao.projeto}${sessao.branch ? ` · ${sessao.branch}` : ''}` },
        el('span', { class: 'selo' }, sessao.ferramenta),
        [sessao.projeto, sessao.branch, `${fmtHora(sessao.inicio)}–${fmtHora(sessao.fim)}`, sessao.custo ? fmtCusto(sessao.custo) : null].filter(Boolean).join(' · ')
      )
    )
  }

  function desenharUltimasSessoes(r) {
    const ultimas = r.sessoes.slice(0, 3)
    $('ultimasSessoes').replaceChildren(...(ultimas.length ? ultimas.map(linhaSessao) : [el('div', { class: 'vazio' }, 'Nenhuma sessão de agente neste período.')]))
    $('verSessoes').hidden = r.sessoes.length <= 3
  }

  function desenharModelos(r) {
    $('tokensTotal').textContent = r.totais.tokens ? `${fmtTokens(r.totais.tokens)} tokens` : ''
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
              el('span', { class: 'num' }, `${fmtTokens(m.tokens)} tokens`)
            )
          )
        : [el('div', { class: 'vazio' }, 'Nenhum uso de modelo neste período.')])
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
      $('sessoes').replaceChildren(el('div', { class: 'vazio' }, 'Nenhuma sessão de agente neste período.'))
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
      $('commits').replaceChildren(el('div', { class: 'vazio' }, 'Nenhum commit seu neste período.'))
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
      el('div', { class: 'cab' }, el('h3', {}, 'Concluídas no período'), el('small', { class: 'num' }, String(lista.length))),
      el('div', { class: 'lista' }, ...lista.map((t) => el('div', {}, el('i', { style: `background:${C.ok}` }), el('b', { title: t.texto }, t.texto), el('em', { class: 'num' }, fmtHora(t.feitaEm)), el('span', {}, fmtDia(t.feitaEm)))))
    )
  }

  function desenharRelatorio() {
    const r = estado.relatorio
    $('proximo').disabled = estado.deslocamento >= 0
    if (!r) {
      $('rotuloPeriodo').textContent = '…'
      return
    }
    $('rotuloPeriodo').textContent = r.periodo.rotulo
    $('tituloBarras').textContent = r.periodo.tipo === 'dia' ? 'Por hora' : 'Por dia'
    // cores fixas por projeto dentro do período: as 4 principais e cinza para o resto
    estado.cores = new Map()
    r.pilhas.projetos.forEach((nome, i) => estado.cores.set(nome, nome === 'outros' ? COR_OUTROS : CORES[i] ?? COR_OUTROS))
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
    if (!silencioso || !estado.relatorio) mostrarStatus(estado.relatorio ? 'Atualizando…' : 'Lendo seu histórico… a primeira vez pode levar alguns segundos.')
    try {
      const r = await pedir('relatorio.obter', { tipo: estado.tipo, deslocamento: estado.deslocamento })
      if (meu !== pedidoAtual) return
      estado.relatorio = r
      mostrarStatus('')
      desenharRelatorio()
    } catch (e) {
      if (meu !== pedidoAtual) return
      mostrarStatus(`Não consegui montar o relatório: ${e.message || e}`, true)
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
    const pendentes = lista.filter((t) => !t.feita).length
    $('nTarefas').textContent = pendentes ? String(pendentes) : ''
    const ul = $('tarefas')
    if (!lista.length) {
      ul.replaceChildren(el('li', { class: 'vazio' }, 'Nenhuma tarefa. Adicione o que precisa fazer.'))
    } else {
      const ordenada = [...lista.filter((t) => !t.feita), ...lista.filter((t) => t.feita)]
      ul.replaceChildren(
        ...ordenada.map((t) =>
          el(
            'li',
            { class: t.feita ? 'feita' : '' },
            el('input', { type: 'checkbox', checked: t.feita, 'aria-label': 'Concluída', onchange: () => alterarTarefa('alternar', t.id) }),
            el('span', { class: 'texto' }, t.texto),
            el('button', { class: 'ic', 'aria-label': 'Remover tarefa', title: 'Remover', onclick: () => alterarTarefa('remover', t.id) }, '×')
          )
        )
      )
    }
    $('limparFeitas').hidden = !lista.some((t) => t.feita)
  }

  async function alterarTarefa(acao, id, texto) {
    try {
      estado.tarefas = await pedir('tarefas.alterar', { acao, id, texto }, 15000)
      desenharTarefas()
      if (acao === 'alternar') carregarRelatorio(true)
    } catch (e) {
      mostrarStatus(`Tarefas: ${e.message || e}`, true)
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
  }

  estado.pomodoro = { fase: 'parado', rodando: false, fimEm: null, restanteMs: null, duracaoMs: 0, inicioFase: null, rotulo: '', ciclos: 0, pausaLonga: false }
  desenharPomodoro()
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
  setInterval(() => {
    if (!document.hidden) carregarRelatorio(true)
  }, 120000)
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) carregarRelatorio(true)
  })
})()
