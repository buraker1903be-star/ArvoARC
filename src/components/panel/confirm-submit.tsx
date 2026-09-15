"use client";

/*
  Geri alınamayan sonucu olan işlem (ör. müşteriye e-posta) öncesi
  onay. İptal edilirse form gönderilmez; onaylanırsa form yine sunucu
  işlemiyle gider.
*/
export function ConfirmSubmit({ message, className, children }: { message: string; className?: string; children: React.ReactNode }) {
  return (
    <button
      type="submit"
      className={className}
      onClick={(event) => {
        if (!window.confirm(message)) event.preventDefault();
      }}
    >
      {children}
    </button>
  );
}
