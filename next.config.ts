import type { NextConfig } from "next";

const config: NextConfig = {
  poweredByHeader: false,
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
