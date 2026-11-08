// Placas de vídeo. Linux: /sys/class/drm, e `nvidia-smi` para NVIDIA. macOS: `ioreg`.
// Uma GPU dedicada em repouso (notebooks híbridos) não é consultada: consultar a acordaria e gastaria bateria.
import { readdirSync, readlinkSync } from 'node:fs'
import { basename } from 'node:path'
import type { SistemaGpu } from '../protocol.ts'
import { LINUX, MAC, executar, lerTexto } from './util.ts'

const MB = 1024 * 1024

type Placa = { card: string; fabricante: SistemaGpu['fabricante']; pci: string; dormindo: boolean }

function placasLinux(): Placa[] {
  let nomes: string[]
  try {
    nomes = readdirSync('/sys/class/drm').filter((n) => /^card\d+$/.test(n))
  } catch {
    return []
  }
  const placas: Placa[] = []
  const vistas = new Set<string>()
  for (const card of nomes) {
    const base = `/sys/class/drm/${card}/device`
    const vendor = lerTexto(`${base}/vendor`)?.trim()
    const fabricante = vendor === '0x10de' ? 'nvidia' : vendor === '0x1002' ? 'amd' : vendor === '0x8086' ? 'intel' : null
    if (!fabricante) continue
    let pci = card
    try {
      pci = basename(readlinkSync(base))
    } catch {
      // sem link: usa o nome do card
    }
    if (vistas.has(pci)) continue
    vistas.add(pci)
    const dormindo = lerTexto(`${base}/power/runtime_status`)?.trim() === 'suspended'
    placas.push({ card, fabricante, pci, dormindo })
  }
  return placas
}

const NOMES: Record<SistemaGpu['fabricante'], string> = { nvidia: 'NVIDIA', amd: 'AMD', intel: 'Intel', apple: 'Apple' }

function vazia(p: Placa): SistemaGpu {
  return { nome: NOMES[p.fabricante], fabricante: p.fabricante, uso: null, memUsada: null, memTotal: null, temp: null, watts: null, freqMhz: null, freqMaxMhz: null, dormindo: p.dormindo, processos: [] }
}

function amd(p: Placa): SistemaGpu {
  const g = vazia(p)
  if (p.dormindo) return g
  const base = `/sys/class/drm/${p.card}/device`
  const n = (arq: string) => {
    const v = Number(lerTexto(`${base}/${arq}`))
    return Number.isFinite(v) && lerTexto(`${base}/${arq}`) !== null ? v : null
  }
  g.uso = n('gpu_busy_percent')
  g.memUsada = n('mem_info_vram_used')
  g.memTotal = n('mem_info_vram_total')
  try {
    const hw = readdirSync(`${base}/hwmon`)[0]
    if (hw) {
      const temp = Number(lerTexto(`${base}/hwmon/${hw}/temp1_input`))
      if (temp) g.temp = temp / 1000
      const watts = Number(lerTexto(`${base}/hwmon/${hw}/power1_average`) ?? lerTexto(`${base}/hwmon/${hw}/power1_input`))
      if (watts) g.watts = watts / 1e6
    }
  } catch {
    // sem sensores
  }
  return g
}

function intel(p: Placa): SistemaGpu {
  // a Intel não expõe % de uso sem root; a frequência atual mostra o quanto está trabalhando
  const g = vazia(p)
  const n = (arq: string) => Number(lerTexto(`/sys/class/drm/${p.card}/${arq}`)) || null
  g.freqMhz = n('gt_act_freq_mhz') ?? n('gt_cur_freq_mhz')
  g.freqMaxMhz = n('gt_max_freq_mhz') ?? n('gt_RP0_freq_mhz')
  return g
}

// Com a GPU NVIDIA sem nenhum programa, consulta com menos frequência para ela poder dormir.
let ultimaNvidia = 0
let nvidiaOcupada = true
let cacheNvidia: SistemaGpu[] = []

