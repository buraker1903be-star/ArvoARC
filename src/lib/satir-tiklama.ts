/* Kaynak: ArvoOS/lib/satir-tiklama.ts (16.10.2026, ArvoARC paneli ArvoOS'un bileşenleriyle yeniden yazılıyor). */
/*
  Satıra yapılan tıklamanın ne yapacağı (app/panel/crm/satir-tiklama.tsx).
  Saf: testi tests/unit/satir-tiklama.test.ts.

  Eskiden değiştirici tuşlara bakılmıyordu: satırın boş bir yerine
  Ctrl/Cmd ile tıklamak kaydı yeni sekmede değil AYNI sekmede açıyordu —
  listeden birkaç kaydı sekmelere açan kişi listeyi kaybediyordu. Kayıt
  bağlantısının kendisine yapılan tıklamada tarayıcı bunu zaten doğru
  yapıyor; satır da aynı davransın.
*/
export type SatirTiklamaKipi = "yoksay" | "ayni-sekme" | "yeni-sekme" | "yeni-pencere";

export function satirTiklamaKipi(olay: {
  button: number;
  ctrlKey: boolean;
  metaKey: boolean;
  shiftKey: boolean;
  altKey: boolean;
  defaultPrevented: boolean;
}): SatirTiklamaKipi {
  // Başka bir dinleyici işi üstlendiyse ya da sol tık değilse karışmıyoruz.
  if (olay.defaultPrevented || olay.button !== 0) return "yoksay";
  // Alt+tık tarayıcıda "indir" demek; satır için anlamı yok.
  if (olay.altKey) return "yoksay";
  if (olay.ctrlKey || olay.metaKey) return "yeni-sekme";
  if (olay.shiftKey) return "yeni-pencere";
  return "ayni-sekme";
}
