/*
  ÖDEME SONUCU SAYFASININ METNİ — SAF (17.10.2026).

  HTML burada üretiliyor, NextResponse'a saran katman ayrı
  (sonuc-sayfasi.ts): `next/server`'a dokunan bir dosya test
  koşucusunda yüklenemiyor (AGENTS: "mantık parçası test edilemiyorsa
  Next'e bağlı bir dosyanın içindedir, ayırın").
*/
export function odemeSonucuHtml({ baslik, mesaj, referans }: { baslik: string; mesaj: string; referans?: string }) {
  const kacir = (metin: string) =>
    metin.replace(/[&<>"']/g, (karakter) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[karakter] ?? karakter);
  const govde = `<!doctype html>
<html lang="tr"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex,nofollow">
<title>${kacir(baslik)}</title>
<style>
  :root{color-scheme:light}
  body{margin:0;display:grid;place-items:center;min-height:100dvh;padding:24px;background:#f5f6f8;
       font:16px/1.6 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;color:#101828}
  main{max-width:34rem;padding:32px;border-radius:18px;background:#fff;box-shadow:0 18px 48px rgba(16,24,40,.08)}
  h1{margin:0 0 12px;font-size:22px;line-height:1.25}
  p{margin:0 0 12px;color:#475467}
  code{display:inline-block;margin-top:4px;padding:6px 10px;border-radius:8px;background:#f2f4f7;font-size:14px}
</style>
</head><body><main>
<h1>${kacir(baslik)}</h1>
<p>${kacir(mesaj)}</p>
${referans ? `<p><small>Ödeme referansı</small><br><code>${kacir(referans)}</code></p>` : ""}
</main></body></html>`;
  return govde;
}

