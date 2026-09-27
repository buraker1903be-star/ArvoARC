-- MÜŞTERİYE KARGO BİLDİRİMİ: gönderi başına "haber verildi" damgası.
--
-- ÇALIŞTIĞI PROJE: ArvoARC — obaskcdxaaezjglayash (SQL Editor'den elle).
--
-- Bölünmüş kargoda bir siparişin birden çok paketi oluyor ve her paketin
-- kendi takip numarası var. Müşteriye tek bildirim göndermek yanıltıcı:
-- eline geçen pakette siparişin yalnızca bir kısmı olacak ve gerisini
-- kayıp sanacak. Bu yüzden bildirim GÖNDERİ BAŞINA gidiyor.
--
-- Damga neden sütun: takip numarası sonradan da değişebiliyor (etiket
-- gecikmeli geliyor, durum güncellemesi numarayı yazıyor) ve "numara
-- doluysa gönder" kuralı aynı müşteriye aynı paketi birkaç kez
-- duyururdu. Sipariş metadata'sındaki tracking_number tek paketlik eski
-- akışa ait; bölünmüş gönderiyi temsil edemiyor.
--
-- Damga NULL kalırsa bildirim gitmemiş demektir; geçmiş gönderiler de
-- böyle başlıyor ve onlar için bildirim geriye dönük atılmıyor —
-- müşteriye haftalar sonra "siparişiniz kargoda" demek gürültüdür.

alter table public.arc_shipments
  add column if not exists customer_notified_at timestamptz;

comment on column public.arc_shipments.customer_notified_at is
  'Bu paket için müşteriye kargo bildirimi gönderildiği an. NULL: gönderilmedi.';
