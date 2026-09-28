import { ListeIskeleti } from "@/components/panel/liste-iskeleti";

/* Liste şekli; ama indirimlerde durum sekmesi yok, iskelet de göstermiyor. */
export default function Loading() {
  return <ListeIskeleti sekme={false} satir={6} />;
}
