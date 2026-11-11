#!/usr/bin/env bash
# Baixa a versão mais nova do código e reinicia o bot, sem perder dados (ficam em data/).
#   bash /opt/deacordo/scripts/servidor/atualizar.sh
set -euo pipefail
cd /opt/deacordo
"$(dirname "$0")/backup.sh"
git pull --ff-only
docker compose up -d --build
docker image prune -f >/dev/null
sleep 5
docker compose ps
