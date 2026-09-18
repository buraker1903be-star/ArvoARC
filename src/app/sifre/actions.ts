"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

/*
  Şifre belirleme / sıfırlama.

  ARC kendi veritabanına taşınınca (AYRILMA.md) ArvoOS'ta sonradan eklenen
  personel ARC'ta şifresiz açılıyor (ArvoOS lib/arc-bridge.ts); ilk şifresini
  buradan belirler. Önceden ARC'ta şifre yenileme yolu hiç yoktu: şifresini
  unutan personel ArvoOS'tan sıfırlıyordu, ki o da yalnızca ortak veritabanı
  sayesinde işe yarıyordu.
*/

const MIN_LENGTH = 8;

/** Bağlantının döneceği adres: isteğin geldiği panel alan adı (mağazanın özel alan adı olabilir). */
async function origin() {
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "";
  const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  return `${proto}://${host}`;
}

export async function requestPasswordReset(formData: FormData) {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) redirect("/sifre?error=invalid-email");

  const supabase = await createClient();
  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${await origin()}/auth/yenile`,
  });
  /* Hesap yoksa da aynı yanıt: hangi e-postanın kayıtlı olduğu bu formdan
     öğrenilmemeli. Hata yalnızca günlüğe (hız sınırı, e-posta ayarı). */
  if (error) console.error("ARC_PASSWORD_RESET_ERROR", error.message);
  redirect("/sifre?sent=1");
}

export async function setNewPassword(formData: FormData) {
  const password = String(formData.get("password") ?? "");
  const confirm = String(formData.get("confirm") ?? "");
  if (password.length < MIN_LENGTH) redirect("/sifre/yeni?error=too-short");
  if (password !== confirm) redirect("/sifre/yeni?error=mismatch");

  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  if (!data.user) redirect("/sifre?error=link-expired");

  const { error } = await supabase.auth.updateUser({ password });
  if (error) {
    console.error("ARC_PASSWORD_UPDATE_ERROR", error.message);
    redirect(`/sifre/yeni?error=${error.code === "same_password" ? "same-password" : error.code === "weak_password" ? "weak" : "failed"}`);
  }
  redirect("/");
}
