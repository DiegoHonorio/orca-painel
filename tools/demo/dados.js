// Dados FICTÍCIOS para a página de demonstração e os prints do catálogo.
// Nenhum dado real é lido aqui: projetos, sessões e commits são inventados.
;(() => {
  let semente = 42
  const rand = () => ((semente = (semente * 16807) % 2147483647) - 1) / 2147483646
  const PROJETOS = ['api-gateway', 'web-app', 'mobile-app', 'docs-site', 'infra']
  const PESO = [0.36, 0.26, 0.18, 0.12, 0.08]
  const DIAS = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb']
  const MESES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez']
  const TITULOS = [
    ['api-gateway', 'Add rate limiting to public endpoints', 'feat/rate-limit'],
    ['web-app', 'Fix flaky checkout test', 'fix/checkout-test'],
    ['api-gateway', 'Migrate auth middleware to JWT v2', 'chore/jwt-v2'],
    ['mobile-app', 'Offline mode for the orders screen', 'feat/offline-orders'],
    ['docs-site', 'Rewrite the getting started guide', 'docs/getting-started'],
    ['web-app', 'Dark mode for the settings page', 'feat/dark-settings'],
    ['infra', 'Terraform: split staging and prod state', 'infra/split-state'],
    ['api-gateway', 'Investigate 502s on /orders', 'main'],
    ['mobile-app', 'Push notification permissions flow', 'feat/push-flow'],
    ['web-app', 'Refactor the table component', 'refactor/table']
  ]
  const COMMITS = ['Add retry with backoff', 'Fix null check in order mapper', 'Update snapshot tests', 'Extract pricing service', 'Bump dependencies', 'Handle empty cart state', 'Add e2e test for login', 'Remove dead feature flag', 'Improve error messages', 'Cache user profile lookups']

  function periodo(tipo) {
    const agora = new Date()
    const hoje = new Date(agora.getFullYear(), agora.getMonth(), agora.getDate())
    if (tipo === 'dia') {
      const baldes = Array.from({ length: 24 }, (_, h) => ({ inicio: new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate(), h).getTime(), rotulo: `${h}h` }))
      return { rotulo: 'Hoje', inicio: hoje.getTime(), fim: hoje.getTime() + 86400000, baldes, atual: 16, anterior: 'Ontem' }
    }
    if (tipo === 'semana') {
      const ini = new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate() - ((hoje.getDay() + 6) % 7))
      const baldes = Array.from({ length: 7 }, (_, i) => {
        const d = new Date(ini.getFullYear(), ini.getMonth(), ini.getDate() + i)
        return { inicio: d.getTime(), rotulo: `${DIAS[d.getDay()]} ${d.getDate()}` }
      })
      return { rotulo: 'Esta semana', inicio: ini.getTime(), fim: ini.getTime() + 7 * 86400000, baldes, atual: 4, anterior: 'Semana passada' }
    }
    const ini = new Date(hoje.getFullYear(), hoje.getMonth(), 1)
    const fim = new Date(hoje.getFullYear(), hoje.getMonth() + 1, 1)
    const n = Math.round((fim - ini) / 86400000)
    const baldes = Array.from({ length: n }, (_, i) => ({ inicio: new Date(ini.getFullYear(), ini.getMonth(), i + 1).getTime(), rotulo: String(i + 1) }))
    return { rotulo: `Este mês (${MESES[ini.getMonth()]} ${ini.getFullYear()})`, inicio: ini.getTime(), fim: fim.getTime(), baldes, atual: 19, anterior: 'Mês passado' }
  }

  function intensidade(tipo, i, inicio) {
    if (tipo === 'dia') {
      if (i < 8 || i > 18) return 0
      if (i === 12) return 0.25
      return 0.6 + rand() * 0.4
    }
    const dow = new Date(inicio).getDay()
    if (dow === 0 || dow === 6) return rand() < 0.5 ? 0 : 0.2 + rand() * 0.2
    return 0.55 + rand() * 0.45
  }

  window.demoRelatorio = (tipo) => {
    semente = tipo === 'dia' ? 7 : tipo === 'semana' ? 42 : 99
    const p = periodo(tipo)
    const escala = tipo === 'dia' ? 50 : 390
    const serie = []
    const minutos = []
    const custo = []
    p.baldes.forEach((b, i) => {
      const futuro = i > p.atual
      const k = futuro ? 0 : intensidade(tipo, i, b.inicio)
      const parciais = PESO.map((w) => Math.round(k * escala * w * (0.6 + rand() * 0.8)))
      const linha = [...parciais.slice(0, 4), parciais[4]]
      const cs = linha.map((m) => Math.round(m * (0.09 + rand() * 0.05) * 100) / 100)
      minutos.push(linha)
      custo.push(cs)
      const ativo = Math.round(linha.reduce((a, b2) => a + b2, 0) * 0.78)
      serie.push({
        inicio: b.inicio,
        rotulo: b.rotulo,
        minutosAtivos: ativo,
        custo: Math.round(cs.reduce((a, b2) => a + b2, 0) * 100) / 100,
        tokens: Math.round(ativo * (180000 + rand() * 60000)),
        focoMin: futuro ? 0 : Math.round(ativo * (0.35 + rand() * 0.2)),
        commits: futuro || !k ? 0 : Math.round(k * (tipo === 'dia' ? 2 : 9) * rand())
      })
    })
    const soma = (campo) => serie.reduce((a, b) => a + b[campo], 0)
    const projetos = PROJETOS.map((nome, j) => ({
      nome,
      minutosAtivos: minutos.reduce((a, l) => a + l[j], 0),
      custo: custo.reduce((a, l) => a + l[j], 0),
      tokens: Math.round(minutos.reduce((a, l) => a + l[j], 0) * 210000),
      sessoes: Math.max(1, Math.round(minutos.reduce((a, l) => a + l[j], 0) / 45)),
      commits: Math.round(soma('commits') * PESO[j])
    }))
    const custoTotal = soma('custo')
    const tokensTotal = soma('tokens')
    const agora = Date.now()
    const sessoes = TITULOS.map(([projeto, titulo, branch], i) => {
      const fim = agora - i * (tipo === 'dia' ? 50 : tipo === 'semana' ? 7 : 40) * 60000 * (1 + rand())
      const min = Math.round(20 + rand() * 100)
      return { id: `demo-${i}`, ferramenta: i % 4 === 3 ? 'codex' : 'claude', titulo, projeto, branch, inicio: fim - min * 60000, fim, minutos: min, tokens: Math.round(min * 200000), custo: Math.round(min * (0.1 + rand() * 0.06) * 100) / 100 }
    })
    const commits = Array.from({ length: Math.min(40, soma('commits')) }, (_, i) => ({
      repo: PROJETOS[Math.floor(rand() * 4)],
      hash: Math.floor(rand() * 0xffffffff).toString(16).padStart(8, '0'),
      t: agora - i * (tipo === 'dia' ? 35 : 180) * 60000,
      msg: COMMITS[i % COMMITS.length],
      branch: 'main'
    }))
    const focoMin = soma('focoMin')
    return {
      periodo: { tipo, rotulo: p.rotulo, inicio: p.inicio, fim: p.fim },
      geradoEm: agora,
      totais: {
        tokens: tokensTotal,
        tokensDetalhe: { entrada: Math.round(tokensTotal * 0.002), saida: Math.round(tokensTotal * 0.012), escritaCache: Math.round(tokensTotal * 0.06), leituraCache: Math.round(tokensTotal * 0.926) },
        custo: custoTotal,
        tokensSemPreco: 0,
        minutosAtivos: soma('minutosAtivos'),
        sessoes: sessoes.length,
        commits: soma('commits'),
        focoMin,
        pomodoros: Math.floor(focoMin / 25),
        tarefasConcluidas: tipo === 'dia' ? 3 : 14
      },
      anterior: { rotulo: p.anterior, tokens: tokensTotal * 0.9, custo: custoTotal * 0.84, minutosAtivos: soma('minutosAtivos') * 0.89 },
      serie,
      indiceAtual: p.atual,
      pilhas: { projetos: [...PROJETOS.slice(0, 4), 'outros'], minutos, custo },
      projetos,
      modelos: [
        { nome: 'claude-opus-5-5', ferramenta: 'claude', tokens: Math.round(tokensTotal * 0.72), custo: custoTotal * 0.8 },
        { nome: 'claude-sonnet-5-5', ferramenta: 'claude', tokens: Math.round(tokensTotal * 0.18), custo: custoTotal * 0.15 },
        { nome: 'gpt-5-codex', ferramenta: 'codex', tokens: Math.round(tokensTotal * 0.08), custo: null },
        { nome: 'claude-haiku-5-5', ferramenta: 'claude', tokens: Math.round(tokensTotal * 0.02), custo: custoTotal * 0.01 }
      ],
      sessoes,
      commits,
      tarefasConcluidas: [
        { texto: 'Review PR #482 (rate limiting)', feitaEm: agora - 40 * 60000 },
        { texto: 'Reply to the infra thread about staging costs', feitaEm: agora - 150 * 60000 },
        { texto: 'Write release notes for v2.3', feitaEm: agora - 260 * 60000 }
      ]
    }
  }

  window.demoTarefas = () => [
    { id: 't1', texto: 'Ship the rate limiting PR', feita: false, criadaEm: Date.now() - 3e6, feitaEm: null },
    { id: 't2', texto: 'Pair with the mobile team on offline mode', feita: false, criadaEm: Date.now() - 5e6, feitaEm: null },
    { id: 't3', texto: 'Clean up old feature flags', feita: false, criadaEm: Date.now() - 8e6, feitaEm: null },
    { id: 't4', texto: 'Review PR #482 (rate limiting)', feita: true, criadaEm: Date.now() - 9e6, feitaEm: Date.now() - 40 * 60000 },
    { id: 't5', texto: 'Write release notes for v2.3', feita: true, criadaEm: Date.now() - 2e7, feitaEm: Date.now() - 260 * 60000 }
  ]
})()
