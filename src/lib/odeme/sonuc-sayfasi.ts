import { NextResponse } from "next/server";
import { odemeSonucuHtml } from "./sonuc-metni";

/*
  ÖDEME DÖNÜŞÜNDE SON ÇARE SAYFASI (17.10.2026).

  Kart dönüşü (Garanti, Tami) müşteriyi MAĞAZANIN adresine yönlendirir;
  o adres siparişin kaydından okunuyor. Kayıt okunamazsa yönlendirilecek
  yer de yok ve iki dosya iki ayrı şey yapıyordu: biri arvo-os.com'un
  köküne atıyor (yol düşüyor, müşteri hiçbir şey anlamıyor), öteki
  pazarlama sitesine var olmayan bir yolu ekliyordu (404).

  İkisi de müşterinin kartından para çekilmiş OLABİLECEĞİ bir anda
  oluyor. "Ödemeniz alınamadı" demek yanlış olur — bilmiyoruz. Bu
  sayfa tam olarak bunu söylüyor ve referansı veriyor; arama
  yapıldığında kaydı bulmak için o referans yeter.

  Sayfa kendi içinde duruyor: vitrine ya da panele bağımlı değil,
  çünkü ikisine de ulaşamadığımız durumda gösteriliyor.
*/
export function odemeSonucuSayfasi(girdi: { baslik: string; mesaj: string; referans?: string }) {
  return new NextResponse(odemeSonucuHtml(girdi), {
    status: 200,
    headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" },
  });
}

/** Siparişin kaydı okunamadı: para çekilmiş olabilir, bilmiyoruz. */
export const dogrulanamadiSayfasi = (referans: string) =>
  odemeSonucuSayfasi({
    baslik: "Ödemenizin sonucu doğrulanamadı",
    mesaj:
      "Bankadan dönüş alındı ama sipariş kaydınıza şu anda ulaşılamıyor. Kartınızdan çekim yapıldıysa siparişiniz ekibimizce tamamlanacak; bu sayfayı kapatabilirsiniz. Emin olmak için aşağıdaki referansla bize yazın.",
    referans,
  });
