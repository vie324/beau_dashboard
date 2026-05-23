import { Suspense } from "react";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/helper/lib/auth";
import { LoginForm } from "@/feature/auth/components/LoginForm";

export const dynamic = "force-dynamic";

export default async function LoginPage() {
  const user = await getCurrentUser();
  if (user) redirect("/reservation");

  return (
    <main className="flex min-h-screen items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <div className="font-display text-4xl tracking-[0.2em] text-accent">
            Dreamland
          </div>
          <p className="mt-2 text-xs uppercase tracking-[0.3em] text-faint">
            Salon Reservation
          </p>
        </div>

        <div className="rounded-xl border border-line bg-surface p-6 shadow-panel">
          <Suspense fallback={<div className="h-64" />}>
            <LoginForm />
          </Suspense>
        </div>

        <p className="mt-6 text-center text-xs text-faint">
          デモ: admin@beau.test / beau1234
        </p>
      </div>
    </main>
  );
}