async function nvidia(placas: Placa[]): Promise<SistemaGpu[]> {
  if (placas.every((p) => p.dormindo)) {
    nvidiaOcupada = false
    return placas.map(vazia)
  }
  const agora = Date.now()
  if (!nvidiaOcupada && agora - ultimaNvidia < 30_000 && cacheNvidia.length) return cacheNvidia
  const [gpus, apps] = await Promise.all([
    executar('nvidia-smi', ['--query-gpu=pci.bus_id,name,utilization.gpu,memory.used,memory.total,temperature.gpu,power.draw', '--format=csv,noheader,nounits']),
    executar('nvidia-smi', ['--query-compute-apps=gpu_bus_id,process_name,used_memory', '--format=csv,noheader,nounits'])
  ])
  if (!gpus) return placas.map(vazia)
  const num = (v: string | undefined) => {
    const x = Number(v?.trim())
    return Number.isFinite(x) && v?.trim() !== '' ? x : null
  }
  const porBus = new Map<string, { nome: string; mem: number }[]>()
  for (const linha of (apps ?? '').split('\n').filter(Boolean)) {
    const [bus, proc, mem] = linha.split(',').map((x) => x.trim())
    if (!bus || !proc) continue
    const lista = porBus.get(bus.toLowerCase()) ?? []
    lista.push({ nome: basename(proc), mem: (num(mem) ?? 0) * MB })
    porBus.set(bus.toLowerCase(), lista)
  }
  const lidas = gpus
    .split('\n')
    .filter(Boolean)
    .map((linha) => {
      const [bus, nome, uso, usada, total, temp, watts] = linha.split(',').map((x) => x.trim())
      const processos = (porBus.get((bus ?? '').toLowerCase()) ?? []).sort((a, b) => b.mem - a.mem).slice(0, 5)
      const g: SistemaGpu = {
        nome: (nome ?? 'NVIDIA').replace(/^NVIDIA\s+/, ''),
        fabricante: 'nvidia',
        uso: num(uso),
        memUsada: num(usada) === null ? null : (num(usada) as number) * MB,
        memTotal: num(total) === null ? null : (num(total) as number) * MB,
        temp: num(temp),
        watts: num(watts),
        freqMhz: null,
        freqMaxMhz: null,
        dormindo: false,
        processos
      }
      return g
    })
  ultimaNvidia = agora
  nvidiaOcupada = lidas.some((g) => g.processos.length > 0 || (g.uso ?? 0) > 0)
  cacheNvidia = lidas
  return lidas
}

async function mac(): Promise<SistemaGpu[]> {
  const saida = await executar('ioreg', ['-r', '-d', '1', '-w', '0', '-c', 'IOAccelerator'])
  if (!saida) return []
  const blocos = saida.split(/\n(?=\+-o )/).filter((b) => b.includes('PerformanceStatistics'))
  return blocos.map((b) => {
    const n = (chave: string) => {
      const m = b.match(new RegExp(`"${chave}"=(\\d+)`))
      return m ? Number(m[1]) : null
    }
    const modelo = b.match(/"model"\s*=\s*"([^"]+)"/)?.[1] ?? b.match(/"model"\s*=\s*<"([^"]+)">/)?.[1]
    return {
      nome: modelo ?? 'GPU',
      fabricante: 'apple' as const,
      uso: n('Device Utilization %'),
      memUsada: n('In use system memory'),
      memTotal: null,
      temp: null,
      watts: null,
      freqMhz: null,
      freqMaxMhz: null,
      dormindo: false,
      processos: []
    }
  })
}

/** GPUs com uso, memória e temperatura quando o sistema informa. null quando não é suportado. */
export async function lerGpus(): Promise<SistemaGpu[] | null> {
  if (MAC) return mac()
  if (!LINUX) return null
  const placas = placasLinux()
  const nv = placas.filter((p) => p.fabricante === 'nvidia')
  const lista = [...(nv.length ? await nvidia(nv) : []), ...placas.filter((p) => p.fabricante === 'amd').map(amd), ...placas.filter((p) => p.fabricante === 'intel').map(intel)]
  // dedicada primeiro; a integrada por último
  return lista
}
