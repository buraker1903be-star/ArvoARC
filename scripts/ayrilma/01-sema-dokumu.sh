#!/usr/bin/env bash
# ARC ayrılması, aşama 1: eski (ortak) projeden şema dökümü. Yalnızca yapı;
# veri ve sır yok. Bkz. AYRILMA.md.
#
# Kullanım (kendi terminalinizde; adres sohbete ya da depoya yazılmaz):
#   export ESKI_DB_URL='postgresql://postgres.oahshpkgdzrraqdzjqau:<şifre>@aws-0-<bölge>.pooler.supabase.com:5432/postgres'
#   bash scripts/ayrilma/01-sema-dokumu.sh
#
# Adres: Supabase → eski proje → Connect → "Session pooler". Şifre
# veritabanı şifresidir (Project Settings → Database).
set -euo pipefail

PG_DUMP="$(command -v pg_dump || true)"
[ -z "$PG_DUMP" ] && [ -x /opt/homebrew/opt/libpq/bin/pg_dump ] && PG_DUMP=/opt/homebrew/opt/libpq/bin/pg_dump
if [ -z "$PG_DUMP" ]; then
  echo "pg_dump bulunamadı. Kurulum: brew install libpq" >&2
  exit 1
fi
if [ -z "${ESKI_DB_URL:-}" ]; then
  echo "ESKI_DB_URL tanımlı değil (yukarıdaki kullanıma bakın)." >&2
  exit 1
fi

cd "$(dirname "$0")/../.."
mkdir -p .ayrilma
OUT=.ayrilma/eski-sema.sql

"$PG_DUMP" "$ESKI_DB_URL" \
  --schema-only --no-owner \
  --schema=public --schema=private \
  --file="$OUT"

# Depolama politikaları (storage.objects) ayrı: bucket erişim kuralları.
"$PG_DUMP" "$ESKI_DB_URL" --schema-only --no-owner \
  --schema=storage --table='storage.objects' --file=.ayrilma/eski-depo-politikalari.sql

echo "✓ $(wc -l < "$OUT" | tr -d ' ') satır → $OUT"
echo "✓ depo politikaları → .ayrilma/eski-depo-politikalari.sql"
echo "Bu iki dosyada veri ya da şifre yok; Claude'a 'döküm hazır' demeniz yeterli."
