#!/usr/bin/env bash
# Stok senkronunu bitene kadar sürdürür.
# Kullanım:  ./stok.sh ANAHTARINIZ
set -u
ANAHTAR="${1:?Kullanim: ./stok.sh ANAHTAR}"
URL="https://arc.arvo-os.com/api/tedarikci/ice-aktar"
BOS=0

for i in $(seq 1 300); do
  Y=$(curl -s -X POST "$URL?anahtar=$ANAHTAR")

  if echo "$Y" | grep -q '"error":"xml_bos"'; then
    BOS=$((BOS + 1))
    echo "  ↳ XML boş (${BOS}. kez), 10 sn bekleniyor"
    [ "$BOS" -ge 10 ] && { echo "Akış sürekli boş. Duruyorum."; exit 1; }
    sleep 10
    continue
  fi

  BOS=0
  echo "$Y"
  echo "$Y" | grep -q '"bitti":true' && { echo "Stok senkronu tamamlandı."; exit 0; }
  echo "$Y" | grep -q '"error"' && { echo "Hata alındı."; exit 1; }
  sleep 1
done
