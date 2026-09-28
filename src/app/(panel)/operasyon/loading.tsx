import { KartIskeleti } from "@/components/panel/liste-iskeleti";

/*
  Operasyon merkezi dört sayaç ve dört liste kutusu çiziyor; sayfanın
  en pahalı sorguları burada, yani iskeletin en çok görüldüğü yer.
*/
export default function Loading() {
  return <KartIskeleti olcum={4} blok={3} />;
}
