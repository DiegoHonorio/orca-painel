// Aba Chats: os chats abertos nos terminais do Orca, agrupados por pasta, quem espera você primeiro.
// Lê do worker a cada 3 s com a aba aberta, a cada 15 s nas outras abas (só para o contador) e na
// hora em que o Orca avisa que um agente mudou de estado.
;(() => {
  const orca = window.orca
  const t = (...a) => window.i18n.t(...a)
  const $ = (id) => document.getElementById(id)
  const loc = () => window.i18n.idioma

  const PESO = { esperando: 0, trabalhando: 1, aberto: 2, concluido: 3 }
  const COR = { esperando: 'var(--warn)', trabalhando: 'var(--acc)', concluido: 'var(--ok)', aberto: 'var(--dim)' }
  const ROTULO = { esperando: 'chEsperando', trabalhando: 'chTrabalhando', concluido: 'chConcluido', aberto: 'chAberto' }

  const est = { visao: 'trabalho', dados: null, erro: null, filtro: 'todos', busca: '', fechados: new Set(), timer: null, lendo: false }
  try {
    est.fechados = new Set(JSON.parse(localStorage.getItem('painel.chatsFechados') || '[]'))
  } catch {
    // sem armazenamento
  }

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

  function fmtHa(ms) {
    if (!ms) return ''
    const seg = Math.max(0, (Date.now() - ms) / 1000)
    const rtf = new Intl.RelativeTimeFormat(loc(), { numeric: 'auto', style: 'narrow' })
    if (seg < 60) return rtf.format(0, 'second')
    if (seg < 3600) return rtf.format(-Math.round(seg / 60), 'minute')
    if (seg < 86400) return rtf.format(-Math.round(seg / 3600), 'hour')
    return rtf.format(-Math.round(seg / 86400), 'day')
  }

  async function pedir(nome, entrada) {
    if (!orca?.plugin?.request) throw new Error(t('apiIndisponivel'))
    return orca.plugin.request(nome, entrada, { timeoutMs: 15000 })
  }

  function guardarFechados() {
    try {
      localStorage.setItem('painel.chatsFechados', JSON.stringify([...est.fechados]))
    } catch {
      // sem armazenamento
    }
  }

  // ---------- montagem ----------

  /** Grupos por pasta com os chats já filtrados e ordenados; a pasta mais urgente primeiro. */
  function grupos() {
    const d = est.dados
    if (!d) return []
    const porWs = new Map(d.workspaces.map((w) => [w.id, w]))
    const q = est.busca.trim().toLowerCase()
    const mapa = new Map()
    for (const c of d.chats) {
      const ws = porWs.get(c.workspaceId)
      if (!ws) continue
      if (est.filtro !== 'todos' && c.estado !== est.filtro) continue
      const texto = `${ws.pasta} ${ws.nome} ${ws.branch || ''} ${c.titulo || ''}`.toLowerCase()
      if (q && !texto.includes(q)) continue
      const g = mapa.get(ws.pasta) ?? { pasta: ws.pasta, chats: [] }
      g.chats.push({ ...c, ws })
      mapa.set(ws.pasta, g)
    }
    const ordem = (a, b) => PESO[a.estado] - PESO[b.estado] || (b.desde || 0) - (a.desde || 0)
    const lista = [...mapa.values()]
    for (const g of lista) g.chats.sort(ordem)
    return lista.sort((a, b) => ordem(a.chats[0], b.chats[0]) || a.pasta.localeCompare(b.pasta))
  }

  function contar() {
    const n = { todos: 0, esperando: 0, trabalhando: 0, concluido: 0 }
    for (const c of est.dados?.chats ?? []) {
      n.todos++
      if (c.estado in n) n[c.estado]++
    }
    return n
  }

  function desenharContador() {
    const n = est.dados ? contar().esperando : 0
    const b = $('nEsperando')
    b.hidden = !n
    b.textContent = n
    b.title = t('chEsperando')
  }

  function desenharFiltros() {
    const n = contar()
    const itens = [
      ['todos', 'chTodos', null],
      ['esperando', 'chEsperandoCurto', COR.esperando],
      ['trabalhando', 'chTrabalhando', COR.trabalhando],
      ['concluido', 'chConcluidos', COR.concluido]
    ]
    $('chFiltros').replaceChildren(
      ...itens.map(([k, rot, cor]) =>
        el(
          'button',
          {
            class: est.filtro === k ? 'on' : '',
            'aria-pressed': String(est.filtro === k),
            onclick: () => {
              est.filtro = est.filtro === k && k !== 'todos' ? 'todos' : k
              desenhar()
            }
          },
          cor && el('i', { style: `background:${cor}` }),
          t(rot),
          el('span', { class: 'num' }, n[k])
        )
      )
    )
  }

  async function abrir(c) {
    try {
      await pedir('chats.abrir', { workspaceId: c.workspaceId })
    } catch (e) {
      est.erro = t('chErroAbrir', e?.message || String(e))
      desenhar()
    }
  }

  function item(c) {
    const podeAbrir = est.dados?.podeAbrir
    const sub = [t(ROTULO[c.estado]), c.ws.tipo === 'worktree' && c.ws.branch ? c.ws.branch : c.ws.tipo === 'worktree' ? c.ws.nome : null].filter(Boolean).join(' · ')
    return el(
      'button',
      { class: 'ch-item', disabled: !podeAbrir, title: podeAbrir ? `${t('chAbrir')}: ${c.ws.nome}` : c.ws.nome, onclick: () => abrir(c) },
      el('span', { class: `ch-st ${c.estado}` }),
      el('div', { style: 'min-width:0' }, el('div', { class: 'ch-tt' }, c.titulo || (c.estado === 'aberto' ? c.ws.nome : t('chSemTitulo'))), el('div', { class: 'ch-sub' }, sub)),
      el('span', { class: 'ch-tempo num' }, fmtHa(c.desde))
    )
  }

  function grupo(g) {
    const fechado = est.fechados.has(g.pasta)
    return el(
      'div',
      { class: `ch-grupo${fechado ? ' fechado' : ''}` },
      el(
        'button',
        {
          class: 'ch-cab',
          'aria-expanded': String(!fechado),
          onclick: () => {
            if (fechado) est.fechados.delete(g.pasta)
            else est.fechados.add(g.pasta)
            guardarFechados()
            desenhar()
          }
        },
        el('span', { class: 'seta' }, '▼'),
        el('span', { class: 'nome' }, g.pasta),
        el('span', { class: 'ch-pontos' }, g.chats.map((c) => el('i', { style: `background:${COR[c.estado]}` }))),
        el('span', { class: 'cnt num' }, g.chats.length)
      ),
      el('div', { class: 'ch-itens' }, g.chats.map(item))
    )
  }

  function desenhar() {
    desenharContador()
    if (est.visao !== 'chats') return
    const erro = $('chErro')
    erro.hidden = !est.erro
    erro.textContent = est.erro || ''
    desenharFiltros()
    const lista = $('chLista')
    if (!est.dados) {
      lista.replaceChildren(est.erro ? '' : el('div', { class: 'ch-vazio' }, t('lendoSistema')))
      $('chNota').textContent = ''
      return
    }
    const gs = grupos()
    if (!gs.length) lista.replaceChildren(el('div', { class: 'ch-vazio' }, est.dados.chats.length ? t('chNenhumFiltro') : t('chNenhum')))
    else lista.replaceChildren(...gs.map(grupo))
    const pastas = new Set(est.dados.workspaces.map((w) => w.pasta)).size
    $('chNota').textContent = est.dados.chats.length ? t('chNota', est.dados.chats.length, pastas, est.dados.semChat) : ''
  }

  // ---------- leitura ----------

  async function ler() {
    if (est.lendo) return
    est.lendo = true
    try {
      est.dados = await pedir('chats.obter')
      est.erro = null
    } catch (e) {
      est.erro = t('chErro', e?.message || String(e))
    } finally {
      est.lendo = false
    }
    desenhar()
  }

  async function ciclo() {
    clearTimeout(est.timer)
    est.timer = null
    if (document.hidden) return
    await ler()
    if (!document.hidden) est.timer = setTimeout(ciclo, est.visao === 'chats' ? 3000 : 15000)
  }

  let mudouTimer = null
  orca?.plugin?.on?.('chats.mudou', () => {
    clearTimeout(mudouTimer)
    mudouTimer = setTimeout(() => void ler(), 300)
  })

  $('chBusca').addEventListener('input', (e) => {
    est.busca = e.target.value
    desenhar()
  })
  window.addEventListener('painel:visao', (e) => {
    est.visao = e.detail
    if (est.visao === 'chats') est.erro = null
    desenhar()
    ciclo()
  })
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      clearTimeout(est.timer)
      est.timer = null
    } else ciclo()
  })

  window.chatsPainel = { redesenhar: desenhar }

  // sistema.js já abriu a visão salva antes deste arquivo carregar
  est.visao = $('visaoChats').hidden ? 'outra' : 'chats'
  ciclo()
})()
