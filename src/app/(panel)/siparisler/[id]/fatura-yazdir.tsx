"use client";

/*
  FATURA DÖKÜMÜNÜ YAZDIR / PDF (16.10.2026).

  İLK SÜRÜM BOŞ SAYFA BASIYORDU. Gövdeye sınıf ekleyip her şeyi
  visibility:hidden yapıyor, yalnızca .fatura-belge'yi görünür
  bırakıyordu. Ama belge ekrana SABİTLENMİŞ (position:fixed) ve kendi
  içinde kayan (overflow:auto) bir pencerenin içinde: kâğıtta o kutu tek
  sayfa boyunda kırpılıyor, belge kutunun dışında kalıyordu.

  Artık düğme belgenin bir KOPYASINI panelin en üstüne (#fatura-baski)
  koyuyor ve yazdırma CSS'i (siparis-detay.css) yalnızca o kopyayı
  basıyor; pencere ve panel kâğıda çıkmıyor. Kopya .panel-root'un içinde
  kalıyor ki renk değişkenleri (os-tokens.css → .panel-root) çözülsün.
  Yazdırma bitince (afterprint) kopya ve sınıf kalkıyor.

  PDF için tarayıcının yazdırma penceresinde "PDF olarak kaydet" seçilir —
  ayrı bir PDF kütüphanesi, ekrandaki dökümün ikinci bir kopyası olurdu.
*/
export function FaturaYazdir() {
  return (
    <button
      type="button"
      className="panel-primary"
      onClick={(olay) => {
        const belge = olay.currentTarget.closest(".fatura-pencere")?.querySelector(".fatura-belge");
        const kok = document.querySelector(".panel-root") ?? document.body;
        if (!belge) return;
        document.getElementById("fatura-baski")?.remove();
        const kopya = document.createElement("div");
        kopya.id = "fatura-baski";
        kopya.appendChild(belge.cloneNode(true));
        kok.prepend(kopya);
        document.body.classList.add("fatura-yazdir");
        const temizle = () => {
          document.body.classList.remove("fatura-yazdir");
          kopya.remove();
          window.removeEventListener("afterprint", temizle);
        };
        window.addEventListener("afterprint", temizle);
        window.print();
      }}
    >
      Yazdır / PDF
    </button>
  );
}
