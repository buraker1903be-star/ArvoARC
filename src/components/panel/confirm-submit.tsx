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
}: {
  message: string;
  className?: string;
  children: React.ReactNode;
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
      onClick={(event) => {
        if (!window.confirm(message)) event.preventDefault();
      }}
    >
      {children}
    </button>
  );
}
