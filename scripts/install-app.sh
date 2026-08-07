#!/usr/bin/env bash
set -euo pipefail

APP_ID="${1:-frp-tunnel}"
ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
APP_DIR="$ROOT_DIR/apps/$APP_ID"

if [[ ! -d "$APP_DIR" ]]; then
  echo "App $APP_ID não encontrado em $APP_DIR"
  exit 1
fi

mkdir -p /opt/container-apps/$APP_ID
cp -r "$APP_DIR"/* /opt/container-apps/$APP_ID/

if command -v docker >/dev/null 2>&1; then
  docker compose -f /opt/container-apps/$APP_ID/docker-compose.yml up -d
else
  echo "Docker não encontrado no servidor."
  exit 1
fi

echo "Instalação concluída para $APP_ID"
