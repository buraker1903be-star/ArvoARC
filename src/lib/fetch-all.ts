type Page<T> = { data: T[] | null; error: { message: string } | null };

const PAGE = 1000;

/*
  Supabase bir istekte en fazla 1000 satır döndürüyor (max_rows).
  `.limit(5000)` bu sınırı aşmıyor: müşteri toplamları ve analitik
  rakamları 1000. siparişten sonrasını sessizce atlıyordu.

  Satırlar 1000'lik sayfalarla, sıralı okunur. Üst sınır belleği
  korur; aşılırsa `truncated` true döner ve ekranda belirtilir.
*/
export async function fetchAllRows<T>(page: (from: number, to: number) => PromiseLike<Page<T>>, max = 20_000) {
  const rows: T[] = [];
  let truncated = false;
  for (let from = 0; ; from += PAGE) {
    if (from >= max) {
      truncated = true;
      break;
    }
    const { data, error } = await page(from, from + PAGE - 1);
    if (error) throw new Error(error.message);
    rows.push(...(data ?? []));
    if (!data || data.length < PAGE) break;
  }
  return { rows, truncated };
}
