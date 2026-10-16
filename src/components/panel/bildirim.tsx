/*
  İşlem sonucu artık kabuktaki balonda (components/os/flash-toast.tsx,
  16.10.2026). Bu bileşen sayfalarda çağrılmaya devam ediyor ama hiçbir şey
  çizmiyor: şerit ve balon birlikte çizilirse aynı mesaj iki kez görünür,
  ayrıca şeridin yanındaki temizleyici çerezi balondan önce silip mesajı
  kaybettirebilirdi. Sayfalar yeni kalıba geçerken çağrılar kaldırılacak.
*/
export async function PanelBildirimi(_?: { basarililBaslik?: string }) {
  void _;
  return null;
}
