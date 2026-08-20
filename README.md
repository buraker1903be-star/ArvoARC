# ARVO ARC

**Adaptive Retail Core** — çok kiracılı, white-label ticaret yönetim platformu.

## İlk kiracı

ArvoCulture, Enterprise paketinde `app.arvoculture.com` üzerinden kendi markalı panelini kullanır. Standart müşteriler merkezi ARVO ARC alan adından erişir.

## Teknoloji

- Next.js App Router
- Supabase PostgreSQL, Auth ve Storage
- Vercel
- PayTR (sonraki entegrasyon aşaması)

## Kurulum

```bash
npm install
npm run dev
```

`.env.example` dosyasını `.env.local` olarak kopyalayın ve Supabase bağlantı değerlerini ekleyin. Gizli Supabase ve PayTR anahtarlarını istemci tarafında kullanmayın.
