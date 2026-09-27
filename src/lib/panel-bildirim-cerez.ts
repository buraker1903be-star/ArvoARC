/*
  Bildirim çerezinin adı. Sunucu tarafı (lib/panel-bildirim.ts) ve
  tarayıcı tarafı (components/panel/bildirim-temizle.tsx) aynı adı
  kullanmak zorunda; ad sunucu modülünde kalsaydı "server-only" koruması
  istemci paketine sızmayı derleme anında engellerdi.
*/
export const BILDIRIM_CEREZI = "arc_bildirim";
