"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/Button";
import { Input, Label } from "@/components/ui/Input";
import {
  verifyMember,
  type MemberProfile,
} from "@/feature/storefront/actions/memberActions";
import { writeMemberSession } from "@/feature/storefront/lib/memberSession";

/**
 * 会員確認フォーム（会員番号 or メール + 電話番号）。
 * 成功すると localStorage にセッションを保存し、onVerified を呼ぶ。
 * チェックアウトとマイページの両方で使う。
 */
export function MemberVerifyForm({
  slug,
  onVerified,
  compact,
}: {
  slug: string;
  onVerified: (r: { token: string; member: MemberProfile }) => void;
  compact?: boolean;
}) {
  const [identifier, setIdentifier] = useState("");
  const [phone, setPhone] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function submit() {
    setError(null);
    if (!identifier.trim() || !phone.trim()) {
      setError("会員番号（またはメールアドレス）と電話番号を入力してください");
      return;
    }
    startTransition(async () => {
      const res = await verifyMember({ slug, identifier, phone });
      if (!res.ok) {
        setError(res.error);
        return;
      }
      writeMemberSession(slug, {
        token: res.token,
        name: res.member.name,
        pointsBalance: res.member.pointsBalance,
      });
      onVerified({ token: res.token, member: res.member });
    });
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
      className="space-y-3"
    >
      <div className={compact ? "grid gap-3 sm:grid-cols-2" : "space-y-3"}>
        <div>
          <Label>会員番号（診察券番号）またはメールアドレス</Label>
          <Input
            value={identifier}
            onChange={(e) => setIdentifier(e.target.value)}
            placeholder="例）1001 または mail@example.com"
            autoComplete="username"
            maxLength={120}
          />
        </div>
        <div>
          <Label>ご登録の電話番号</Label>
          <Input
            type="tel"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="090-0000-0000"
            autoComplete="tel"
            maxLength={40}
          />
        </div>
      </div>
      {error && (
        <p className="rounded-xl border border-danger/30 bg-danger/10 px-3 py-2 text-xs text-danger">
          {error}
        </p>
      )}
      <Button type="submit" className="w-full sm:w-auto" disabled={pending}>
        {pending ? "確認中…" : "会員確認する"}
      </Button>
      <p className="text-[11px] leading-relaxed text-faint">
        ご来院時にお伝えいただいた電話番号と照合します。見つからない場合は店舗までお問い合わせください。
      </p>
    </form>
  );
}
