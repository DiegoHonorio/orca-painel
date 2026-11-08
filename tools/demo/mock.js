// API do Orca simulada para a demonstração: responde ao painel com os dados fictícios de dados.js.
// Use ?tipo=dia|semana|mes&aba=resumo|sessoes|commits|tarefas&pomo=foco|pausa|parado&metrica=minutos|custo|...
;(() => {
  const q = new URLSearchParams(location.search)
  const tipo = q.get('tipo') || 'dia'
  const pomo = q.get('pomo') || 'foco'
  const lang = q.get('lang') || 'en'
  const agora = Date.now()
  const estados = {
    parado: { fase: 'parado', rodando: false, fimEm: null, restanteMs: null, duracaoMs: 0, inicioFase: null, rotulo: '', ciclos: 1, pausaLonga: false },
    foco: { fase: 'foco', rodando: true, fimEm: agora + 18 * 60000 + 42000, restanteMs: null, duracaoMs: 25 * 60000, inicioFase: agora - 6 * 60000, rotulo: 'Ship the rate limiting PR', ciclos: 1, pausaLonga: false },
    pausa: { fase: 'pausa', rodando: true, fimEm: agora + 3 * 60000 + 10000, restanteMs: null, duracaoMs: 5 * 60000, inicioFase: agora - 2 * 60000, rotulo: 'Ship the rate limiting PR', ciclos: 2, pausaLonga: false }
  }
  // aba Sistema: valores fictícios, iguais em toda máquina
  const GB = 1024 ** 3
  const MB = 1024 ** 2
  const onda = (i, base, amp) => base + Math.sin(i / 3) * amp + Math.sin(i / 1.3) * amp * 0.4
  const cpuHist = Array.from({ length: 40 }, (_, i) => onda(i, 24, 9))
  const gpuHist = Array.from({ length: 40 }, (_, i) => onda(i, 18, 10))
  const memHist = Array.from({ length: 40 }, (_, i) => onda(i, 58, 1.5))
  const sistema = (e) => ({
    cpu: { total: cpuHist.at(-1), nucleos: [31, 18, 64, 22, 12, 27, 9, 19, 35, 14, 21, 8] },
    mem: { total: 32 * GB, disponivel: 13.4 * GB, apps: 16.3 * GB, buffers: 0.6 * GB, cache: 5.8 * GB, livre: 9.3 * GB, swapTotal: 8 * GB, swapUsado: 0.4 * GB },
    carga: [1.82, 1.64, 1.4],
    ligadoHaS: 3 * 86400 + 4 * 3600,
    processos: [
      { nome: 'orca', processos: 12, cpu: 6.8, mem: 2.9 * GB, agente: false },
      { nome: 'node', processos: 7, cpu: 5.1, mem: 1.2 * GB, agente: false },
      { nome: 'claude', processos: 3, cpu: 3.9, mem: 1.4 * GB, agente: true },
      { nome: 'chrome', processos: 38, cpu: 3.2, mem: 4.8 * GB, agente: false },
      { nome: 'postgres', processos: 9, cpu: 1.1, mem: 640 * MB, agente: false },
      { nome: 'codex', processos: 1, cpu: 0.9, mem: 610 * MB, agente: true },
      { nome: 'slack', processos: 6, cpu: 0.6, mem: 1.1 * GB, agente: false }
    ],
    gpus: [
      { nome: 'GeForce RTX 4060 Laptop GPU', fabricante: 'nvidia', uso: gpuHist.at(-1), memUsada: 2.1 * GB, memTotal: 8 * GB, temp: 54, watts: 18.4, freqMhz: null, freqMaxMhz: null, dormindo: false, processos: [{ nome: 'orca', mem: 412 * MB }, { nome: 'chrome', mem: 286 * MB }] }
    ],
    ...(e.portas ? { portas: [
      { porta: 3000, programa: 'node', projeto: 'web-app', desde: agora - 2 * 3600000, publica: false },
      { porta: 5173, programa: 'node', projeto: 'docs-site', desde: agora - 3 * 86400000, publica: false },
      { porta: 5432, programa: 'postgres', projeto: null, desde: agora - 3 * 86400000, publica: false },
      { porta: 8080, programa: 'node', projeto: 'api-gateway', desde: agora - 40 * 60000, publica: true }
    ] } : {}),
    ...(e.discos ? { discos: [{ nome: '/', total: 1000 * GB, usado: 612 * GB }] } : {}),
    intervaloS: 3
  })

  const respostas = {
    'sistema.obter': sistema,
    'sistema.faixa': () => ({ rede: { rx: 1.4 * MB, tx: 212 * 1024 }, bateria: { pct: 78, carregando: false, cheia: false, minutos: 192 } }),
    'relatorio.obter': (e) => window.demoRelatorio(e.tipo),
    'pomodoro.obter': () => estados[pomo],
    'pomodoro.acao': () => estados[pomo],
    'idioma.sincronizar': () => ({ idioma: lang }),
    'tarefas.obter': () => window.demoTarefas(),
    'tarefas.alterar': () => window.demoTarefas()
  }
  window.orca = {
    api: { major: 1, minor: 4 },
    locale: lang,
    plugin: {
      request: async (nome, entrada) => respostas[nome](entrada || {}),
      on: () => ({ dispose() {} })
    }
  }
  window.addEventListener('load', () => {
    // aplica o período e a aba pedidos na URL clicando nos próprios controles do painel
    setTimeout(() => {
      if (q.get('visao') === 'sistema') {
        document.querySelector('.menu button[data-visao="sistema"]')?.click()
        setTimeout(() => window.sistemaPainel?.preencherHistorico(cpuHist, memHist, [gpuHist]), 100)
      } else document.querySelector('.menu button[data-visao="trabalho"]')?.click()
      document.querySelector(`.seg .s button[data-tipo="${tipo}"]`)?.click()
      const aba = q.get('aba')
      if (aba) document.querySelector(`.abas button[data-aba="${aba}"]`)?.click()
      const metrica = q.get('metrica')
      if (metrica) {
        const sel = document.getElementById('metrica')
        sel.value = metrica
        sel.dispatchEvent(new Event('change'))
      }
    }, 50)
  })
})()
