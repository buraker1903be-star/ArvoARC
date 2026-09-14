/*
  Sayfa verisi gelirken içerik alanında iskelet. Menü ve üst çubuk
  yerleşimde olduğu için yerinde kalıyor; eskiden tüm ekranı
  kaplayan "Panel hazırlanıyor…" ekranı açılıyordu.
*/
export default function PanelLoading() {
  return (
    <div className="panel-skeleton" aria-hidden="true">
      <div className="skel skel-title" />
      <div className="skel skel-sub" />
      <div className="panel-skeleton-metrics">
        <div className="skel skel-card" />
        <div className="skel skel-card" />
        <div className="skel skel-card" />
        <div className="skel skel-card" />
      </div>
      <div className="skel skel-block" />
      <div className="skel skel-block" />
    </div>
  );
}
