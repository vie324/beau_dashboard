"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useTransition,
} from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { Input, Label, Select, Textarea } from "@/components/ui/Input";
import {
  submitPublicBooking,
  getPublicAvailability,
  type AvailabilityDay,
  type AvailabilityResult,
} from "@/feature/booking-link/actions/publicBookingActions";
import type { PublicBookingData } from "@/feature/booking-link/services/getBookingLinkBySlug";
import { capableStaffIds } from "@/helper/utils/menuStaff";
import {
  addDaysYmd,
  formatLongDate,
  formatShortDate,
} from "@/feature/booking-link/lib/schedule";

/** 画面内の日付が連続した7日（従来の週表示）か。 */
function isWeekPage(days: AvailabilityDay[]): boolean {
  return (
    days.length === 7 && addDaysYmd(days[0].date, 6) === days[6].date
  );
}

export function PublicBookingForm({
  slug,
  data,
}: {
  slug: string;
  data: PublicBookingData;
}) {
  const router = useRouter();
  // 表示中の画面の先頭日。null = 今日（サーバーが決める）
  const [cursor, setCursor] = useState<string | null>(null);

  const [shopId, setShopId] = useState<number>(data.shops[0]?.id ?? 0);
  const [menuId, setMenuId] = useState<number>(data.menus[0]?.id ?? 0);
  const [staffId, setStaffId] = useState<string>("");

  const [avail, setAvail] = useState<AvailabilityResult | null>(null);
  const [loading, startLoad] = useTransition();
  const requestId = useRef(0);

  const [picked, setPicked] = useState<{ date: string; time: string } | null>(
    null,
  );
  const [guest, setGuest] = useState({ name: "", phone: "", note: "" });
  const [submitting, startSubmit] = useTransition();
  const [error, setError] = useState<string | null>(null);
  // 送信した枠が埋まっていた等で、選び直してもらうときの案内（カレンダーの上に出す）
  const [notice, setNotice] = useState<string | null>(null);

  const guestSectionRef = useRef<HTMLDivElement>(null);
  const guestNameRef = useRef<HTMLInputElement>(null);

  // 希望日時を選んだら入力欄まで自動スクロール + 名前欄にフォーカス。
  useEffect(() => {
    if (!picked) return;
    const el = guestSectionRef.current;
    if (!el) return;
    el.scrollIntoView({ behavior: "smooth", block: "start" });
    const t = setTimeout(() => guestNameRef.current?.focus(), 350);
    return () => clearTimeout(t);
  }, [picked]);

  // 指名できるのは、選んだメニューを担当できるスタッフだけ（設定「対応スタッフ」）。
  const staffOptions = useMemo(() => {
    const all = data.staffsByShop[shopId] ?? [];
    const menuStaffIds =
      data.menus.find((m) => m.id === menuId)?.staffIds ?? [];
    const capable = new Set(
      capableStaffIds(
        all.map((s) => s.id),
        menuStaffIds,
      ),
    );
    return all.filter((s) => capable.has(s.id));
  }, [shopId, menuId, data.staffsByShop, data.menus]);

  // メニューを変えて対応できない人が選ばれたままにならないよう指名を解除する。
  useEffect(() => {
    if (!staffId) return;
    if (!staffOptions.some((s) => String(s.id) === staffId)) setStaffId("");
  }, [staffOptions, staffId]);

  const fetchAvailability = useCallback(
    () =>
      getPublicAvailability({
        slug,
        shopId,
        menuId,
        staffId: staffId ? Number(staffId) : null,
        cursor,
      }),
    [slug, shopId, menuId, staffId, cursor],
  );

  useEffect(() => {
    if (!shopId || !menuId) return;
    setPicked(null);
    const id = ++requestId.current;
    startLoad(async () => {
      const r = await fetchAvailability();
      // 連打などで追い越された古い応答は捨てる
      if (id === requestId.current) setAvail(r);
    });
  }, [shopId, menuId, fetchAvailability]);

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
    const target = picked;
    const fd = new FormData();
    fd.set("slug", slug);
    fd.set("shopId", String(shopId));
    fd.set("menuId", String(menuId));
    if (staffId) fd.set("staffId", staffId);
    fd.set("date", target.date);
    fd.set("startTime", target.time);
    fd.set("guestName", guest.name);
    fd.set("guestPhone", guest.phone);
    if (guest.note) fd.set("note", guest.note);
    startSubmit(async () => {
      const res = await submitPublicBooking(null, fd);
      if (res.ok) {
        router.push(`/booking-complete?shop=${shopId}`);
        return;
      }
      // 枠が埋まった・締切を過ぎた等のことがあるので、空き状況を取り直す。
      // 選んだ枠がもう取れないなら選択を外し、カレンダーの上で案内する。
      const id = ++requestId.current;
      const r = await fetchAvailability();
      if (id === requestId.current) setAvail(r);
      const stillFree =
        r.ok && r.days.find((d) => d.date === target.date)?.avail[target.time];
      if (stillFree) {
        setError(res.error);
      } else {
        setPicked(null);
        setNotice(res.error);
      }
    });
  }

  const ok = avail && avail.ok ? avail : null;
  const weekPage = ok ? isWeekPage(ok.days) : true;
  const pageLabel =
    ok && ok.days.length
      ? ok.days.length === 1
        ? formatShortDate(ok.days[0].date)
        : `${formatShortDate(ok.days[0].date)}〜${formatShortDate(ok.days[ok.days.length - 1].date)}`
      : "";
  const pick = (date: string, time: string) => {
    setNotice(null);
    setPicked({ date, time });
  };

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

      {notice && (
        <p className="rounded-xl border border-warn/40 bg-warn/10 px-3 py-2 text-sm text-warn">
          {notice}
        </p>
      )}

      {/* Date navigation（1画面に収まるときは出さない） */}
      {ok && (ok.prevCursor || ok.nextCursor) && (
        <div className="flex items-center justify-between gap-2">
          <button
            type="button"
            disabled={!ok.prevCursor || loading}
            onClick={() => ok.prevCursor && setCursor(ok.prevCursor)}
            className="shrink-0 rounded-lg border border-line px-3 py-1.5 text-xs text-muted transition-colors hover:border-accent/60 hover:text-accent disabled:opacity-40"
          >
            {weekPage ? "‹ 前の一週間" : "‹ 前の日程"}
          </button>
          <span className="text-center text-xs font-medium text-muted">
            {pageLabel}
          </span>
          <button
            type="button"
            disabled={!ok.nextCursor || loading}
            onClick={() => ok.nextCursor && setCursor(ok.nextCursor)}
            className="shrink-0 rounded-lg border border-line px-3 py-1.5 text-xs text-muted transition-colors hover:border-accent/60 hover:text-accent disabled:opacity-40"
          >
            {weekPage ? "次の一週間 ›" : "次の日程 ›"}
          </button>
        </div>
      )}

      {/* Availability */}
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
        {!loading && ok && ok.days.length === 0 && (
          <p className="px-3 py-10 text-center text-sm text-faint">
            ご予約いただける日時がありません。
          </p>
        )}
        {!loading && ok && ok.days.length > 0 && ok.layout === "slots" && (
          <SlotList
            days={ok.days}
            slotCapacity={ok.slotCapacity}
            picked={picked}
            onPick={pick}
          />
        )}
        {!loading &&
          ok &&
          ok.days.length > 0 &&
          ok.layout === "grid" &&
          ok.times.length === 0 && (
            <p className="px-3 py-10 text-center text-sm text-faint">
              予約可能な時間がありません。営業時間をご確認ください。
            </p>
          )}
        {!loading &&
          ok &&
          ok.days.length > 0 &&
          ok.layout === "grid" &&
          ok.times.length > 0 && (
          <table
            className="w-full border-collapse text-center text-xs"
            style={{ minWidth: 56 + ok.days.length * 72 }}
          >
            <thead>
              <tr className="bg-base/60">
                <th className="sticky left-0 z-10 w-14 bg-base/60 px-2 py-2 font-medium text-faint">
                  時間
                </th>
                {ok.days.map((d) => (
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
              {ok.times.map((t) => (
                <tr key={t} className="border-t border-line/70">
                  <td className="sticky left-0 z-10 bg-surface px-2 py-1.5 font-medium tabular-nums text-muted">
                    {t}
                  </td>
                  {ok.days.map((d) => {
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
                            onClick={() => pick(d.date, t)}
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
        <div
          ref={guestSectionRef}
          className="animate-fade-in scroll-mt-4 space-y-4 rounded-xl border border-accent/40 bg-accent/5 p-4"
        >
          <p className="text-sm font-medium text-ink">
            選択中：{formatLongDate(picked.date)}　{picked.time}〜
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
                ref={guestNameRef}
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

/** 枠限定: 日付ごとに枠をボタンで並べる。 */
function SlotList({
  days,
  slotCapacity,
  picked,
  onPick,
}: {
  days: AvailabilityDay[];
  slotCapacity: number | null;
  picked: { date: string; time: string } | null;
  onPick: (date: string, time: string) => void;
}) {
  const anyFree = days.some((d) => Object.values(d.avail).some(Boolean));
  return (
    <div className="space-y-4 p-3">
      {!anyFree && (
        <p className="rounded-lg bg-base px-3 py-2 text-center text-xs text-muted">
          この期間の枠はすべて満席です。
        </p>
      )}
      {days.map((d) => (
        <div key={d.date}>
          <p
            className={`mb-2 text-sm font-medium ${
              d.weekend === 0
                ? "text-danger"
                : d.weekend === 6
                  ? "text-info"
                  : "text-ink"
            }`}
          >
            {formatLongDate(d.date)}
          </p>
          <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
            {Object.keys(d.avail)
              .sort()
              .map((t) => {
                const free = d.avail[t];
                const isPicked = picked?.date === d.date && picked?.time === t;
                const left = d.remaining?.[t];
                if (!free) {
                  return (
                    <div
                      key={t}
                      className="flex h-14 flex-col items-center justify-center rounded-xl border border-line bg-base/60 text-sm tabular-nums text-faint"
                    >
                      {t}〜
                      <span className="text-[10px]">満席</span>
                    </div>
                  );
                }
                return (
                  <button
                    key={t}
                    type="button"
                    onClick={() => onPick(d.date, t)}
                    aria-label={`${formatLongDate(d.date)} ${t} 予約可能`}
                    className={`flex h-14 flex-col items-center justify-center rounded-xl border text-sm font-semibold tabular-nums transition-colors ${
                      isPicked
                        ? "border-danger bg-danger text-white"
                        : "border-danger/40 text-danger hover:bg-danger/10"
                    }`}
                  >
                    {t}〜
                    <span className="text-[10px] font-normal">
                      {isPicked
                        ? "選択中"
                        : slotCapacity != null && slotCapacity > 1 && left != null
                          ? `残り${left}`
                          : "◎ 空きあり"}
                    </span>
                  </button>
                );
              })}
          </div>
        </div>
      ))}
    </div>
  );
}
