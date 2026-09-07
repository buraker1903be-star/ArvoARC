#!/usr/bin/env bash
# Tarzyeri tam aktarımını bitene kadar tekrarlar.
# Kullanım:  ./aktarim.sh ANAHTARINIZ

set -u
ANAHTAR="${1:?Kullanim: ./aktarim.sh ANAHTARINIZ}"
URL="https://arc.arvo-os.com/api/tedarikci/ice-aktar"

echo "Aktarım başlıyor…"

for i in $(seq 1 60); do
  YANIT=$(curl -s -X POST "$URL?mod=tam&anahtar=$ANAHTAR")
  echo "$YANIT"

  if echo "$YANIT" | grep -q '"bitti":true'; then
    echo "Tamamlandı."
    exit 0
  fi

  if echo "$YANIT" | grep -q '"error"'; then
    echo "Hata alındı, duruyorum."
    exit 1
  fi

  sleep 2
done

echo "60 tur sonunda bitmedi; komutu tekrar çalıştırın."
