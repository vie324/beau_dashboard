"use server";

import { redirect } from "next/navigation";
import { login, logout } from "@/helper/lib/auth";

export type LoginState = { error?: string };

export async function loginAction(
  _prev: LoginState,
  formData: FormData,
): Promise<LoginState> {
  const email = String(formData.get("email") ?? "");
  const password = String(formData.get("password") ?? "");
  const next = String(formData.get("next") ?? "/reservation");

  if (!email || !password) {
    return { error: "メールアドレスとパスワードを入力してください" };
  }

  const result = await login(email, password);
  if (!result.ok) return { error: result.error };

  // Same-origin app path only (reject protocol-relative // and /\ open redirects).
  const safeNext =
    next.startsWith("/") &&
    !next.startsWith("//") &&
    !next.startsWith("/\\")
      ? next
      : "/reservation";
  redirect(safeNext);
}

export async function logoutAction(): Promise<void> {
  await logout();
  redirect("/login");
}
