"use client";

/*
  Geri alınamayan sonucu olan işlem (ör. müşteriye e-posta) öncesi
  onay. İptal edilirse form gönderilmez; onaylanırsa form yine sunucu
  işlemiyle gider.
*/
export function ConfirmSubmit({
  message,
  className,
  children,
  disabled,
  name,
  value,
}: {
  message: string;
  className?: string;
  children: React.ReactNode;
  /*
    Aynı formda iki karar varsa (onayla / reddet) hangisine basıldığı
    DÜĞMENİN kendi adıyla gidiyor. Gizli alan çözüm değil: iki karar
    aynı adı taşıyor ve düğmenin İÇİNE input yazmak geçersiz HTML.
  */
  name?: string;
  value?: string;
  /*
    İşlem sürerken kilitlenebilsin. Yerinde çalışan eylemlerde sayfa
    yenilenmediği için düğme ekranda kalıyor ve ikinci kez basılabiliyor;
    sunucuda kilit zaten var (transfer_lock), bu onu kullanıcıya da
    göstermek için.
  */
  disabled?: boolean;
}) {
  return (
    <button
      type="submit"
      className={className}
      disabled={disabled}
      name={name}
      value={value}
      onClick={(event) => {
        if (!window.confirm(message)) event.preventDefault();
      }}
    >
      {children}
    </button>
  );
}
