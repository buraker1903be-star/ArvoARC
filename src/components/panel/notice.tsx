import { Icon } from "./icons";

type Tone = "success" | "error" | "warn" | "info";

/*
  İşlem sonucu şeridi. Sayfalar ?ok= / ?error= dönüşlerini düz
  <strong> olarak yazıyordu: başarı ile hata aynı görünüyordu.
*/
export function Notice({ tone = "success", title, children }: { tone?: Tone; title: string; children?: React.ReactNode }) {
  const icon = tone === "success" ? "check" : tone === "info" ? "info" : "alert";
  return (
    <div className="panel-notice" data-tone={tone} role={tone === "error" ? "alert" : "status"}>
      <span className="panel-notice-icon"><Icon name={icon} size={15} /></span>
      <div>
        <b>{title}</b>
        {children ? <p>{children}</p> : null}
      </div>
    </div>
  );
}
