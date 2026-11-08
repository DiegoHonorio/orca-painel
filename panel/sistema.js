// Aba Sistema e faixa de rede/bateria. Para não pesar, só pede leituras ao worker enquanto o painel
// está visível; CPU, memória e programas só com a aba Sistema aberta e sem pausa.
;(() => {
  const orca = window.orca
  const t = (...a) => window.i18n.t(...a)
  const $ = (id) => document.getElementById(id)
  const NS = 'http://www.w3.org/2000/svg'
  const loc = () => window.i18n.idioma
  const HIST = 40
  const CORES = { apps: '#4cc38a', buffers: '#5cc8e0', cache: '#3b4256', livre: '#2b3040', cpu: '#7c8cff', mem: '#4cc38a' }

  const est = {
    visao: 'trabalho',
    pausado: false,
    ordem: 'cpu',
    dados: null,
    portas: undefined,
    discos: undefined,
    faixa: null,
    erro: null,
    cpuHist: [],
    memHist: [],
    ultPortas: 0,
    ultDiscos: 0,
    intervaloS: 3,
    timer: null,
    rodando: false
  }
  try {
    if (localStorage.getItem('painel.visao') === 'sistema') est.visao = 'sistema'
    est.ordem = localStorage.getItem('painel.ordem') === 'mem' ? 'mem' : 'cpu'
  } catch {
    // sem armazenamento: usa os padrões
  }

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
  function s(tag, attrs = {}) {
    const n = document.createElementNS(NS, tag)
    for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, String(v))
    return n
  }

  const num = (n, casas = 1) => new Intl.NumberFormat(loc(), { maximumFractionDigits: casas, minimumFractionDigits: 0 }).format(n)
  function fmtBytes(b) {
    if (b >= 1024 ** 4) return `${num(b / 1024 ** 4)} TB`
    if (b >= 1024 ** 3) return `${num(b / 1024 ** 3)} GB`
    if (b >= 1024 ** 2) return `${num(b / 1024 ** 2, 0)} MB`
    return `${num(b / 1024, 0)} KB`
  }
  function fmtTaxa(b) {
    if (b >= 1024 ** 2) return `${num(b / 1024 ** 2)} MB/s`
    return `${num(b / 1024, 0)} KB/s`
  }
  function fmtDur(min) {
    min = Math.round(min)
    const d = Math.floor(min / 1440)
    const h = Math.floor((min % 1440) / 60)
    const m = min % 60
    if (d) return `${d}d ${h}h`
    if (h) return `${h}h ${String(m).padStart(2, '0')}m`
    return `${m}m`
  }
  function fmtHa(ms) {
    const seg = (Date.now() - ms) / 1000
    const rtf = new Intl.RelativeTimeFormat(loc(), { numeric: 'auto', style: 'short' })
    if (seg < 3600) return rtf.format(-Math.max(1, Math.round(seg / 60)), 'minute')
    if (seg < 86400) return rtf.format(-Math.round(seg / 3600), 'hour')
    return rtf.format(-Math.round(seg / 86400), 'day')
  }

  async function pedir(nome, entrada) {
    if (!orca?.plugin?.request) throw new Error(t('apiIndisponivel'))
    return orca.plugin.request(nome, entrada, { timeoutMs: 15000 })
  }

  function spark(dados, cor) {
    const w = 160
    const h = 30
    const g = s('svg', { class: 'spark', viewBox: `0 0 ${w} ${h}`, preserveAspectRatio: 'none', 'aria-hidden': 'true' })
    if (dados.length < 2) return g
    const passo = w / (HIST - 1)
    const x0 = w - (dados.length - 1) * passo
    const pts = dados.map((v, i) => [x0 + i * passo, h - (Math.min(100, v) / 100) * (h - 2) - 1])
    const linha = pts.map((p, i) => `${i ? 'L' : 'M'}${p[0].toFixed(1)} ${p[1].toFixed(1)}`).join(' ')
    g.append(s('path', { d: `${linha} L${w} ${h} L${x0.toFixed(1)} ${h}Z`, fill: cor, opacity: 0.14 }))
    g.append(s('path', { d: linha, fill: 'none', stroke: cor, 'stroke-width': 1.5, 'vector-effect': 'non-scaling-stroke' }))
    return g
  }

  function barra(partes) {
    return el('div', { class: 'barra' }, partes.filter((p) => p.v > 0).map((p) => el('i', { style: `width:${(p.v * 100).toFixed(2)}%;background:${p.cor}` })))
  }

  // ---------- faixa (todas as abas) ----------

  function desenharFaixa() {
    const f = $('faixa')
    const x = est.faixa
    f.replaceChildren()
    if (!x || (!x.rede && !x.bateria)) {
      f.hidden = true
      return
    }
    f.hidden = false
    if (x.rede) {
      f.append(el('span', { title: t('rede') }, el('span', { class: 'd' }, '↓'), fmtTaxa(x.rede.rx), ' ', el('span', { class: 'u' }, '↑'), fmtTaxa(x.rede.tx)))
    } else f.append(el('span'))
    if (x.bateria) {
      const b = x.bateria
      const detalhe = b.cheia ? t('carregada') : b.minutos ? (b.carregando ? t('ateCarregar', fmtDur(b.minutos)) : t('restantes', fmtDur(b.minutos))) : b.carregando ? t('carregando') : ''
      f.append(
        el(
          'span',
          { title: t('bateria') },
          el('i', { class: `bat${b.pct <= 15 && !b.carregando ? ' baixa' : ''}` }, el('i', { style: `width:${Math.max(4, Math.min(100, b.pct))}%` })),
          `${num(b.pct, 0)}%${b.carregando ? ' ⚡' : ''}${detalhe ? ` · ${detalhe}` : ''}`
        )
      )
    }
  }

  // ---------- aba Sistema ----------

  function desenharMedidores(d) {
    const nuc = d.cpu.nucleos
    // em máquinas com muitos núcleos, junta de dois em dois para caber
    const grupo = Math.ceil(nuc.length / 32) || 1
    const barras = []
    for (let i = 0; i < nuc.length; i += grupo) {
      const fatia = nuc.slice(i, i + grupo)
      barras.push(fatia.reduce((a, b) => a + b, 0) / fatia.length)
    }
    $('medCpu').replaceChildren(
      el('div', { class: 'top' }, el('small', {}, 'CPU'), el('small', { class: 'num' }, t('nNucleos', nuc.length))),
      el('div', { class: 'val num' }, num(d.cpu.total, 0), el('em', {}, '%')),
      spark(est.cpuHist, CORES.cpu),
      el('div', { class: 'nucleos', 'aria-hidden': 'true' }, barras.map((v) => el('i', { style: `height:${Math.max(4, v).toFixed(0)}%;opacity:${(0.35 + v / 160).toFixed(2)}` })))
    )
    const m = d.mem
    const usado = m.total - m.disponivel
    $('medMem').replaceChildren(
      el('div', { class: 'top' }, el('small', {}, t('memLivre')), el('small', { class: 'num' }, fmtBytes(m.total))),
      el('div', { class: 'val num' }, fmtBytes(m.disponivel)),
      spark(est.memHist, CORES.mem),
      el('div', { class: 'sub num' }, t('emUso', fmtBytes(usado), num((usado / m.total) * 100, 0)))
    )
  }

  function desenharMemoria(d) {
    const m = d.mem
    const temCache = m.buffers + m.cache > 0
    const partes = temCache
      ? [
          { v: m.apps / m.total, cor: CORES.apps, nome: t('apps'), b: m.apps },
          { v: m.buffers / m.total, cor: CORES.buffers, nome: t('buffers'), b: m.buffers },
          { v: m.cache / m.total, cor: CORES.cache, nome: t('cache'), b: m.cache }
        ]
      : [{ v: (m.total - m.livre) / m.total, cor: CORES.apps, nome: t('emUsoCurto'), b: m.total - m.livre }]
    $('memBarra').replaceChildren(
      barra(partes),
      el(
        'div',
        { class: 'legenda num' },
        [...partes, { cor: CORES.livre, nome: t('livre'), b: m.livre }].map((p) => el('span', { style: `--c:${p.cor}` }, `${p.nome} ${fmtBytes(p.b)}`))
      )
    )
    $('swap').textContent = m.swapTotal ? t('swap', fmtBytes(m.swapUsado), fmtBytes(m.swapTotal)) : ''
  }

  function desenharProcessos(d) {
    const alvo = $('procs')
    document.querySelectorAll('.alt button').forEach((b) => b.classList.toggle('on', b.dataset.ordem === est.ordem))
    if (!d.processos) {
      alvo.replaceChildren(el('div', { class: 'vazio' }, t('naoSuportado')))
      $('agentes').hidden = true
      return
    }
    const chave = est.ordem === 'cpu' ? 'cpu' : 'mem'
    const top = [...d.processos].sort((a, b) => b[chave] - a[chave]).slice(0, 5)
    const max = Math.max(...top.map((p) => p[chave]), 0.0001)
    alvo.replaceChildren(
      el('div', { class: 'th' }, el('span', {}, '#'), el('span', {}, t('programa')), el('span', {}, 'CPU'), el('span', {}, t('memCurto'))),
      ...top.map((p, i) =>
        el(
          'div',
          { class: 'proc' },
          el('i', { class: 'fundo', style: `width:${((p[chave] / max) * 100).toFixed(1)}%` }),
          el('span', { class: 'r num' }, i + 1),
          el('span', { class: 'nome', title: p.nome }, p.nome, p.processos > 1 ? el('small', { class: 'num' }, t('nProc', p.processos)) : null),
          el('span', { class: 'c num' }, `${num(p.cpu)}%`),
          el('span', { class: 'm num' }, fmtBytes(p.mem))
        )
      )
    )
    const agentes = d.processos.filter((p) => p.agente).sort((a, b) => b.mem - a.mem)
    const caixa = $('agentes')
    caixa.hidden = !agentes.length
    caixa.replaceChildren(
      el('h3', {}, t('agentesIA')),
      ...agentes.map((p) =>
        el('div', { class: 'linha' }, el('span', {}, p.nome, ' ', el('small', { style: 'color:var(--dim)' }, t('nProc', p.processos))), el('span', { class: 'num' }, `${fmtBytes(p.mem)} · ${num(p.cpu)}% CPU`))
      )
    )
  }

  function desenharPortas() {
    const alvo = $('portas')
    if (est.portas === undefined) return alvo.replaceChildren(el('div', { class: 'vazio' }, t('lendoSistema')))
    if (est.portas === null) return alvo.replaceChildren(el('div', { class: 'vazio' }, t('naoSuportado')))
    if (!est.portas.length) return alvo.replaceChildren(el('div', { class: 'vazio' }, t('nenhumaPorta')))
    alvo.replaceChildren(
      ...est.portas.map((p) =>
        el(
          'div',
          { class: `porta${p.desde && Date.now() - p.desde > 86400000 ? ' velha' : ''}` },
          el('b', { class: 'num' }, `:${p.porta}`),
          el('span', { class: 'proj', title: p.projeto ? `${p.projeto} · ${p.programa}` : p.programa }, p.projeto ?? p.programa, p.projeto ? el('small', {}, p.programa) : null, p.publica ? el('span', { class: 'rede', title: t('portaRedeTitulo') }, t('portaRede')) : null),
          el('span', { class: 'tempo num' }, p.desde ? fmtHa(p.desde) : '')
        )
      )
    )
  }

  function desenharDiscos() {
    const alvo = $('discos')
    if (!est.discos) return alvo.replaceChildren(el('div', { class: 'vazio' }, t('lendoSistema')))
    alvo.replaceChildren(
      ...est.discos.map((d) => {
        const frac = d.usado / d.total
        return el('div', { class: 'disco' }, el('span', { class: 'num' }, d.nome), barra([{ v: frac, cor: frac > 0.9 ? 'var(--warn)' : '#e0a458' }]), el('span', { class: 'num' }, `${fmtBytes(d.usado)} / ${fmtBytes(d.total)}`))
      })
    )
  }

  function desenharSistema() {
    $('sisEstado').textContent = est.pausado ? t('sisPausado') : t('atualizaCada', est.intervaloS)
    $('sisPausar').textContent = est.pausado ? `▶ ${t('continuar')}` : `⏸ ${t('pausar')}`
    document.querySelector('.menu .vivo').hidden = est.visao !== 'sistema' || est.pausado
    const erro = $('sisErro')
    erro.hidden = !est.erro
    erro.textContent = est.erro ? t('erroSistema', est.erro) : ''
    const d = est.dados
    if (!d) {
      $('procs').replaceChildren(el('div', { class: 'vazio' }, t('lendoSistema')))
      return
    }
    desenharMedidores(d)
    desenharMemoria(d)
    desenharProcessos(d)
    desenharPortas()
    desenharDiscos()
    const partes = [t('ligadoHa', fmtDur(d.ligadoHaS / 60))]
    if (d.carga) partes.push(t('carga', d.carga.map((c) => num(c, 2)).join(' ')))
    partes.push(t('soComAbaAberta'))
    $('sisNota').textContent = partes.join(' · ')
  }

  // ---------- leituras ----------

  async function lerSistema() {
    const agora = Date.now()
    const portas = agora - est.ultPortas >= 10000
    const discos = agora - est.ultDiscos >= 60000
    try {
      const d = await pedir('sistema.obter', { portas, discos })
      est.erro = null
      est.dados = d
      est.intervaloS = d.intervaloS || 3
      if (portas) {
        est.portas = d.portas
        est.ultPortas = agora
      }
      if (discos) {
        est.discos = d.discos
        est.ultDiscos = agora
      }
      est.cpuHist = [...est.cpuHist, d.cpu.total].slice(-HIST)
      est.memHist = [...est.memHist, ((d.mem.total - d.mem.disponivel) / d.mem.total) * 100].slice(-HIST)
    } catch (e) {
      est.erro = e?.message || String(e)
    }
    desenharSistema()
  }

  async function lerFaixa() {
    try {
      est.faixa = await pedir('sistema.faixa')
    } catch {
      est.faixa = null
    }
    desenharFaixa()
  }

  async function ciclo() {
    clearTimeout(est.timer)
    est.timer = null
    if (document.hidden || est.rodando) return
    est.rodando = true
    try {
      const leituras = [lerFaixa()]
      if (est.visao === 'sistema' && !est.pausado) leituras.push(lerSistema())
      await Promise.allSettled(leituras)
    } finally {
      est.rodando = false
    }
    if (!document.hidden) est.timer = setTimeout(ciclo, est.intervaloS * 1000)
  }

  // ---------- menu ----------

  function abrirVisao(visao) {
    est.visao = visao
    try {
      localStorage.setItem('painel.visao', visao)
    } catch {
      // sem armazenamento
    }
    document.querySelectorAll('.menu button').forEach((b) => {
      b.classList.toggle('on', b.dataset.visao === visao)
      b.setAttribute('aria-selected', String(b.dataset.visao === visao))
    })
    $('visaoTrabalho').hidden = visao !== 'trabalho'
    $('visaoSistema').hidden = visao !== 'sistema'
    desenharSistema()
    if (visao === 'sistema') ciclo()
  }

  document.querySelectorAll('.menu button').forEach((b) => b.addEventListener('click', () => abrirVisao(b.dataset.visao)))
  $('sisPausar').addEventListener('click', () => {
    est.pausado = !est.pausado
    desenharSistema()
    if (!est.pausado) ciclo()
  })
  document.querySelectorAll('.alt button').forEach((b) =>
    b.addEventListener('click', () => {
      est.ordem = b.dataset.ordem
      try {
        localStorage.setItem('painel.ordem', est.ordem)
      } catch {
        // sem armazenamento
      }
      if (est.dados) desenharProcessos(est.dados)
    })
  )
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      clearTimeout(est.timer)
      est.timer = null
    } else ciclo()
  })

  window.sistemaPainel = {
    redesenhar() {
      desenharFaixa()
      desenharSistema()
    },
    /** Usado pela demonstração (tools/demo) para os gráficos não começarem vazios nos prints. */
    preencherHistorico(cpu, mem) {
      est.cpuHist = cpu.slice(-HIST)
      est.memHist = mem.slice(-HIST)
      desenharSistema()
    }
  }

  abrirVisao(est.visao)
  ciclo()
})()
