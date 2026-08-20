import type {Metadata} from "next";import "./globals.css";
export const metadata:Metadata={title:{default:"ARVO ARC",template:"%s | ARVO ARC"},description:"Adaptive Retail Core — yeni nesil ticaret yönetim platformu."};
export default function Layout({children}:{children:React.ReactNode}){return <html lang="tr"><body>{children}</body></html>}
