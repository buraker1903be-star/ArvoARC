// Koşullu süzgeç: denetim 27.09.2026'ya kadar bu satırları hiç görmüyordu.
export async function listele(supabase: any, aralik: string | null, kisi: string) {
  let sorgu = supabase.from("oturum_kayitlari").select("id,user_id,login_at");
  if (aralik) sorgu = sorgu.gte("login_at", aralik);
  if (kisi) sorgu = sorgu.eq("kullanici_id", kisi);
  return sorgu.order("giris_zamani", { ascending: false });
}
