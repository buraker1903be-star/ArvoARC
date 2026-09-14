import Link from "next/link";
import { Icon } from "@/components/panel/icons";

/*
  Siparişler ve İade talepleri aynı bölümün iki sekmesi. İki sayfa
  bu şeridi ayrı ayrı yazıyordu; etkin sekme satır içi renkle
  işaretleniyordu.
*/
export function OrdersTabs({ active, pendingReturns }: { active: "orders" | "returns"; pendingReturns: number }) {
  return (
    <nav className="ac-bar-actions" aria-label="Sipariş bölümleri">
      <Link prefetch={false} className="ac-btn" href="/siparisler" aria-current={active === "orders" ? "page" : undefined}>Siparişler</Link>
      <Link prefetch={false} className="ac-btn" href="/siparisler/iadeler" aria-current={active === "returns" ? "page" : undefined}>
        İade talepleri
        {pendingReturns > 0 ? <span className="ac-count" data-tone="warn">{pendingReturns}</span> : null}
      </Link>
      {active === "orders" ? (
        <a className="ac-btn" href="/api/disari-aktar/siparisler"><Icon name="download" size={15} />CSV indir</a>
      ) : null}
    </nav>
  );
}
