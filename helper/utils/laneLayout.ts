export type LaneItem = { id: number; start: number; end: number };

/**
 * 同一行（スタッフ/設備）内で時間が重なる予約を、縦方向のレーンに振り分ける。
 * 通常（重なり無し）は全件 lane=0 / lanes=1 となり、従来表示と同じ。
 * ダブルブッキング時のみ lanes>1 となり、カードを上下に並べて表示できる。
 *
 * 返り値: 予約id → { lane: そのカードのレーン番号, lanes: 同じ重なり集団のレーン総数 }
 */
export function assignLanes(
  items: LaneItem[],
): Map<number, { lane: number; lanes: number }> {
  const result = new Map<number, { lane: number; lanes: number }>();
  if (items.length === 0) return result;

  const sorted = [...items].sort((a, b) => a.start - b.start || a.end - b.end);

  // 各レーンの「最後の予約の終了時刻」を保持し、空いた最小レーンへ割り当てる。
  const laneEnd: number[] = [];
  const laneOf = new Map<number, number>();
  for (const it of sorted) {
    let lane = laneEnd.findIndex((end) => end <= it.start);
    if (lane === -1) {
      lane = laneEnd.length;
      laneEnd.push(it.end);
    } else {
      laneEnd[lane] = it.end;
    }
    laneOf.set(it.id, lane);
  }

  // 連続して重なる集団（クラスタ）ごとにレーン総数を共有させ、高さを揃える。
  let cluster: LaneItem[] = [];
  let clusterMaxEnd = -Infinity;
  const flush = () => {
    if (cluster.length === 0) return;
    const lanes = Math.max(...cluster.map((it) => laneOf.get(it.id)!)) + 1;
    for (const it of cluster) {
      result.set(it.id, { lane: laneOf.get(it.id)!, lanes });
    }
    cluster = [];
  };
  for (const it of sorted) {
    if (cluster.length === 0 || it.start < clusterMaxEnd) {
      cluster.push(it);
      clusterMaxEnd = Math.max(clusterMaxEnd, it.end);
    } else {
      flush();
      cluster = [it];
      clusterMaxEnd = it.end;
    }
  }
  flush();

  return result;
}
