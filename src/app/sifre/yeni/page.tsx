import type { Metadata } from "next";
import Image from "next/image";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { setNewPassword } from "../actions";
import "../../login/login.css";

export const metadata: Metadata = { title: "Yeni şifre" };

const errors: Record<string, string> = {
  "too-short": "Şifre en az 8 karakter olmalı.",
  mismatch: "İki şifre aynı değil.",
  "same-password": "Yeni şifre eskisiyle aynı olamaz.",
  weak: "Bu şifre çok zayıf; daha uzun ya da tahmini zor bir şifre seçin.",
  failed: "Şifre kaydedilemedi. Bağlantıyı yeniden isteyip tekrar deneyin.",
};

export default async function NewPasswordPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  // Bu sayfa yalnızca bağlantıdan gelen oturumla açılır.
  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  if (!data.user) redirect("/sifre?error=link-expired");
  const { error } = await searchParams;

  return (
    <main className="login-shell">
      <section className="login-brand">
        <Image src="/arvo-arc-logo.png" alt="ARVO ARC" width={200} height={39} priority />
        <div>
          <span>ADAPTIVE RETAIL CORE</span>
          <h1>Yeni şifreniz.</h1>
          <p>{data.user.email} hesabı için.</p>
        </div>
        <small>ARVOCULTURE GROUP TEKNOLOJİ SANAYİ VE TİCARET LTD. ŞTİ.</small>
      </section>
      <section className="login-form-wrap">
        <form action={setNewPassword} className="login-card">
          <span>YENİ ŞİFRE</span>
          <h2>Şifrenizi belirleyin</h2>
          {error ? <div className="login-error" role="alert">{errors[error] ?? "İşlem tamamlanamadı."}</div> : null}
          <label>Yeni şifre<input name="password" type="password" autoComplete="new-password" minLength={8} required /></label>
          <label>Yeni şifre (tekrar)<input name="confirm" type="password" autoComplete="new-password" minLength={8} required /></label>
          <button type="submit">Kaydet ve devam et <b>→</b></button>
        </form>
      </section>
    </main>
  );
}
