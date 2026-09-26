// Hepsi doğru: denetim susmalı.
export async function dogru(supabase: any, gun: string | null) {
  let sorgu = supabase.from("oturum_kayitlari").select("id,user_id,login_at,logout_at");
  if (gun) sorgu = sorgu.gte("login_at", gun);
  const kisiler = () => supabase.from("personel").select("id,full_name");
  await supabase.rpc("var_olan_fonksiyon");
  return [await sorgu.order("login_at"), await kisiler().order("full_name")];
}
