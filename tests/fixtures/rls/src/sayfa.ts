/* Panel kodu: politikasız tabloyu kullanıcı oturumuyla okuyor. */
export async function oku(supabase: { from: (t: string) => unknown }) {
  return supabase.from("kopya_tablo");
}
