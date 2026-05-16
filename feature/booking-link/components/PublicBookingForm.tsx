"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { Input, Label, Select, Textarea } from "@/components/ui/Input";
import { timeSlots } from "@/helper/utils/timeOptions";
import { submitPublicBooking } from "@/feature/booking-link/actions/publicBookingActions";
import type { PublicBookingData } from "@/feature/booking-link/services/getBookingLinkBySlug";

export function PublicBookingForm({
  slug,
  data,
}: {
  slug: string;
  data: PublicBookingData;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const [form, setForm] = useState({
    shopId: data.shops[0]?.id ?? "",
    menuId: data.menus[0]?.id ?? "",
    staffId: "",
    date: "",
    interval: 30,
    startTime: "10:00",
    guestName: "",
    guestPhone: "",
    note: "",
  });

  const slots = useMemo(
    () => timeSlots(form.interval, 9 * 60, 20 * 60),
    [form.interval],
  );

  const set = <K extends keyof typeof form>(k: K, v: (typeof form)[K]) =>
    setForm((f) => ({ ...f, [k]: v }));

  const staffOptions = useMemo(() => {
    const sid = Number(form.shopId);
    return data.staffsByShop[sid] ?? [];
  }, [form.shopId, data.staffsByShop]);

  function submit() {
    setError(null);
    if (!form.shopId) {
      setError("店舗を選択してください");
      return;
    }
    if (!form.menuId) {
      setError("メニューを選択してください");
      return;
    }
    if (!form.guestName.trim()) {
      setError("お名前を入力してください");
      return;
    }
    if (form.guestPhone.trim().length < 8) {
      setError("電話番号を正しく入力してください");
      return;
    }
    if (!form.date) {
      setError("ご希望日を選択してください");
      return;
    }
    const fd = new FormData();
    fd.set("slug", slug);
    fd.set("shopId", String(form.shopId));
    fd.set("menuId", String(form.menuId));
    if (form.staffId) fd.set("staffId", String(form.staffId));
    fd.set("date", form.date);
    fd.set("startTime", form.startTime);
    fd.set("guestName", form.guestName);
    fd.set("guestPhone", form.guestPhone);
    if (form.note) fd.set("note", form.note);

    startTransition(async () => {
      const res = await submitPublicBooking(null, fd);
      if (res.ok) {
        router.push("/booking-complete");
      } else {
        setError(res.error);
      }
    });
  }

  return (
    <div className="space-y-4">
      {data.shops.length > 1 && (
        <div>
          <Label>店舗</Label>
          <Select
            value={form.shopId}
            onChange={(e) => set("shopId", Number(e.target.value))}
          >
            {data.shops.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </Select>
        </div>
      )}

      <div>
        <Label>メニュー</Label>
        <Select
          value={form.menuId}
          onChange={(e) => set("menuId", Number(e.target.value))}
        >
          {data.menus.map((m) => (
            <option key={m.id} value={m.id}>
              {m.name}（{m.durationMin}分 / ¥{m.price.toLocaleString()}）
            </option>
          ))}
        </Select>
      </div>

      {data.link.requireStaffSelection && (
        <div>
          <Label>ご希望スタッフ</Label>
          <Select
            value={form.staffId}
            onChange={(e) => set("staffId", e.target.value)}
          >
            <option value="">指名なし</option>
            {staffOptions.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </Select>
        </div>
      )}

      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label>ご希望日</Label>
          <Input
            type="date"
            value={form.date}
            onChange={(e) => set("date", e.target.value)}
          />
        </div>
        <div>
          <Label>時間間隔</Label>
          <Select
            value={form.interval}
            onChange={(e) => {
              const iv = Number(e.target.value);
              setForm((f) => {
                const ns = timeSlots(iv, 9 * 60, 20 * 60);
                return {
                  ...f,
                  interval: iv,
                  startTime: ns.includes(f.startTime) ? f.startTime : ns[0],
                };
              });
            }}
          >
            <option value={15}>15分単位</option>
            <option value={30}>30分単位</option>
            <option value={60}>60分単位</option>
          </Select>
        </div>
      </div>

      <div>
        <Label>ご希望時刻</Label>
        <Select
          value={form.startTime}
          onChange={(e) => set("startTime", e.target.value)}
        >
          {slots.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </Select>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label>お名前</Label>
          <Input
            required
            value={form.guestName}
            onChange={(e) => set("guestName", e.target.value)}
            placeholder="山田 太郎"
          />
        </div>
        <div>
          <Label>電話番号</Label>
          <Input
            required
            type="tel"
            value={form.guestPhone}
            onChange={(e) => set("guestPhone", e.target.value)}
            placeholder="090-0000-0000"
          />
        </div>
      </div>

      <div>
        <Label>ご要望（任意）</Label>
        <Textarea
          value={form.note}
          onChange={(e) => set("note", e.target.value)}
        />
      </div>

      {error && (
        <p className="rounded-xl border border-danger/30 bg-danger/10 px-3 py-2 text-sm text-danger">
          {error}
        </p>
      )}

      <Button className="w-full" onClick={submit} disabled={pending}>
        {pending ? "送信中…" : "この内容で予約する"}
      </Button>
    </div>
  );
}
