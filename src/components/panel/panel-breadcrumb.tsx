"use client";

import { usePathname } from "next/navigation";
import { sectionLabel } from "./nav-config";

/* Üst çubuk: hangi mağazadasınız, hangi bölümdesiniz. */
export function PanelBreadcrumb({ tenantName }: { tenantName: string }) {
  const pathname = usePathname() ?? "/";
  return (
    <div className="panel-breadcrumb">
      <small>{tenantName.toLocaleUpperCase("tr-TR")}</small>
      <b>{sectionLabel(pathname)}</b>
    </div>
  );
}
