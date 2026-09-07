#!/usr/bin/env bash
# Tarzyeri aktarımını bitene kadar sürdürür.
# Boş XML yanıtında bekleyip tekrar dener; imleç korunduğu için
# kaldığı yerden devam eder.
set -u
ANAHTAR="${1:?Kullanim: ./aktarim.sh ANAHTAR}"
URL="https://arc.arvo-os.com/api/tedarikci/ice-aktar"
BOS=0

for i in $(seq 1 300); do
  Y=$(curl -s -X POST "$URL?mod=tam&anahtar=$ANAHTAR")

  if echo "$Y" | grep -q '"error":"xml_bos"'; then
    BOS=$((BOS + 1))
    echo "  ↳ XML boş (${BOS}. kez), 10 sn bekleniyor"
    if [ "$BOS" -ge 10 ]; then
      echo "Tedarikçi akışı sürekli boş dönüyor. Duruyorum."
      exit 1
    fi
    sleep 10
    continue
  fi

  BOS=0
  echo "$Y"

  echo "$Y" | grep -q '"bitti":true' && { echo "Tamamlandı."; exit 0; }
  echo "$Y" | grep -q '"error"' && { echo "Hata alındı."; exit 1; }
  sleep 1
done

echo "Sınıra ulaşıldı; komutu tekrar çalıştırın."
