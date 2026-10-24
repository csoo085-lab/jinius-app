// 내 통장 간 이체 찾기 (예: 관리비 통장 → 주차비 통장)
// 같은 건물의 서로 다른 통장에서, 같은 금액의 출금·입금이 하루 안에 있으면 한 쌍으로 봄
// → 비용·수입이 아니라 예금끼리 옮긴 돈 (차) 받는 통장 / 대) 보낸 통장), 증빙도 필요 없음

export const TRANSFER_CATEGORY = "통장 이체";

const dayDiff = (a, b) => Math.abs((new Date(a + "T00:00:00") - new Date(b + "T00:00:00")) / 86400000);

// 결과: { [txnId]: { role: "out" | "in", pair: 상대 거래, to, from } }
export function findTransfers(txns) {
  const out = {};
  const list = (txns || []).filter((t) => t.account_label);
  const labels = new Set(list.map((t) => t.account_label));
  if (labels.size < 2) return out;
  const ins = list.filter((t) => t.direction === "입금");
  const used = new Set();
  list.filter((t) => t.direction === "출금" && !t.expense_id)
    .sort((a, b) => (a.txn_at || "").localeCompare(b.txn_at || ""))
    .forEach((o) => {
      let best = null;
      ins.forEach((i) => {
        if (used.has(i.id) || i.account_label === o.account_label || Number(i.amount) !== Number(o.amount)) return;
        const d = dayDiff(i.txn_date, o.txn_date);
        if (d <= 1 && (!best || d < best.d)) best = { i, d };
      });
      if (best) {
        used.add(best.i.id);
        out[o.id] = { role: "out", pair: best.i, from: o.account_label, to: best.i.account_label };
        out[best.i.id] = { role: "in", pair: o, from: o.account_label, to: best.i.account_label };
      }
    });
  return out;
}

export const isTransferItem = (rc) => rc?.category === TRANSFER_CATEGORY;
