import Link from "next/link";
import { signOut } from "@/app/auth/actions";

const navigation=[
  ["overview","Genel Bakış","/","⌂"],
  ["operations","Operasyon Merkezi","/operasyon","◆"],
  ["products","Ürünler","/urunler","◇"],
  ["stock","Stok Yönetimi","/stok","▤"],
  ["orders","Siparişler","/siparisler","▧"],
  ["customers","Müşteriler","/musteriler","◎"],
  ["analytics","Satış Analitiği","/analitik","↗"],
  ["import","Veri Aktarımı","/veri-aktarimi","⇄"],
  ["settings","Mağaza Ayarları","/ayarlar","⚙"],
] as const;

export function Brand(){
  return <span className="brand" aria-label="ARVO ARC"><b>ARVO</b><i>ARC</i></span>;
}

export function Shell({children,active="overview",tenantName="ArvoCulture",tenantPlan="enterprise"}:{children:React.ReactNode;active?:string;tenantName?:string;tenantPlan?:string}){
  const initials=tenantName.split(" ").filter(Boolean).map(word=>word[0]).join("").slice(0,2).toUpperCase();
  return <div className="shell">
    <aside>
      <Brand/>
      <div className="tenant"><span>{initials}</span><div><b>{tenantName}</b><small>{tenantPlan} · ARVO ARC</small></div></div>
      <nav aria-label="Ana menü">{navigation.map(([key,label,href,icon])=><Link className={active===key?"active":""} key={key} href={href} aria-current={active===key?"page":undefined}><i>{icon}</i><span>{label}</span></Link>)}</nav>
      <div className="powered"><small>POWERED BY</small><b>ARVO OS</b><span>Adaptive Retail Core</span></div>
    </aside>
    <main>
      <header className="topbar">
        <div><small>{tenantName.toUpperCase()} / TÜRKİYE</small><h1>Commerce Console</h1></div>
        <div className="topbar-actions">
          <a className="secondary-action" href="/magaza" target="_blank" rel="noreferrer">Mağazayı görüntüle ↗</a>
          <Link className="primary-action" href="/urunler">+ Yeni ürün</Link>
          <span className="avatar">{initials}</span>
          <form action={signOut}><button className="ghost-action" type="submit">Çıkış</button></form>
        </div>
      </header>
      <div className="page-content">{children}</div>
    </main>
  </div>;
}
