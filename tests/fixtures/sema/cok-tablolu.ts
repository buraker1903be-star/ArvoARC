// Birden çok tabloya dokunan fonksiyon BAĞLANMAZ: hangi sütunun hangi
// tabloya ait olduğu belirsiz ve yanlış alarm kaçırılan hatadan kötüdür.
export async function karisik(supabase: any) {
  const ikisi = async () => {
    const a = await supabase.from("personel").select("id");
    const b = await supabase.from("oturum_kayitlari").select("id");
    return [a, b];
  };
  const sonuc = await ikisi();
  return sonuc;
}
