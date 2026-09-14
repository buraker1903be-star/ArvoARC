const RESULT_KEYS = ["ok", "error", "created", "saved", "updated", "skipped"];

/*
  İşlemden sonra kullanıcıyı geldiği sayfaya döndürür: filtre,
  arama, dönem ve sayfa korunur; önceki işlemin sonuç
  parametreleri temizlenir.

  Adres formdan geldiği için doğrulanıyor: yalnızca verilen
  bölümün altına dönülebilir, başka bir siteye yönlendirme (açık
  yönlendirme) yapılamaz.
*/
export function backUrl(raw: FormDataEntryValue | null, section: string, result: Record<string, string>) {
  const base = "https://arc.invalid";
  const pattern = new RegExp(`^${section}(/[A-Za-z0-9-]+)?$`);
  let url: URL;
  try {
    url = new URL(typeof raw === "string" && raw ? raw : section, base);
  } catch {
    url = new URL(section, base);
  }
  if (url.origin !== base || !pattern.test(url.pathname)) url = new URL(section, base);
  for (const key of RESULT_KEYS) url.searchParams.delete(key);
  for (const [key, value] of Object.entries(result)) url.searchParams.set(key, value);
  return `${url.pathname}${url.search}`;
}
