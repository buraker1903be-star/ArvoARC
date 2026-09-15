import type { NextConfig } from "next";

const config: NextConfig = {
  poweredByHeader: false,
  /*
    Varsayılan 1 MB; logo, tema ve ürün görselleri yüklenemiyordu.
    Vercel istek gövdesini ~4,5 MB'ta kestiği için üst sınır 4 MB.
  */
  experimental: {
    serverActions: { bodySizeLimit: "4mb" },
  },
  /*
    Güvenlik başlıkları. Panel başka bir sitenin çerçevesine
    gömülemez (tıklama kaçırma: yönetici görünmez bir çerçevede
    "İade et"e bastırılabilirdi). Tarayıcı içerik türünü tahmin
    etmez; kamera, mikrofon ve konum izni kapalı.

    Tam bir CSP bilerek yok: tema betiği ve Next'in satır içi
    betikleri için nonce altyapısı gerekir.
  */
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Content-Security-Policy", value: "frame-ancestors 'none'" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
        ],
      },
    ];
  },
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "cdn.shopify.com",
        pathname: "/s/files/**",
      },
      {
        protocol: "https",
        hostname: "**.supabase.co",
        pathname: "/storage/v1/object/sign/arc-product-images/**",
      },
      /*
        Tarzyeri ürün görselleri. Görseller ARC deposuna
        kopyalanmıyor, tedarikçinin CDN'inden sunuluyor; panelde
        de görünebilmesi için izin gerekiyor.
      */
      {
        protocol: "https",
        hostname: "percdn.com",
      },
    ],
  },
};

export default config;
