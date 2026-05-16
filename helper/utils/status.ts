export const APPT_STATUS = {
  WAITING: 0,
  IN_SERVICE: 1,
  DONE: 2,
  CANCEL: 3,
  SAME_DAY_CANCEL: 4,
  NO_SHOW: 99,
} as const;

export type ApptStatus = (typeof APPT_STATUS)[keyof typeof APPT_STATUS];

interface StatusMeta {
  label: string;
  // tailwind classes for the badge
  className: string;
}

const META: Record<number, StatusMeta> = {
  0: { label: "待機", className: "bg-info/15 text-info border-info/30" },
  1: { label: "施術中", className: "bg-accent/15 text-accent border-accent/30" },
  2: { label: "完了", className: "bg-ok/15 text-ok border-ok/30" },
  3: { label: "キャンセル", className: "bg-faint/15 text-muted border-line" },
  4: {
    label: "当日キャンセル",
    className: "bg-danger/10 text-danger border-danger/30",
  },
  99: { label: "no-show", className: "bg-danger/15 text-danger border-danger/30" },
};

export function statusMeta(status: number): StatusMeta {
  return META[status] ?? META[0];
}

export const STATUS_OPTIONS = [
  { value: 0, label: "待機" },
  { value: 1, label: "施術中" },
  { value: 2, label: "完了" },
  { value: 3, label: "キャンセル" },
  { value: 4, label: "当日キャンセル" },
  { value: 99, label: "no-show" },
];

/** Cancelled-ish statuses free the time slot. */
export const FREEING_STATUSES = [
  APPT_STATUS.CANCEL,
  APPT_STATUS.SAME_DAY_CANCEL,
  APPT_STATUS.NO_SHOW,
];
