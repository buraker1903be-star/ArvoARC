"use client";

import { usePathname, useSearchParams } from "next/navigation";
import { Icon } from "./icons";

/*
  Genel arama. Sipariş, ürün, müşteri ve koleksiyon tek kutudan
  aranır; sonuçlar /ara sayfasında.

  Düz bir GET formu: JavaScript yüklenmeden de çalışır ve paletin
  olmadığı durumda aramanın tek yolu bu.

  ⌘K / Ctrl+K ve "/" ARTIK BU KUTUYU ODAKLAMIYOR, komut paletini
  açıyor (components/panel/komut-paleti.tsx). Kısayol iki yerde
  dinlenirse ikisi de tepki verir; palet zaten bu kutunun yaptığı işi
  kapsıyor ve üstüne sayfa/işlem gezinmesi ekliyor.
*/
export function TopbarSearch() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const current = pathname === "/ara" ? searchParams.get("q") ?? "" : "";

  return (
    <form action="/ara" className="panel-search" role="search">
      <Icon name="search" size={16} />
      <input key={current} name="q" defaultValue={current} placeholder="Sipariş, ürün, müşteri ara" aria-label="Panelde ara" autoComplete="off" maxLength={80} />
      <kbd aria-hidden="true">⌘K</kbd>
    </form>
  );
}
