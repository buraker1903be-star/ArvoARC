"use client";

import { useRef, type ReactNode } from "react";

/*
  ANINDA KAYDEDEN ALANLAR.

  İş detayında her alanın kendi "Kaydet" / "Ata" düğmesi vardı: tek bir
  görevin durumunu, tarihini ve sorumlusunu girmek üç ayrı tıklama + üç
  ayrı kaydetme demekti ve satır üç sıra yer kaplıyordu. Yirmi görevlik
  bir tezde bu altmış tıklama eder.

  Burada alan DEĞİŞİNCE form gönderiliyor. Sunucu işlemleri aynı kalıyor;
  değişen yalnızca tetikleyici.

  JS yoksa: her formda gizli bir "Kaydet" düğmesi duruyor ve <noscript>
  onu görünür yapıyor. Panelde JS'siz kullanım beklenmiyor ama bir
  denetim alanını erişilemez bırakmak da kabul edilebilir değil.
*/
export function AnindaForm({
  action,
  children,
  className,
}: {
  action: (formData: FormData) => void | Promise<void>;
  children: ReactNode;
  className?: string;
}) {
  const form = useRef<HTMLFormElement>(null);
  return (
    <form
      ref={form}
      action={action}
      className={className}
      onChange={(event) => {
        /*
          Metin kutusunda her tuşta gönderilmemeli: onChange React'te
          input için her karakterde çalışıyor. Yalnızca seçim ve tarih
          alanları anında gönderiyor; metin alanı odaktan çıkınca
          (onBlur) gönderiyor.
        */
        const hedef = event.target as unknown as HTMLInputElement;
        const tip = hedef.type;
        if (hedef.tagName === "SELECT" || tip === "date" || tip === "radio" || tip === "checkbox") {
          form.current?.requestSubmit();
        }
      }}
      onBlur={(event) => {
        const hedef = event.target as unknown as HTMLInputElement;
        if (hedef.tagName === "INPUT" && hedef.type === "text" && hedef.defaultValue !== hedef.value) {
          form.current?.requestSubmit();
        }
      }}
    >
      {children}
      {/* JS kapalıyken tek kurtarma yolu; açıkken gizli. */}
      <button type="submit" className="aninda-kaydet">Kaydet</button>
    </form>
  );
}

/** JS kapalıyken gizli kaydet düğmelerini görünür yapar. */
export function AnindaYedek() {
  return (
    <noscript
      dangerouslySetInnerHTML={{
        __html: "<style>.aninda-kaydet{display:inline-flex !important}</style>",
      }}
    />
  );
}
