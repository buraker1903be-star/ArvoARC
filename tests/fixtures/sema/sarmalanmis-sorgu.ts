// Sorgu bir fonksiyona sarılı. Sütun ONUN tablosunda aranmalı; denetim
// eskiden bunu bir SONRAKİ .from()'un zincirine yazıyordu.
export async function sayfa(supabase: any) {
  const gecmis = () =>
    supabase.from("oturum_kayitlari").select("id,login_at").eq("organization_id", "x");
  const [a, b] = await Promise.all([
    supabase.from("personel").select("id,full_name").order("full_name"),
    gecmis().order("login_at", { ascending: false }),
  ]);
  return [a, b];
}
