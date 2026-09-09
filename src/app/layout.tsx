import type { Metadata } from "next";
import { Manrope } from "next/font/google";
import { InteractionFeedback } from "@/components/interaction-feedback";
import "./globals.css";
/* Tasarım sistemi globals'tan sonra yüklenir: tek dil kuran
   kurallar eski sayfa stillerini ezmelidir. */
import "./design.css";

const manrope=Manrope({subsets:["latin","latin-ext"],variable:"--font-manrope",display:"swap"});

export const metadata:Metadata={
  title:{default:"ARVO ARC",template:"%s | ARVO ARC"},
  description:"Adaptive Retail Core — yeni nesil ticaret yönetim platformu."
};

export default function Layout({children}:{children:React.ReactNode}){
  return <html lang="tr" className={manrope.variable}><body>{children}<InteractionFeedback/></body></html>;
}
