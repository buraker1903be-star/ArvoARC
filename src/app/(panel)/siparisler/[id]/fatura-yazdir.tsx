"use client";

/*
  FATURA DÖKÜMÜNÜ YAZDIR / PDF (16.10.2026). Döküm bir pencerede ve sayfa
  yazdırılınca pencerenin arkasındaki panel de kâğıda çıkıyordu. Düğme
  gövdeye bir sınıf ekleyip yazdırıyor; siparis-detay.css o sınıf varken
  YALNIZCA .fatura-belge'yi gösteriyor. PDF için tarayıcının yazdırma
  penceresinde "PDF olarak kaydet" seçilir — ayrı bir PDF kütüphanesi,
  ekrandaki dökümün ikinci bir kopyası olurdu.

  Sınıf afterprint'te kalkıyor: kalmasa sonraki Ctrl+P yine yalnızca
  dökümü basardı.
*/
export function FaturaYazdir() {
  return (
    <button
      type="button"
      className="panel-primary"
      onClick={() => {
        document.body.classList.add("fatura-yazdir");
        const kaldir = () => {
          document.body.classList.remove("fatura-yazdir");
          window.removeEventListener("afterprint", kaldir);
        };
        window.addEventListener("afterprint", kaldir);
        window.print();
      }}
    >
      Yazdır / PDF
    </button>
  );
}
