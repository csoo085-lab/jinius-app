// 고정지출의 "달별 결재" 관리
// - 고정지출 항목마다 시작월부터 매달 1건씩 낼 몫(○월분)이 생김
// - 통장 출금은 그 항목의 가장 오래된 미결재 달부터 금액만큼 채움 (두 번에 나눠 내도, 두 달 치를 한 번에 내도 됨)
// - 금액이 정해진 달(예상 금액 또는 그달 청구액)은 결재 전까지 미지급금으로 장부에 남음

import { matchRecurring, keywordsOf } from "./recurring";
import { TRANSFER_CATEGORY } from "./transfers";

const shiftMonth = (month, d) => {
  const [y, m] = month.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1 + d, 1)).toISOString().slice(0, 7);
};
export const monthEnd = (month) => {
  const [y, m] = month.split("-").map(Number);
  return `${month}-${String(new Date(y, m, 0).getDate()).padStart(2, "0")}`;
};
const monthsBetween = (from, to) => {
  const out = [];
  for (let m = from; m <= to && out.length < 120; m = shiftMonth(m, 1)) out.push(m);
  return out;
};

/**
 * items: 고정지출 목록, outflows: 시작월 이후 통장 출금 전체, bills: [{ recurring_id, month, amount }]
 * startMonth: 회계 시작월 (없으면 항목별 start_month 또는 첫 출금 달), uptoMonth: 이 달까지의 몫
 * 결과: { [itemId]: { item, dues: [{ month, amount, fixed, paid, payments: [{ txn, amount }], status }], extra: [{ txn, amount }] } }
 *   status: 결재 완료 / 일부 결재 / 미결재 / 금액 미정
 */
export function computeDues({ items, outflows, bills = [], startMonth = "", uptoMonth }) {
  const result = {};
  const billOf = {};
  (bills || []).forEach((b) => { billOf[`${b.recurring_id}:${b.month}`] = Number(b.amount); });
  const active = (items || []).filter((i) => i.category !== TRANSFER_CATEGORY);
  // 출금 내용(키워드)이 똑같은 항목끼리는 한 묶음 — 한 번에 묶어서 낸 돈을 항목별로 나눔 (예: 지니어스 = 위탁관리·청소·경비)
  const groupKey = (i) => [...keywordsOf(i)].sort().join(",");
  const pays = {}; // groupKey → 출금들
  (outflows || []).filter((t) => t.direction === "출금")
    .sort((a, b) => (a.txn_at || a.txn_date).localeCompare(b.txn_at || b.txn_date))
    .forEach((t) => {
      const rc = matchRecurring(t, items);
      if (!rc || rc.category === TRANSFER_CATEGORY) return;
      const key = t.recurring_id ? `id:${rc.id}` : groupKey(rc);
      (pays[key] = pays[key] || []).push(t);
    });

  active.forEach((item) => {
    const firstPay = (pays[`id:${item.id}`]?.[0] || pays[groupKey(item)]?.[0])?.txn_date || "";
    const first = item.start_month || startMonth || firstPay.slice(0, 7) || uptoMonth;
    const last = item.end_month && item.end_month < uptoMonth ? item.end_month : uptoMonth;
    const dues = (item.active === false ? [] : monthsBetween(first, last)).map((month) => {
      const b = billOf[`${item.id}:${month}`];
      const amount = Number.isFinite(b) ? b : (Number(item.amount) || null);
      return { month, amount, fixed: Number.isFinite(b), paid: 0, payments: [] };
    });
    result[item.id] = { item, dues, extra: [] };
  });

  // 묶음별로 오래된 달부터 채움: 같은 달이면 목록 순서대로 각 항목 몫을 채운 뒤 다음 달로
  Object.entries(pays).forEach(([key, list]) => {
    const members = key.startsWith("id:")
      ? [result[key.slice(3)]].filter(Boolean)
      : active.filter((i) => groupKey(i) === key).map((i) => result[i.id]);
    if (!members.length) return;
    const queue = members.flatMap((r, idx) => r.dues.map((d) => ({ d, r, idx })))
      .sort((a, b) => a.d.month.localeCompare(b.d.month) || a.idx - b.idx);
    const single = members.length === 1;
    let qi = 0;
    list.forEach((t) => {
      let amt = Number(t.amount) || 0;
      while (amt > 0 && qi < queue.length) {
        const { d } = queue[qi];
        if (d.amount == null) {
          if (!single) { qi++; continue; } // 묶음에서 금액 모르는 달은 건너뜀
          d.amount = amt; d.fromPayment = true; // 금액을 모르는 달은 실제 낸 금액이 그달 금액
        }
        // 몫을 채우고 1,000원 이하만 남았는데 다음 달 몫을 다 못 채우면 → 이체수수료 (예: 99,500원 = 99,000 + 수수료 500)
        if (amt <= 1000 && amt < Number(t.amount) && amt < d.amount - d.paid) break;
        const pay = Math.min(amt, d.amount - d.paid);
        if (pay > 0) { d.paid += pay; d.payments.push({ txn: t, amount: pay }); amt -= pay; }
        if (d.paid >= d.amount) qi++;
        else break;
      }
      if (amt > 0) members[0].extra.push({ txn: t, amount: amt }); // 몫보다 더 낸 금액 (다음 달 선결재 등)
    });
  });

  Object.values(result).forEach(({ dues }) => dues.forEach((d) => {
    d.status = d.amount == null ? "금액 미정" : d.paid >= d.amount ? "결재 완료" : d.paid > 0 ? "일부 결재" : "미결재";
  }));
  return result;
}

// 출금 id → 고정지출 결재로 처리되는지 (장부에서 비용 대신 미지급금 상환으로 잡음)
export function duesPaymentIds(duesMap) {
  const s = new Set();
  Object.values(duesMap || {}).forEach(({ dues, extra }) => {
    dues.forEach((d) => d.payments.forEach((p) => s.add(p.txn.id)));
    extra.forEach((x) => s.add(x.txn.id));
  });
  return s;
}
