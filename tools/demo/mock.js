// API do Orca simulada para a demonstração: responde ao painel com os dados fictícios de dados.js.
// Use ?tipo=dia|semana|mes&aba=resumo|sessoes|commits|tarefas&pomo=foco|pausa|parado&metrica=minutos|custo|...
;(() => {
  const q = new URLSearchParams(location.search)
  const tipo = q.get('tipo') || 'dia'
  const pomo = q.get('pomo') || 'foco'
  const agora = Date.now()
  const estados = {
    parado: { fase: 'parado', rodando: false, fimEm: null, restanteMs: null, duracaoMs: 0, inicioFase: null, rotulo: '', ciclos: 1, pausaLonga: false },
    foco: { fase: 'foco', rodando: true, fimEm: agora + 18 * 60000 + 42000, restanteMs: null, duracaoMs: 25 * 60000, inicioFase: agora - 6 * 60000, rotulo: 'Ship the rate limiting PR', ciclos: 1, pausaLonga: false },
    pausa: { fase: 'pausa', rodando: true, fimEm: agora + 3 * 60000 + 10000, restanteMs: null, duracaoMs: 5 * 60000, inicioFase: agora - 2 * 60000, rotulo: 'Ship the rate limiting PR', ciclos: 2, pausaLonga: false }
  }
  const respostas = {
    'relatorio.obter': (e) => window.demoRelatorio(e.tipo),
    'pomodoro.obter': () => estados[pomo],
    'pomodoro.acao': () => estados[pomo],
    'tarefas.obter': () => window.demoTarefas(),
    'tarefas.alterar': () => window.demoTarefas()
  }
  window.orca = {
    api: { major: 1, minor: 4 },
    plugin: {
      request: async (nome, entrada) => respostas[nome](entrada || {}),
      on: () => ({ dispose() {} })
    }
  }
  window.addEventListener('load', () => {
    // aplica o período e a aba pedidos na URL clicando nos próprios controles do painel
    setTimeout(() => {
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
