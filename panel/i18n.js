// Textos do painel em pt-BR, inglês, espanhol e chinês simplificado.
// Valores podem ser funções, para plurais e números.
;(() => {
  const IDIOMAS = ['pt-BR', 'en', 'es', 'zh-CN']

  const pt = {
    iniciarFoco: 'Iniciar foco', pausar: 'Pausar', continuar: 'Continuar', pular: 'Pular', parar: 'Parar',
    pularTitulo: 'Pular para a próxima fase', focoPlaceholder: 'No que você vai focar?',
    pomodoro: 'Pomodoro', focoCiclo: (n, t) => `Foco · ${n} de ${t}`, pausa: 'Pausa', pausaLonga: 'Pausa longa',
    pausado: 'pausado', pronto: 'pronto', deTempo: (t) => `de ${t}`,
    periodo: 'Período', dia: 'Dia', semana: 'Semana', mes: 'Mês',
    periodoAnterior: 'Período anterior', proximoPeriodo: 'Próximo período', atualizar: 'Atualizar',
    hoje: 'Hoje', ontem: 'Ontem', estaSemana: 'Esta semana', semanaPassada: 'Semana passada', esteMes: (m) => `Este mês (${m})`,
    resumo: 'Resumo', sessoes: 'Sessões', commits: 'Commits', tarefas: 'Tarefas',
    tempoAtivo: 'Tempo ativo', foco: 'Foco', custoEstimado: 'Custo estimado', tokens: 'Tokens',
    semComparacao: 'sem comparação', comparadoAnterior: 'Comparado com o período anterior',
    nPomodoros: (n, f) => `${f} ${n === 1 ? 'pomodoro' : 'pomodoros'}`,
    nRepositorios: (n, f) => `${f} ${n === 1 ? 'repositório' : 'repositórios'}`,
    nProjetos: (n, f) => `${f} ${n === 1 ? 'projeto' : 'projetos'}`,
    nCommits: (n, f) => `${f} ${n === 1 ? 'commit' : 'commits'}`,
    nenhum: 'nenhum', ondeFoiTempo: 'Onde foi o tempo', tempoAtivoMin: 'tempo ativo', semAtividade: 'sem atividade',
    nadaRegistrado: 'Nada registrado neste período.', outros: 'outros', semPasta: '(sem pasta)',
    porHora: 'Por hora', porDia: 'Por dia', metricaGrafico: 'Métrica do gráfico',
    total: (v) => `Total: ${v}`, semDados: 'Sem dados no período', agora: 'agora', hojeCurto: 'hoje',
    ultimasSessoes: 'Últimas sessões', verTodas: 'ver todas ›', nenhumaSessao: 'Nenhuma sessão de agente neste período.',
    modelos: 'Modelos', nTokens: (f) => `${f} tokens`, nenhumModelo: 'Nenhum uso de modelo neste período.',
    nota: 'Custo estimado com os preços da API; em plano de assinatura você não paga por token. Tempo ativo conta os períodos com atividade dos agentes (pausas acima de 10 min não contam) e não soma duas vezes agentes em paralelo.',
    semTitulo: '(sem título)', nenhumCommit: 'Nenhum commit seu neste período.', concluidasPeriodo: 'Concluídas no período',
    novaTarefa: 'Nova tarefa…', adicionar: 'Adicionar', limparConcluidas: 'Limpar concluídas',
    nenhumaTarefa: 'Nenhuma tarefa. Adicione o que precisa fazer.', concluida: 'Concluída', removerTarefa: 'Remover tarefa', remover: 'Remover',
    lendo: 'Lendo seu histórico… a primeira vez pode levar alguns segundos.', atualizando: 'Atualizando…',
    erroRelatorio: (e) => `Não consegui montar o relatório: ${e}`, erroPomodoro: (e) => `Pomodoro: ${e}`, erroTarefas: (e) => `Tarefas: ${e}`,
    apiIndisponivel: 'A API do Orca não está disponível neste painel.',
    trabalho: 'Trabalho', sistema: 'Sistema', memoria: 'Memória', top5: 'Top 5', portasAbertas: 'Portas abertas',
    soSuasPortas: 'só dos seus programas', disco: 'Disco', nNucleos: (n) => `${n} núcleos`, memLivre: 'Memória livre',
    emUso: (v, p) => `em uso ${v} · ${p}%`, emUsoCurto: 'em uso', apps: 'apps', buffers: 'buffers', cache: 'cache', livre: 'livre',
    swap: (u, t) => `swap ${u} / ${t}`, programa: 'Programa', memCurto: 'Mem', nProc: (n) => `${n} proc.`,
    agentesIA: 'Agentes de IA agora', nenhumaPorta: 'Nenhuma porta aberta pelos seus programas.',
    naoSuportado: 'Ainda não disponível neste sistema operacional.', portaRede: 'rede',
    portaRedeTitulo: 'Aceita conexões de outras máquinas da rede, não só desta.',
    atualizaCada: (n) => `atualiza a cada ${n} s`, sisPausado: '⏸ pausado', ligadoHa: (d) => `ligado há ${d}`,
    carga: (v) => `carga ${v}`, soComAbaAberta: 'lê só com esta aba aberta', rede: 'Rede', bateria: 'Bateria',
    restantes: (d) => `${d} restantes`, ateCarregar: (d) => `${d} para carregar`, carregando: 'carregando', carregada: 'carregada',
    lendoSistema: 'Lendo…', erroSistema: (e) => `Não consegui ler o sistema: ${e}`
  }

  const en = {
    iniciarFoco: 'Start focus', pausar: 'Pause', continuar: 'Resume', pular: 'Skip', parar: 'Stop',
    pularTitulo: 'Skip to the next phase', focoPlaceholder: 'What will you focus on?',
    pomodoro: 'Pomodoro', focoCiclo: (n, t) => `Focus · ${n} of ${t}`, pausa: 'Break', pausaLonga: 'Long break',
    pausado: 'paused', pronto: 'ready', deTempo: (t) => `of ${t}`,
    periodo: 'Period', dia: 'Day', semana: 'Week', mes: 'Month',
    periodoAnterior: 'Previous period', proximoPeriodo: 'Next period', atualizar: 'Refresh',
    hoje: 'Today', ontem: 'Yesterday', estaSemana: 'This week', semanaPassada: 'Last week', esteMes: (m) => `This month (${m})`,
    resumo: 'Summary', sessoes: 'Sessions', commits: 'Commits', tarefas: 'Tasks',
    tempoAtivo: 'Active time', foco: 'Focus', custoEstimado: 'Estimated cost', tokens: 'Tokens',
    semComparacao: 'no comparison', comparadoAnterior: 'Compared with the previous period',
    nPomodoros: (n, f) => `${f} ${n === 1 ? 'pomodoro' : 'pomodoros'}`,
    nRepositorios: (n, f) => `${f} ${n === 1 ? 'repository' : 'repositories'}`,
    nProjetos: (n, f) => `${f} ${n === 1 ? 'project' : 'projects'}`,
    nCommits: (n, f) => `${f} ${n === 1 ? 'commit' : 'commits'}`,
    nenhum: 'none', ondeFoiTempo: 'Where the time went', tempoAtivoMin: 'active time', semAtividade: 'no activity',
    nadaRegistrado: 'Nothing recorded in this period.', outros: 'others', semPasta: '(no folder)',
    porHora: 'By hour', porDia: 'By day', metricaGrafico: 'Chart metric',
    total: (v) => `Total: ${v}`, semDados: 'No data in this period', agora: 'now', hojeCurto: 'today',
    ultimasSessoes: 'Latest sessions', verTodas: 'see all ›', nenhumaSessao: 'No agent sessions in this period.',
    modelos: 'Models', nTokens: (f) => `${f} tokens`, nenhumModelo: 'No model usage in this period.',
    nota: 'Cost is estimated at API prices; on a subscription plan you don’t pay per token. Active time counts the periods with agent activity (gaps over 10 min don’t count) and never counts parallel agents twice.',
    semTitulo: '(untitled)', nenhumCommit: 'No commits of yours in this period.', concluidasPeriodo: 'Completed in this period',
    novaTarefa: 'New task…', adicionar: 'Add', limparConcluidas: 'Clear completed',
    nenhumaTarefa: 'No tasks yet. Add what you need to do.', concluida: 'Done', removerTarefa: 'Remove task', remover: 'Remove',
    lendo: 'Reading your history… the first time can take a few seconds.', atualizando: 'Refreshing…',
    erroRelatorio: (e) => `Couldn’t build the report: ${e}`, erroPomodoro: (e) => `Pomodoro: ${e}`, erroTarefas: (e) => `Tasks: ${e}`,
    apiIndisponivel: 'The Orca API isn’t available in this panel.',
    trabalho: 'Work', sistema: 'System', memoria: 'Memory', top5: 'Top 5', portasAbertas: 'Open ports',
    soSuasPortas: 'your programs only', disco: 'Disk', nNucleos: (n) => `${n} cores`, memLivre: 'Free memory',
    emUso: (v, p) => `in use ${v} · ${p}%`, emUsoCurto: 'in use', apps: 'apps', buffers: 'buffers', cache: 'cache', livre: 'free',
    swap: (u, t) => `swap ${u} / ${t}`, programa: 'Program', memCurto: 'Mem', nProc: (n) => `${n} proc.`,
    agentesIA: 'AI agents now', nenhumaPorta: 'None of your programs has a port open.',
    naoSuportado: 'Not available on this operating system yet.', portaRede: 'network',
    portaRedeTitulo: 'Accepts connections from other machines on the network, not just this one.',
    atualizaCada: (n) => `refreshes every ${n}s`, sisPausado: '⏸ paused', ligadoHa: (d) => `up ${d}`,
    carga: (v) => `load ${v}`, soComAbaAberta: 'reads only while this tab is open', rede: 'Network', bateria: 'Battery',
    restantes: (d) => `${d} left`, ateCarregar: (d) => `${d} to full`, carregando: 'charging', carregada: 'charged',
    lendoSistema: 'Reading…', erroSistema: (e) => `Couldn’t read the system: ${e}`
  }

  const es = {
    iniciarFoco: 'Iniciar foco', pausar: 'Pausar', continuar: 'Reanudar', pular: 'Saltar', parar: 'Detener',
    pularTitulo: 'Saltar a la siguiente fase', focoPlaceholder: '¿En qué te vas a enfocar?',
    pomodoro: 'Pomodoro', focoCiclo: (n, t) => `Foco · ${n} de ${t}`, pausa: 'Descanso', pausaLonga: 'Descanso largo',
    pausado: 'en pausa', pronto: 'listo', deTempo: (t) => `de ${t}`,
    periodo: 'Período', dia: 'Día', semana: 'Semana', mes: 'Mes',
    periodoAnterior: 'Período anterior', proximoPeriodo: 'Período siguiente', atualizar: 'Actualizar',
    hoje: 'Hoy', ontem: 'Ayer', estaSemana: 'Esta semana', semanaPassada: 'Semana pasada', esteMes: (m) => `Este mes (${m})`,
    resumo: 'Resumen', sessoes: 'Sesiones', commits: 'Commits', tarefas: 'Tareas',
    tempoAtivo: 'Tiempo activo', foco: 'Foco', custoEstimado: 'Costo estimado', tokens: 'Tokens',
    semComparacao: 'sin comparación', comparadoAnterior: 'Comparado con el período anterior',
    nPomodoros: (n, f) => `${f} ${n === 1 ? 'pomodoro' : 'pomodoros'}`,
    nRepositorios: (n, f) => `${f} ${n === 1 ? 'repositorio' : 'repositorios'}`,
    nProjetos: (n, f) => `${f} ${n === 1 ? 'proyecto' : 'proyectos'}`,
    nCommits: (n, f) => `${f} ${n === 1 ? 'commit' : 'commits'}`,
    nenhum: 'ninguno', ondeFoiTempo: 'Dónde se fue el tiempo', tempoAtivoMin: 'tiempo activo', semAtividade: 'sin actividad',
    nadaRegistrado: 'Nada registrado en este período.', outros: 'otros', semPasta: '(sin carpeta)',
    porHora: 'Por hora', porDia: 'Por día', metricaGrafico: 'Métrica del gráfico',
    total: (v) => `Total: ${v}`, semDados: 'Sin datos en el período', agora: 'ahora', hojeCurto: 'hoy',
    ultimasSessoes: 'Últimas sesiones', verTodas: 'ver todas ›', nenhumaSessao: 'Ninguna sesión de agente en este período.',
    modelos: 'Modelos', nTokens: (f) => `${f} tokens`, nenhumModelo: 'Ningún uso de modelos en este período.',
    nota: 'Costo estimado con los precios de la API; con un plan de suscripción no pagas por token. El tiempo activo cuenta los períodos con actividad de los agentes (pausas de más de 10 min no cuentan) y nunca cuenta dos veces agentes en paralelo.',
    semTitulo: '(sin título)', nenhumCommit: 'Ningún commit tuyo en este período.', concluidasPeriodo: 'Completadas en el período',
    novaTarefa: 'Nueva tarea…', adicionar: 'Agregar', limparConcluidas: 'Borrar completadas',
    nenhumaTarefa: 'No hay tareas. Agrega lo que necesitas hacer.', concluida: 'Completada', removerTarefa: 'Quitar tarea', remover: 'Quitar',
    lendo: 'Leyendo tu historial… la primera vez puede tardar unos segundos.', atualizando: 'Actualizando…',
    erroRelatorio: (e) => `No pude armar el informe: ${e}`, erroPomodoro: (e) => `Pomodoro: ${e}`, erroTarefas: (e) => `Tareas: ${e}`,
    apiIndisponivel: 'La API de Orca no está disponible en este panel.',
    trabalho: 'Trabajo', sistema: 'Sistema', memoria: 'Memoria', top5: 'Top 5', portasAbertas: 'Puertos abiertos',
    soSuasPortas: 'solo de tus programas', disco: 'Disco', nNucleos: (n) => `${n} núcleos`, memLivre: 'Memoria libre',
    emUso: (v, p) => `en uso ${v} · ${p}%`, emUsoCurto: 'en uso', apps: 'apps', buffers: 'búferes', cache: 'caché', livre: 'libre',
    swap: (u, t) => `swap ${u} / ${t}`, programa: 'Programa', memCurto: 'Mem', nProc: (n) => `${n} proc.`,
    agentesIA: 'Agentes de IA ahora', nenhumaPorta: 'Ninguno de tus programas tiene puertos abiertos.',
    naoSuportado: 'Todavía no disponible en este sistema operativo.', portaRede: 'red',
    portaRedeTitulo: 'Acepta conexiones de otras máquinas de la red, no solo de esta.',
    atualizaCada: (n) => `se actualiza cada ${n} s`, sisPausado: '⏸ en pausa', ligadoHa: (d) => `encendido hace ${d}`,
    carga: (v) => `carga ${v}`, soComAbaAberta: 'solo lee con esta pestaña abierta', rede: 'Red', bateria: 'Batería',
    restantes: (d) => `quedan ${d}`, ateCarregar: (d) => `${d} para cargar`, carregando: 'cargando', carregada: 'cargada',
    lendoSistema: 'Leyendo…', erroSistema: (e) => `No pude leer el sistema: ${e}`
  }

  const zh = {
    iniciarFoco: '开始专注', pausar: '暂停', continuar: '继续', pular: '跳过', parar: '停止',
    pularTitulo: '跳到下一阶段', focoPlaceholder: '你要专注做什么？',
    pomodoro: '番茄钟', focoCiclo: (n, t) => `专注 · 第 ${n}/${t} 轮`, pausa: '休息', pausaLonga: '长休息',
    pausado: '已暂停', pronto: '就绪', deTempo: (t) => `共 ${t}`,
    periodo: '时间范围', dia: '日', semana: '周', mes: '月',
    periodoAnterior: '上一段', proximoPeriodo: '下一段', atualizar: '刷新',
    hoje: '今天', ontem: '昨天', estaSemana: '本周', semanaPassada: '上周', esteMes: (m) => `本月（${m}）`,
    resumo: '概览', sessoes: '会话', commits: '提交', tarefas: '任务',
    tempoAtivo: '活跃时间', foco: '专注', custoEstimado: '预估费用', tokens: 'Token',
    semComparacao: '无对比', comparadoAnterior: '与上一段相比',
    nPomodoros: (n, f) => `${f} 个番茄`,
    nRepositorios: (n, f) => `${f} 个仓库`,
    nProjetos: (n, f) => `${f} 个项目`,
    nCommits: (n, f) => `${f} 次提交`,
    nenhum: '无', ondeFoiTempo: '时间花在哪里', tempoAtivoMin: '活跃时间', semAtividade: '无活动',
    nadaRegistrado: '此时间段内没有记录。', outros: '其他', semPasta: '（无文件夹）',
    porHora: '按小时', porDia: '按天', metricaGrafico: '图表指标',
    total: (v) => `合计：${v}`, semDados: '此时间段没有数据', agora: '现在', hojeCurto: '今天',
    ultimasSessoes: '最近会话', verTodas: '查看全部 ›', nenhumaSessao: '此时间段没有代理会话。',
    modelos: '模型', nTokens: (f) => `${f} token`, nenhumModelo: '此时间段没有使用模型。',
    nota: '费用按 API 价格估算；订阅套餐不按 token 计费。活跃时间统计代理有活动的时段（超过 10 分钟的间隔不计入），并行的代理不会重复计算。',
    semTitulo: '（无标题）', nenhumCommit: '此时间段没有你的提交。', concluidasPeriodo: '本时间段已完成',
    novaTarefa: '新任务…', adicionar: '添加', limparConcluidas: '清除已完成',
    nenhumaTarefa: '还没有任务。添加你要做的事。', concluida: '已完成', removerTarefa: '删除任务', remover: '删除',
    lendo: '正在读取你的历史记录……第一次可能需要几秒钟。', atualizando: '正在刷新…',
    erroRelatorio: (e) => `无法生成报告：${e}`, erroPomodoro: (e) => `番茄钟：${e}`, erroTarefas: (e) => `任务：${e}`,
    apiIndisponivel: '此面板无法使用 Orca API。',
    trabalho: '工作', sistema: '系统', memoria: '内存', top5: '前 5 名', portasAbertas: '开放端口',
    soSuasPortas: '仅限你的程序', disco: '磁盘', nNucleos: (n) => `${n} 核`, memLivre: '可用内存',
    emUso: (v, p) => `已用 ${v} · ${p}%`, emUsoCurto: '已用', apps: '应用', buffers: '缓冲', cache: '缓存', livre: '空闲',
    swap: (u, t) => `交换 ${u} / ${t}`, programa: '程序', memCurto: '内存', nProc: (n) => `${n} 个进程`,
    agentesIA: '正在运行的 AI 代理', nenhumaPorta: '你的程序没有开放端口。',
    naoSuportado: '此操作系统暂不支持。', portaRede: '网络',
    portaRedeTitulo: '接受网络中其他机器的连接，而不仅是本机。',
    atualizaCada: (n) => `每 ${n} 秒刷新`, sisPausado: '⏸ 已暂停', ligadoHa: (d) => `已运行 ${d}`,
    carga: (v) => `负载 ${v}`, soComAbaAberta: '仅在此标签页打开时读取', rede: '网络', bateria: '电池',
    restantes: (d) => `剩余 ${d}`, ateCarregar: (d) => `${d} 后充满`, carregando: '充电中', carregada: '已充满',
    lendoSistema: '读取中…', erroSistema: (e) => `无法读取系统信息：${e}`
  }

  const TEXTOS = { 'pt-BR': pt, en, es, 'zh-CN': zh }

  /** Escolhe um dos idiomas suportados a partir de uma tag BCP-47 (pt, pt-PT, en-US, zh-Hans…). */
  function resolver(tag) {
    const t = String(tag || '').toLowerCase()
    if (t.startsWith('pt')) return 'pt-BR'
    if (t.startsWith('es')) return 'es'
    if (t.startsWith('zh')) return 'zh-CN'
    if (t.startsWith('en')) return 'en'
    return null
  }

  let atual = 'en'
  window.i18n = {
    IDIOMAS,
    resolver,
    definir(tag) {
      atual = resolver(tag) || 'en'
      document.documentElement.lang = atual
      return atual
    },
    get idioma() {
      return atual
    },
    t(chave, ...args) {
      const v = TEXTOS[atual][chave] ?? TEXTOS.en[chave] ?? chave
      return typeof v === 'function' ? v(...args) : v
    },
    /** Aplica os textos nos elementos com data-i18n (texto) e data-i18n-<atributo>. */
    aplicar(raiz = document) {
      raiz.querySelectorAll('*').forEach((el) => {
        for (const attr of [...el.attributes]) {
          if (attr.name === 'data-i18n') el.textContent = this.t(attr.value)
          else if (attr.name.startsWith('data-i18n-')) el.setAttribute(attr.name.slice(10), this.t(attr.value))
        }
      })
    }
  }
})()
