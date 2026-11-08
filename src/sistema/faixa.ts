// Rede (bytes por segundo) e bateria, para a faixa que aparece em todas as abas.
// Linux: /proc/net/dev e /sys/class/power_supply. macOS: `netstat -ibn` e `pmset -g batt`.
import { readdirSync } from 'node:fs'
import type { SistemaFaixa } from '../protocol.ts'
import { LINUX, MAC, executar, lerTexto } from './util.ts'

// interfaces virtuais (contêineres, VMs, VPN interna) contariam o mesmo tráfego duas vezes
const VIRTUAL = /^(lo|lo0|docker|veth|br-|virbr|vmnet|vboxnet|cni|flannel|tailscale|utun|awdl|llw|bridge|gif|stf|anpi|ap\d)/

let anterior: { rx: number; tx: number; t: number } | null = null

async function contadoresRede(): Promise<{ rx: number; tx: number } | null> {
  if (LINUX) {
    const txt = lerTexto('/proc/net/dev')
    if (!txt) return null
    let rx = 0
    let tx = 0
    for (const linha of txt.split('\n').slice(2)) {
      const [nome, resto] = linha.split(':')
      if (!resto || VIRTUAL.test(nome?.trim() ?? '')) continue
      const c = resto.trim().split(/\s+/).map(Number)
      rx += c[0] ?? 0
      tx += c[8] ?? 0
    }
    return { rx, tx }
  }
  if (MAC) {
    const saida = await executar('netstat', ['-ibn'])
    if (!saida) return null
    let rx = 0
    let tx = 0
    const vistas = new Set<string>()
    for (const linha of saida.split('\n').slice(1)) {
      const c = linha.trim().split(/\s+/)
      const nome = c[0] ?? ''
      if (!c[2]?.startsWith('<Link#') || VIRTUAL.test(nome) || vistas.has(nome)) continue
      vistas.add(nome)
      // contando da direita: ... Ibytes Opkts Oerrs Obytes Coll
      rx += Number(c[c.length - 5]) || 0
      tx += Number(c[c.length - 2]) || 0
    }
    return { rx, tx }
  }
  return null
}

async function rede(): Promise<SistemaFaixa['rede']> {
  const c = await contadoresRede()
  if (!c) return null
  const agora = Date.now()
  const antes = anterior
  anterior = { ...c, t: agora }
  if (!antes || agora - antes.t < 500) return { rx: 0, tx: 0 }
  const s = (agora - antes.t) / 1000
  return { rx: Math.max(0, (c.rx - antes.rx) / s), tx: Math.max(0, (c.tx - antes.tx) / s) }
}

function bateriaLinux(): SistemaFaixa['bateria'] {
  let pastas: string[]
  try {
    pastas = readdirSync('/sys/class/power_supply')
  } catch {
    return null
  }
  for (const p of pastas) {
    const base = `/sys/class/power_supply/${p}`
    if (lerTexto(`${base}/type`)?.trim() !== 'Battery') continue
    const pct = Number(lerTexto(`${base}/capacity`))
    if (!Number.isFinite(pct)) continue
    const status = lerTexto(`${base}/status`)?.trim() ?? ''
    const num = (n: string) => Number(lerTexto(`${base}/${n}`)) || 0
    // energy_* (µWh) com power_now (µW), ou charge_* (µAh) com current_now (µA)
    const agora = num('energy_now') || num('charge_now')
    const cheio = num('energy_full') || num('charge_full')
    const fluxo = num('power_now') || num('current_now')
    const carregando = status === 'Charging'
    let minutos: number | null = null
    if (fluxo > 0 && status === 'Discharging') minutos = (agora / fluxo) * 60
    else if (fluxo > 0 && carregando && cheio > agora) minutos = ((cheio - agora) / fluxo) * 60
    return { pct, carregando, cheia: status === 'Full', minutos: minutos && minutos < 48 * 60 ? Math.round(minutos) : null }
  }
  return null
}

async function bateriaMac(): Promise<SistemaFaixa['bateria']> {
  const saida = await executar('pmset', ['-g', 'batt'])
  const m = saida?.match(/(\d+)%;\s*([a-z ]+);\s*(\d+:\d+)?/i)
  if (!m) return null
  const status = (m[2] ?? '').trim().toLowerCase()
  const [h, min] = (m[3] ?? '').split(':').map(Number)
  return {
    pct: Number(m[1]),
    carregando: status === 'charging',
    cheia: status === 'charged',
    minutos: m[3] && Number.isFinite(h) ? (h ?? 0) * 60 + (min ?? 0) : null
  }
}

export async function lerFaixa(): Promise<SistemaFaixa> {
  const [r, b] = await Promise.all([rede(), LINUX ? bateriaLinux() : MAC ? bateriaMac() : null])
  return { rede: r, bateria: b }
}
