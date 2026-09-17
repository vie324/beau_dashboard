import { describe, expect, it } from "vitest";
import {
  APPT_STATUS,
  CANCEL_STATUSES,
  isCancelledStatus,
} from "@/helper/utils/status";

describe("キャンセル通知の対象ステータス", () => {
  it("キャンセル・当日キャンセルが通知対象", () => {
    expect(CANCEL_STATUSES).toEqual([
      APPT_STATUS.CANCEL,
      APPT_STATUS.SAME_DAY_CANCEL,
    ]);
  });

  it("no-show は通知対象に含めない（後から店舗が付ける記録のため）", () => {
    expect(CANCEL_STATUSES.includes(APPT_STATUS.NO_SHOW)).toBe(false);
  });

  it("isCancelledStatus は枠が空くステータスすべてに true", () => {
    expect(isCancelledStatus(APPT_STATUS.CANCEL)).toBe(true);
    expect(isCancelledStatus(APPT_STATUS.SAME_DAY_CANCEL)).toBe(true);
    expect(isCancelledStatus(APPT_STATUS.NO_SHOW)).toBe(true);
    expect(isCancelledStatus(APPT_STATUS.WAITING)).toBe(false);
    expect(isCancelledStatus(APPT_STATUS.DONE)).toBe(false);
  });
});
