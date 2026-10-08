"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useTransition,
  type ReactNode,
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
import {
  addDaysYmd,
  endTimeOf,
  formatLongDate,
  formatShortDate,
} from "@/feature/booking-link/lib/schedule";

/** 画面内の日付が連続した7日（従来の週表示）か。 */
function isWeekPage(days: AvailabilityDay[]): boolean {
  return (
    days.length === 7 && addDaysYmd(days[0].date, 6) === days[6].date
  );
}

/** 番号つきの手順見出し（1 メニュー → 2 日時 → 3 お客様情報）。 */
function Step({
  no,
  title,
  hint,
  children,
}: {
  no: number;
  title: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <section className="space-y-3">
      <div className="flex items-baseline gap-2.5">
        <span className="flex h-6 w-6 shrink-0 translate-y-[-1px] items-center justify-center rounded-full bg-accent text-[11px] font-semibold text-accent-fg">
          {no}
        </span>
        <h2 className="text-[15px] font-semibold tracking-wide text-ink">
          {title}
        </h2>
        {hint && <span className="text-[11px] text-faint">{hint}</span>}
      </div>
      {children}
    </section>
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
  const requireStaff = data.link.requireStaffSelection;
  // 表示中の画面の先頭日。null = 今日（サーバーが決める）
  const [cursor, setCursor] = useState<string | null>(null);

  const [shopId, setShopId] = useState<number>(data.shops[0]?.id ?? 0);
  // 選んだ店舗で受けられるメニューだけを出す（全店舗共通 + その店舗限定）。
  const menus = useMemo(
    () => data.menus.filter((m) => m.shopId == null || m.shopId === shopId),
    [data.menus, shopId],
  );
  const [menuId, setMenuId] = useState<number>(menus[0]?.id ?? 0);
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

  // 店舗を変えて、選んでいたメニューがその店舗に無ければ先頭のメニューに切り替える。
  useEffect(() => {
    if (!menus.some((m) => m.id === menuId)) setMenuId(menus[0]?.id ?? 0);
  }, [menus, menuId]);

  // 希望日時を選んだら入力欄まで自動スクロール + 名前欄にフォーカス。
  useEffect(() => {
    if (!picked) return;
    const el = guestSectionRef.current;
    if (!el) return;
    el.scrollIntoView({ behavior: "smooth", block: "start" });
    const t = setTimeout(() => guestNameRef.current?.focus(), 350);
    return () => clearTimeout(t);
  }, [picked]);

  const selectedMenu = menus.find((m) => m.id === menuId);
  // 指名できるのは、選んだメニューを担当できるスタッフだけ（設定「対応スタッフ」）。
  // 担当可否はサーバー側で予約登録と同じ基準で計算済み。
  const staffOptions = useMemo(() => {
    const capable = new Set(
      selectedMenu?.capableStaffIdsByShop[shopId] ?? [],
    );
    return (data.staffsByShop[shopId] ?? []).filter((s) => capable.has(s.id));
  }, [shopId, selectedMenu, data.staffsByShop]);

  // メニューを変えて対応できない人が選ばれたままにならないよう指名を解除する。
  useEffect(() => {
    if (!staffId) return;
    if (!staffOptions.some((s) => String(s.id) === staffId)) setStaffId("");
  }, [staffOptions, staffId]);

  // 指名必須のリンクは、スタッフを選ぶまで空き状況を出さない
  // （設備だけのメニューはスタッフを使わないので指名もしない）。
  const staffStep = requireStaff && (selectedMenu?.requiresStaff ?? true);
  const waitingForStaff = staffStep && !staffId;

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
    setPicked(null);
    if (!shopId || !menuId || waitingForStaff) {
      setAvail(null);
      return;
    }
    const id = ++requestId.current;
    startLoad(async () => {
      const r = await fetchAvailability();
      // 連打などで追い越された古い応答は捨てる
      if (id === requestId.current) setAvail(r);
    });
  }, [shopId, menuId, waitingForStaff, fetchAvailability]);

  function confirm() {
    setError(null);
    if (!picked) return;
    if (staffStep && !staffId) {
      setError("ご希望のスタッフを選んでください");
      return;
    }
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
    if (staffStep && staffId) fd.set("staffId", staffId);
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
  const selectedStaff = staffOptions.find((s) => String(s.id) === staffId);
  const navButton =
    "inline-flex h-9 shrink-0 items-center rounded-full border border-line bg-surface px-3.5 text-xs font-medium text-muted transition-colors hover:border-accent/60 hover:text-accent disabled:pointer-events-none disabled:opacity-35";

  return (
    <div className="space-y-8">
      <Step no={1} title="メニューを選ぶ">
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

        {menus.length === 0 ? (
          <p className="rounded-xl border border-line bg-base px-4 py-5 text-center text-sm text-muted">
            この店舗でオンライン予約できるメニューはありません。
          </p>
        ) : (
          <div
            role="radiogroup"
            aria-label="メニュー"
            className="grid gap-2"
          >
            {menus.map((m) => {
              const on = m.id === menuId;
              return (
                <button
                  key={m.id}
                  type="button"
                  role="radio"
                  aria-checked={on}
                  onClick={() => setMenuId(m.id)}
                  className={`flex items-center gap-3 rounded-xl border px-4 py-3 text-left transition-all ${
                    on
                      ? "border-accent bg-accent-soft/60 shadow-[0_0_0_1px_theme(colors.accent.DEFAULT)]"
                      : "border-line bg-surface hover:border-accent/50 hover:bg-accent-soft/20"
                  }`}
                >
                  <span
                    className={`flex h-4 w-4 shrink-0 items-center justify-center rounded-full border transition-colors ${
                      on ? "border-accent bg-accent" : "border-line bg-surface"
                    }`}
                    aria-hidden
                  >
                    {on && <span className="h-1.5 w-1.5 rounded-full bg-surface" />}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-medium text-ink">
                      {m.name}
                    </span>
                    <span className="mt-0.5 block text-xs text-muted">
                      {m.durationMin}分
                    </span>
                  </span>
                  <span className="shrink-0 text-sm font-semibold tabular-nums text-ink">
                    ¥{m.price.toLocaleString()}
                  </span>
                </button>
              );
            })}
          </div>
        )}

        {staffStep && (
          <div>
            <Label>ご希望スタッフ</Label>
            {staffOptions.length === 0 ? (
              <p className="rounded-xl border border-line bg-base px-4 py-3 text-sm text-muted">
                このメニューを担当できるスタッフがいません。
              </p>
            ) : (
              <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="ご希望スタッフ">
                {staffOptions.map((s) => {
                  const on = String(s.id) === staffId;
                  return (
                    <button
                      key={s.id}
                      type="button"
                      role="radio"
                      aria-checked={on}
                      onClick={() => setStaffId(String(s.id))}
                      className={`h-10 rounded-full border px-4 text-sm transition-colors ${
                        on
                          ? "border-accent bg-accent font-semibold text-accent-fg"
                          : "border-line bg-surface text-ink hover:border-accent/60"
                      }`}
                    >
                      {s.name}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </Step>

      <Step no={2} title="日時を選ぶ">
        {notice && (
          <p className="rounded-xl border border-warn/40 bg-warn/10 px-3 py-2 text-sm text-warn">
            {notice}
          </p>
        )}

        {waitingForStaff ? (
          <p className="rounded-xl border border-dashed border-line bg-base/60 px-4 py-8 text-center text-sm text-muted">
            ご希望のスタッフを選ぶと、空き状況が表示されます。
          </p>
        ) : (
          <>
            {/* Date navigation（1画面に収まるときは出さない） */}
            {ok && (ok.prevCursor || ok.nextCursor) && (
              <div className="flex items-center justify-between gap-2">
                <button
                  type="button"
                  disabled={!ok.prevCursor || loading}
                  onClick={() => ok.prevCursor && setCursor(ok.prevCursor)}
                  className={navButton}
                >
                  {weekPage ? "‹ 前の一週間" : "‹ 前の日程"}
                </button>
                <span className="text-center text-xs font-medium tabular-nums text-muted">
                  {pageLabel}
                </span>
                <button
                  type="button"
                  disabled={!ok.nextCursor || loading}
                  onClick={() => ok.nextCursor && setCursor(ok.nextCursor)}
                  className={navButton}
                >
                  {weekPage ? "次の一週間 ›" : "次の日程 ›"}
                </button>
              </div>
            )}

            <div className="overflow-x-auto rounded-2xl border border-line bg-surface">
              {loading && (
                <div className="flex items-center justify-center gap-2 px-3 py-12 text-sm text-faint">
                  <span className="h-4 w-4 animate-spin rounded-full border-2 border-line border-t-accent" />
                  空き状況を読み込み中…
                </div>
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
                  durationMin={selectedMenu?.durationMin ?? null}
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
                    この日程には、ご予約いただける時間がありません。
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
                      <tr className="bg-base/70">
                        <th className="sticky left-0 z-10 w-14 bg-base/95 px-2 py-2.5 font-medium text-faint">
                          時間
                        </th>
                        {ok.days.map((d) => (
                          <th
                            key={d.date}
                            className={`px-1 py-2.5 font-medium ${
                              d.weekend === 0
                                ? "text-danger"
                                : d.weekend === 6
                                  ? "text-info"
                                  : "text-muted"
                            }`}
                          >
                            <div className="text-[13px] tabular-nums">{d.label}</div>
                            <div className="text-[10px]">({d.dow})</div>
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {ok.times.map((t) => (
                        <tr key={t} className="border-t border-line/60">
                          <td className="sticky left-0 z-10 bg-surface px-2 py-1 font-medium tabular-nums text-muted">
                            {t}
                          </td>
                          {ok.days.map((d) => {
                            const free = d.avail[t];
                            const isPicked =
                              picked?.date === d.date && picked?.time === t;
                            return (
                              <td
                                key={d.date}
                                className="border-l border-line/50 p-1"
                              >
                                {free ? (
                                  <button
                                    type="button"
                                    onClick={() => pick(d.date, t)}
                                    className={`flex h-9 w-full items-center justify-center rounded-lg text-base font-semibold transition-colors ${
                                      isPicked
                                        ? "bg-danger text-[11px] text-white shadow-sm"
                                        : "text-danger hover:bg-danger/10"
                                    }`}
                                    aria-label={`${d.label} ${t} 予約可能`}
                                  >
                                    {isPicked ? "選択中" : "◎"}
                                  </button>
                                ) : (
                                  <div className="flex h-9 w-full items-center justify-center text-faint/50">
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
            {ok && ok.layout === "grid" && ok.times.length > 0 && !loading && (
              <p className="flex items-center justify-end gap-3 text-[11px] text-faint">
                <span>
                  <span className="font-semibold text-danger">◎</span> ご予約いただけます
                </span>
                <span>× 受付不可</span>
              </p>
            )}
          </>
        )}
      </Step>

      {/* Guest details once a slot is chosen */}
      {picked && (
        <div
          ref={guestSectionRef}
          className="animate-fade-in scroll-mt-4"
        >
          <Step no={3} title="お客様情報">
            <div className="space-y-4 rounded-2xl border border-accent/40 bg-accent-soft/30 p-4 sm:p-5">
              <div className="rounded-xl bg-surface px-4 py-3 shadow-sm">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-[11px] font-medium text-faint">ご予約内容</p>
                    <p className="mt-0.5 text-base font-semibold text-ink">
                      {formatLongDate(picked.date)}　{picked.time}〜
                      {selectedMenu && endTimeOf(picked.time, selectedMenu.durationMin)}
                    </p>
                    <p className="mt-0.5 truncate text-xs text-muted">
                      {selectedMenu?.name}
                      {selectedStaff && ` ／ 担当 ${selectedStaff.name}`}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setPicked(null)}
                    className="shrink-0 text-xs text-accent-hover underline underline-offset-2"
                  >
                    選び直す
                  </button>
                </div>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <Label>お名前</Label>
                  <Input
                    ref={guestNameRef}
                    required
                    autoComplete="name"
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
                    autoComplete="tel"
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
                className="h-12 w-full text-[15px]"
                onClick={confirm}
                disabled={submitting}
              >
                {submitting ? "送信中…" : "この内容で予約する"}
              </Button>
            </div>
          </Step>
        </div>
      )}
    </div>
  );
}

/** 枠限定: 日付ごとに枠をボタンで並べる。 */
function SlotList({
  days,
  slotCapacity,
  durationMin,
  picked,
  onPick,
}: {
  days: AvailabilityDay[];
  slotCapacity: number | null;
  /** 選んだメニューの施術時間。終了時刻（開始 + 施術時間）を枠に出すのに使う */
  durationMin: number | null;
  picked: { date: string; time: string } | null;
  onPick: (date: string, time: string) => void;
}) {
  const anyFree = days.some((d) => Object.values(d.avail).some(Boolean));
  const range = (t: string) =>
    durationMin != null ? `${t}〜${endTimeOf(t, durationMin)}` : `${t}〜`;
  return (
    <div className="space-y-5 p-4">
      {!anyFree && (
        <p className="rounded-lg bg-base px-3 py-2 text-center text-xs text-muted">
          この期間の枠はすべて満席です。
        </p>
      )}
      {days.map((d) => (
        <div key={d.date}>
          <p
            className={`mb-2 text-sm font-semibold ${
              d.weekend === 0
                ? "text-danger"
                : d.weekend === 6
                  ? "text-info"
                  : "text-ink"
            }`}
          >
            {formatLongDate(d.date)}
          </p>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
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
                      <span className="line-through decoration-faint/50">{range(t)}</span>
                      <span className="text-[10px]">満席</span>
                    </div>
                  );
                }
                return (
                  <button
                    key={t}
                    type="button"
                    onClick={() => onPick(d.date, t)}
                    aria-label={`${formatLongDate(d.date)} ${range(t)} 予約可能`}
                    className={`flex h-14 flex-col items-center justify-center rounded-xl border text-sm font-semibold tabular-nums transition-all ${
                      isPicked
                        ? "border-danger bg-danger text-white shadow-sm"
                        : "border-danger/40 bg-surface text-danger hover:-translate-y-px hover:bg-danger/5 hover:shadow-sm"
                    }`}
                  >
                    {range(t)}
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
