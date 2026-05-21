import type { ReservationRow } from "@/feature/reservation/services/getReservations";

/**
 * 予約一覧の楽観的更新（useOptimistic）に用いるアクション。
 * - `add`: 1件追加（単独スタッフのブロック・通常予約の新規作成）
 * - `addMany`: 複数件追加（「全員」時間ブロック作成）
 * - `update`: 既存1件を id 一致で置換
 * - `delete`: id 一致で除去
 */
export type ReservationOptimisticAction =
  | { type: "add"; row: ReservationRow }
  | { type: "addMany"; rows: ReservationRow[] }
  | { type: "update"; row: ReservationRow }
  | { type: "delete"; id: number };

export type ReservationOptimisticDispatch = (
  action: ReservationOptimisticAction,
) => void;
