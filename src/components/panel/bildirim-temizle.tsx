"use client";

import { useEffect } from "react";
import { BILDIRIM_CEREZI } from "@/lib/panel-bildirim-cerez";

/*
  Bildirim çerezini gösterildikten sonra siler.

  Silinmezse çerez ömrü (60 sn) boyunca her yenilemede aynı mesaj çıkar
  ve kullanıcı işlemi ikinci kez yaptığını sanır — hata mesajında bu
  daha da yanıltıcı: düzelttiği hatayı düzelmemiş görür.
*/
export function BildirimTemizle() {
  useEffect(() => {
    document.cookie = `${BILDIRIM_CEREZI}=; Max-Age=0; path=/`;
  }, []);
  return null;
}
