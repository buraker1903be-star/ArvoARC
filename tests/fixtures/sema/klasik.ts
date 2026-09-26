// Denetimin en başından beri yakaladığı hatalar; regresyon için duruyorlar.
export async function klasik(supabase: any) {
  await supabase.from("olmayan_tablo").select("id");
  await supabase.from("personel").select("id,unvan");
  await supabase.from("personel").insert({ id: "1", yanlis_sutun: 2 });
  await supabase.rpc("olmayan_fonksiyon");
}
