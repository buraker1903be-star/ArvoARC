"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export async function login(formData: FormData) {
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");

  if (!email || !password) redirect("/login?error=missing-fields");

  try {
    const supabase = await createClient();
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });

    if (error || !data.user || !data.session) {
      console.error("ARC_LOGIN_AUTH_ERROR", error?.message ?? "No session returned");
      redirect("/login?error=invalid-credentials");
    }
  } catch (error) {
    if (error instanceof Error && error.message === "NEXT_REDIRECT") throw error;
    console.error("ARC_LOGIN_SERVER_ERROR", error);
    redirect("/login?error=server-error");
  }

  redirect("/");
}
