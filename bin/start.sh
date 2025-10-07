#!/usr/bin/env bash

set -euo pipefail

# Configuração
PORT=${PORT:-3000}
ADDRESS=${ADDRESS:-0.0.0.0}
DOMAIN=${DOMAIN:-}
SECURE=${SECURE:-false}
DEBUG_ENV=${DEBUG:-localtunnel*}

# Diretório do projeto (raiz deste script)
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="${SCRIPT_DIR%/bin}"

cd "$PROJECT_ROOT"

# Pré-requisitos básicos
if ! command -v node >/dev/null 2>&1; then
  echo "Erro: node não encontrado no PATH" >&2
  exit 1
fi

if ! command -v npm >/dev/null 2>&1; then
  echo "Erro: npm não encontrado no PATH" >&2
  exit 1
fi

# Instalar dependências se necessário
if [ ! -d "node_modules" ]; then
  echo "Instalando dependências..."
  npm install --silent
fi

# Limpeza opcional do localenv corrompido (evita JSON parse error)
if [ -f "node_modules/localenv/package.json" ] && ! jq -e . >/dev/null 2>&1 < node_modules/localenv/package.json; then
  echo "Detectado localenv/package.json inválido; reinstalando dependências..."
  rm -rf node_modules package-lock.json
  npm install --silent
fi

export DEBUG="$DEBUG_ENV"

CMD=(node -r esm bin/server --port "$PORT" --address "$ADDRESS")

if [ -n "$DOMAIN" ]; then
  CMD+=(--domain "$DOMAIN")
fi

if [ "$SECURE" = "true" ] || [ "$SECURE" = "1" ]; then
  CMD+=(--secure)
fi

echo "Iniciando localtunnel-server: PORT=$PORT ADDRESS=$ADDRESS DOMAIN=${DOMAIN:-<none>} SECURE=$SECURE"
exec "${CMD[@]}"


