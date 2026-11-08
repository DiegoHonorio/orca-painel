#!/usr/bin/env bash
# Gera a capa e os prints do catálogo em media/ usando SOMENTE dados fictícios
# (tools/demo/dados.js). Nunca usa os dados reais de quem roda o script.
#
# Precisa de: node, ImageMagick (magick) e um Chrome/Chromium.
# Uso: CHROME=/caminho/do/chrome tools/prints.sh
set -euo pipefail

raiz="$(cd "$(dirname "$0")/.." && pwd)"
chrome="${CHROME:-$(command -v chromium || command -v google-chrome || command -v chromium-browser || true)}"
if [[ -z "$chrome" ]]; then
  echo "Chrome não encontrado: defina CHROME=/caminho/do/chrome" >&2
  exit 1
fi

node "$raiz/tools/demo/gerar.mjs"
tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT

foto() { # modo, escala, saída
  "$chrome" ${CHROME_FLAGS:-} --headless=new --disable-gpu --hide-scrollbars --allow-file-access-from-files \
    --force-device-scale-factor="$2" --window-size=1600,1000 --virtual-time-budget=4000 \
    --screenshot="$tmp/$1.png" "file://$raiz/tools/demo/vitrine.html?modo=$1" >/dev/null 2>&1
  magick "$tmp/$1.png" -crop "$((1600 * ${2%.*}))x$((1000 * ${2%.*}))+0+0" +repage -strip -quality 88 "$3"
}

mkdir -p "$raiz/media"
foto capa 1 "$raiz/media/cover.png"
foto resumo 1 "$raiz/media/screenshot-resumo.png"
foto historico 1 "$raiz/media/screenshot-historico.png"
foto foco 1 "$raiz/media/screenshot-foco.png"
rsvg-convert -w 256 -h 256 "$raiz/media/icon.svg" -o "$raiz/media/icon.png" 2>/dev/null || true
ls -la "$raiz/media"
