import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import { Suspense } from "react";
import { InteractionFeedback } from "@/components/interaction-feedback";
import "./globals.css";
/* Tasarım sistemi globals'tan sonra yüklenir: tek dil kuran
   kurallar eski sayfa stillerini ezmelidir. */
import "./design.css";

/*
  Tek yazı tipi, ArvoOS ile aynı: Apple cihazlarında sistemin SF Pro'su,
  diğerlerinde ona en yakın açık yazı tipi Inter. preload kapalı: Apple
  cihazları SF'yi bulduğu için Inter dosyasını hiç indirmez. Yığın
  globals.css'te (body --font-system).
*/
const inter=Inter({subsets:["latin","latin-ext"],variable:"--font-inter",display:"swap",preload:false});

export const metadata:Metadata={
  title:{default:"ARVO ARC",template:"%s | ARVO ARC"},
  description:"Adaptive Retail Core — yeni nesil ticaret yönetim platformu."
};

export const viewport:Viewport={
  width:"device-width",
  initialScale:1,
  viewportFit:"cover",
  themeColor:[
    {media:"(prefers-color-scheme: light)",color:"#f2f2f7"},
    {media:"(prefers-color-scheme: dark)",color:"#050c1a"},
  ],
};

/*
  Tema tercihi çizimden önce okunur: yenilemede aydınlık moda dönüp
  sonra kararma (flash) olmasın. Tercih yoksa cihazın ayarı geçerli.
*/
const themeInit=`(function(){try{var t=localStorage.getItem("arvoarc.theme");if(!t)t=matchMedia("(prefers-color-scheme: dark)").matches?"dark":"light";document.documentElement.setAttribute("data-theme",t)}catch(e){}})()`;

export default function Layout({children}:{children:React.ReactNode}){
  return <html lang="tr" suppressHydrationWarning data-scroll-behavior="smooth"><head><script dangerouslySetInnerHTML={{__html:themeInit}}/></head><body className={inter.variable}>{children}
    {/*
      `useSearchParams` bir Suspense sınırı gerektiriyor; aksi
      hâlde tüm sayfa istemci tarafında yeniden çiziliyor.
    */}
    <Suspense fallback={null}><InteractionFeedback/></Suspense></body></html>;
}
