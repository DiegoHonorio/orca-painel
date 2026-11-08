// Gera tools/demo/demo.html a partir do painel real (panel/index.html), trocando a API do Orca
// por uma simulada com dados fictícios. Uso: node tools/demo/gerar.mjs
import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const aqui = dirname(fileURLToPath(import.meta.url))
const painel = readFileSync(join(aqui, '../../panel/index.html'), 'utf8')
const demo = painel
  .replace('href="painel.css"', 'href="../../panel/painel.css"')
  .replace('<script src="painel.js"></script>', '<script src="dados.js"></script>\n    <script src="mock.js"></script>\n    <script src="../../panel/painel.js"></script>')
  .replace('<title>Painel de Trabalho</title>', '<title>Painel de Trabalho (demonstração)</title>')
if (demo === painel) throw new Error('panel/index.html mudou: ajuste gerar.mjs')
writeFileSync(join(aqui, 'demo.html'), demo)
console.log('tools/demo/demo.html gerado')
