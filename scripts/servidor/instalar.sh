#!/usr/bin/env bash
# Prepara uma VPS nova (Ubuntu 24.04) para rodar o DeAcordo. Rode como root:
#
#   curl -fsSL https://raw.githubusercontent.com/lenioeu/deacordo/main/scripts/servidor/instalar.sh | bash
#   (ou copie este arquivo para o servidor e rode: bash instalar.sh)
#
# Instala Docker, firewall e sqlite3; baixa o código em /opt/deacordo; agenda o backup diário.
# Não liga o bot: antes, preencha /opt/deacordo/.env (o script mostra o que falta).
set -euo pipefail

PASTA=/opt/deacordo
REPOSITORIO=${REPOSITORIO:-https://github.com/lenioeu/deacordo.git}

[ "$(id -u)" = 0 ] || { echo "Rode como root (sudo -i)."; exit 1; }

echo "==> Pacotes do sistema"
apt-get update -qq
apt-get install -y -qq ca-certificates curl git sqlite3 ufw unattended-upgrades >/dev/null

echo "==> Docker"
command -v docker >/dev/null || curl -fsSL https://get.docker.com | sh

echo "==> Firewall: só SSH, HTTP e HTTPS"
ufw allow OpenSSH >/dev/null
ufw allow 80/tcp >/dev/null
ufw allow 443/tcp >/dev/null
ufw --force enable >/dev/null

echo "==> Código em $PASTA"
if [ -d "$PASTA/.git" ]; then
  git -C "$PASTA" pull --ff-only
else
  # Repositório privado: informe um token do GitHub só com leitura (Settings → Developer settings →
  # Fine-grained tokens → Contents: Read-only). Ele fica guardado só neste servidor.
  if ! git ls-remote "$REPOSITORIO" >/dev/null 2>&1; then
    read -rsp "Token de leitura do GitHub: " TOKEN </dev/tty; echo
    REPOSITORIO="https://x-access-token:${TOKEN}@${REPOSITORIO#https://}"
  fi
  git clone -q "$REPOSITORIO" "$PASTA"
fi
cd "$PASTA"
mkdir -p data
chmod 700 data

if [ ! -f .env ]; then
  cp .env.example .env
  chmod 600 .env
  sed -i "s/^PROXY_SECRET=.*/PROXY_SECRET=$(openssl rand -hex 24)/" .env
  sed -i "s/^CERTIFICATE_PASSWORD=.*/CERTIFICATE_PASSWORD=$(openssl rand -hex 16)/" .env
  sed -i "s/^WHATSAPP_VERIFY_TOKEN=.*/WHATSAPP_VERIFY_TOKEN=$(openssl rand -hex 16)/" .env
fi

echo "==> Backup diário às 3h (guarda 14 dias em /opt/deacordo-backups)"
cat > /etc/cron.d/deacordo-backup <<CRON
0 3 * * * root $PASTA/scripts/servidor/backup.sh >> /var/log/deacordo-backup.log 2>&1
CRON

echo
echo "Pronto. Falta preencher em $PASTA/.env:"
grep -nE '^(AUTHORIZED_SENDERS|SENDER_DISPLAY_NAME|SENDER_LOCATION|WHATSAPP_TOKEN|WHATSAPP_PHONE_NUMBER_ID|WHATSAPP_APP_SECRET|ANTHROPIC_API_KEY)=' .env || true
echo
echo "Depois: cd $PASTA && docker compose up -d --build"
echo "Senha para o Cloudflare Pages (variável PROXY_SEGREDO): $(grep ^PROXY_SECRET= .env | cut -d= -f2)"
