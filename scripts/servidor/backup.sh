#!/usr/bin/env bash
# Cópia do banco (documentos, assinaturas, selfies, provas) e do certificado.
# Guarda 14 dias em /opt/deacordo-backups. Copie essa pasta para fora do servidor com frequência:
# se o servidor sumir, só o que estiver fora dele se salva.
set -euo pipefail
ORIGEM=${ORIGEM:-/opt/deacordo/data}
DESTINO=${DESTINO:-/opt/deacordo-backups}
AGORA=$(date +%Y-%m-%d_%H%M)
mkdir -p "$DESTINO"
chmod 700 "$DESTINO"
if [ -f "$ORIGEM/deacordo.db" ]; then
  # .backup copia o SQLite de forma consistente mesmo com o bot ligado
  sqlite3 "$ORIGEM/deacordo.db" ".backup '$DESTINO/deacordo-$AGORA.db'"
  gzip "$DESTINO/deacordo-$AGORA.db"
fi
[ -f "$ORIGEM/certificado.p12" ] && cp "$ORIGEM/certificado.p12" "$DESTINO/certificado-$AGORA.p12"
find "$DESTINO" -type f -mtime +14 -delete
echo "$AGORA backup ok"
