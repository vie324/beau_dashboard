"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { Input, Label, Select, Textarea } from "@/components/ui/Input";
import {
  submitPublicBooking,
  getPublicAvailability,
  type AvailabilityResult,
} from "@/feature/booking-link/actions/publicBookingActions";
import type { PublicBookingData } from "@/feature/booking-link/services/getBookingLinkBySlug";

function todayJst(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

function shiftYmd(ymd: string, days: number): string {
  const [y, m, d] = ymd.split("-").map(Number);
  const base = new Date(Date.UTC(y, m - 1, d, 12, 0, 0));
  base.setUTCDate(base.getUTCDate() + days);
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(base);
}

export function PublicBookingForm({
  slug,
  data,
}: {
  slug: string;
  data: PublicBookingData;
}) {
  const router = useRouter();
  const [today] = useState(todayJst);
  const [weekStart, setWeekStart] = useState(todayJst);

  const [shopId, setShopId] = useState<number>(data.shops[0]?.id ?? 0);
  const [menuId, setMenuId] = useState<number>(data.menus[0]?.id ?? 0);
  const [interval, setIntervalMin] = useState(30);
  const [staffId, setStaffId] = useState<string>("");

  const [avail, setAvail] = useState<AvailabilityResult | null>(null);
  const [loading, startLoad] = useTransition();

  const [picked, setPicked] = useState<{ date: string; time: string } | null>(
    null,
  );
  const [guest, setGuest] = useState({ name: "", phone: "", note: "" });
  const [submitting, startSubmit] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const staffOptions = useMemo(
    () => data.staffsByShop[shopId] ?? [],
    [shopId, data.staffsByShop],
  );

  useEffect(() => {
    if (!shopId || !menuId) return;
    setPicked(null);
    startLoad(async () => {
      const r = await getPublicAvailability({
        slug,
        shopId,
        menuId,
        interval,
        weekStart,
        staffId: staffId ? Number(staffId) : null,
      });
      setAvail(r);
    });
  }, [slug, shopId, menuId, interval, weekStart, staffId]);

  function confirm() {
    setError(null);
    if (!picked) return;
    if (!guest.name.trim()) {
      setError("お名前を入力してください");
      return;
    }
    if (guest.phone.trim().length < 8) {
      setError("電話番号を正しく入力してください");
      return;
    }
    const fd = new FormData();
    fd.set("slug", slug);
    fd.set("shopId", String(shopId));
    fd.set("menuId", String(menuId));
    if (staffId) fd.set("staffId", staffId);
    fd.set("date", picked.date);
    fd.set("startTime", picked.time);
    fd.set("guestName", guest.name);
    fd.set("guestPhone", guest.phone);
    if (guest.note) fd.set("note", guest.note);
    startSubmit(async () => {
      const res = await submitPublicBooking(null, fd);
      if (res.ok) router.push(`/booking-complete?shop=${shopId}`);
      else setError(res.error);
    });
  }

  const canGoPrev = weekStart > today;

  return (
    <div className="space-y-4">
      {data.shops.length > 1 && (
        <div>
          <Label>店舗</Label>
          <Select
            value={shopId}
            onChange={(e) => setShopId(Number(e.target.value))}
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
          value={menuId}
          onChange={(e) => setMenuId(Number(e.target.value))}
        >
          {data.menus.map((m) => (
            <option key={m.id} value={m.id}>
              {m.name}（{m.durationMin}分 / ¥{m.price.toLocaleString()}）
            </option>
          ))}
        </Select>
      </div>

      <div className="grid grid-cols-2 gap-3">
        {data.link.requireStaffSelection && (
          <div>
            <Label>ご希望スタッフ</Label>
            <Select
              value={staffId}
              onChange={(e) => setStaffId(e.target.value)}
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
        <div>
          <Label>時間間隔</Label>
          <Select
            value={interval}
            onChange={(e) => setIntervalMin(Number(e.target.value))}
          >
            <option value={15}>15分単位</option>
            <option value={30}>30分単位</option>
            <option value={60}>60分単位</option>
          </Select>
        </div>
      </div>

      {/* Week navigation */}
      <div className="flex items-center justify-between">
        <button
          type="button"
          disabled={!canGoPrev || loading}
          onClick={() => setWeekStart((w) => shiftYmd(w, -7))}
          className="rounded-lg border border-line px-3 py-1.5 text-xs text-muted transition-colors hover:border-accent/60 hover:text-accent disabled:opacity-40"
        >
          ‹ 前の一週間
        </button>
        <span className="text-xs font-medium text-muted">
          {weekStart.replace(/-/g, "/")} 〜
        </span>
        <button
          type="button"
          disabled={loading}
          onClick={() => setWeekStart((w) => shiftYmd(w, 7))}
          className="rounded-lg border border-line px-3 py-1.5 text-xs text-muted transition-colors hover:border-accent/60 hover:text-accent disabled:opacity-40"
        >
          次の一週間 ›
        </button>
      </div>

      {/* Availability grid */}
      <div className="overflow-x-auto rounded-xl border border-line">
        {loading && (
          <p className="px-3 py-10 text-center text-sm text-faint">
            空き状況を読み込み中…
          </p>
        )}
        {!loading && avail && !avail.ok && (
          <p className="px-3 py-10 text-center text-sm text-danger">
            {avail.error}
          </p>
        )}
        {!loading && avail && avail.ok && avail.times.length === 0 && (
          <p className="px-3 py-10 text-center text-sm text-faint">
            予約可能な時間がありません。営業時間をご確認ください。
          </p>
        )}
        {!loading && avail && avail.ok && avail.times.length > 0 && (
          <table className="w-full min-w-[560px] border-collapse text-center text-xs">
            <thead>
              <tr className="bg-base/60">
                <th className="sticky left-0 z-10 w-14 bg-base/60 px-2 py-2 font-medium text-faint">
                  時間
                </th>
                {avail.days.map((d) => (
                  <th
                    key={d.date}
                    className={`px-1 py-2 font-medium ${
                      d.weekend === 0
                        ? "text-danger"
                        : d.weekend === 6
                          ? "text-info"
                          : "text-muted"
                    }`}
                  >
                    <div>{d.label}</div>
                    <div className="text-[10px]">({d.dow})</div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {avail.times.map((t) => (
                <tr key={t} className="border-t border-line/70">
                  <td className="sticky left-0 z-10 bg-surface px-2 py-1.5 font-medium tabular-nums text-muted">
                    {t}
                  </td>
                  {avail.days.map((d) => {
                    const free = d.avail[t];
                    const isPicked =
                      picked?.date === d.date && picked?.time === t;
                    return (
                      <td
                        key={d.date}
                        className="border-l border-line/60 p-0"
                      >
                        {free ? (
                          <button
                            type="button"
                            onClick={() =>
                              setPicked({ date: d.date, time: t })
                            }
                            className={`flex h-9 w-full items-center justify-center text-lg font-semibold transition-colors ${
                              isPicked
                                ? "bg-danger text-white"
                                : "text-danger hover:bg-danger/10"
                            }`}
                            aria-label={`${d.label} ${t} 予約可能`}
                          >
                            {isPicked ? "選択中" : "◎"}
                          </button>
                        ) : (
                          <div className="flex h-9 w-full items-center justify-center text-faint/60">
                            ×
                          </div>
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Guest details once a slot is chosen */}
      {picked && (
        <div className="animate-fade-in space-y-4 rounded-xl border border-accent/40 bg-accent/5 p-4">
          <p className="text-sm font-medium text-ink">
            選択中：{picked.date.replace(/-/g, "/")}　{picked.time}〜
            <button
              type="button"
              onClick={() => setPicked(null)}
              className="ml-3 text-xs text-accent underline"
            >
              選び直す
            </button>
          </p>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>お名前</Label>
              <Input
                required
                value={guest.name}
                onChange={(e) =>
                  setGuest({ ...guest, name: e.target.value })
                }
                placeholder="山田 太郎"
              />
            </div>
            <div>
              <Label>電話番号</Label>
              <Input
                required
                type="tel"
                value={guest.phone}
                onChange={(e) =>
                  setGuest({ ...guest, phone: e.target.value })
                }
                placeholder="090-0000-0000"
              />
            </div>
          </div>
          <div>
            <Label>ご要望（任意）</Label>
            <Textarea
              value={guest.note}
              onChange={(e) =>
                setGuest({ ...guest, note: e.target.value })
              }
            />
          </div>
          {error && (
            <p className="rounded-xl border border-danger/30 bg-danger/10 px-3 py-2 text-sm text-danger">
              {error}
            </p>
          )}
          <Button
            className="w-full"
            onClick={confirm}
            disabled={submitting}
          >
            {submitting ? "送信中…" : "この内容で予約する"}
          </Button>
        </div>
      )}
    </div>
  );
}
