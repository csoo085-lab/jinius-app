// 고정지출 목록 ↔ 통장 출금 맞추기, 입금자명 ↔ 호실

// 비교용: 공백·괄호·(주) 등을 빼고 소문자로
export const normText = (s) => String(s || "").replace(/\(주\)|㈜|주식회사/g, "").replace(/[\s()[\]·.,-]/g, "").toLowerCase();

export const normPayer = (s) => String(s || "").replace(/\s+/g, "").trim();

export const unitLabel = (u) => (u ? `${u.dong || ""} ${u.ho || ""}`.trim() : "");

export function keywordsOf(item) {
  const ks = String(item.keyword || "").split(/[,/]/).map((k) => normText(k)).filter(Boolean);
  return ks.length ? ks : [normText(item.name)].filter(Boolean);
}

// 출금 한 건이 어느 고정지출인지 (직접 지정한 것이 먼저, 없으면 글자로 찾기)
export function matchRecurring(txn, items) {
  if (!txn || txn.direction !== "출금" || !items?.length) return null;
  if (txn.recurring_id) return items.find((i) => i.id === txn.recurring_id) || null;
  const text = normText(`${txn.description || ""} ${txn.txn_type || ""}`);
  if (!text) return null;
  return items.find((i) => i.active !== false && keywordsOf(i).some((k) => text.includes(k))) || null;
}

const shift = (month, d) => {
  const [y, m] = month.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1 + d, 1));
  return dt.toISOString().slice(0, 7);
};

// "9월분" — 이 달에 내는 지출이 어느 달 비용인지
export const periodLabel = (item, month) => `${Number((item?.period === "당월" ? month : shift(month, -1)).slice(5))}월분`;

const todayKST = () => new Date().toLocaleDateString("sv-SE", { timeZone: "Asia/Seoul" });

// 이번 달 고정지출 현황: [{ item, txns, paid, status: 지급|미지급|예정 }]
export function recurringStatus(items, txns, month) {
  const today = todayKST();
  const thisMonth = today.slice(0, 7);
  const out = (txns || []).filter((t) => t.direction === "출금" && (t.txn_date || "").slice(0, 7) === month);
  return (items || []).filter((i) => i.active !== false).map((item) => {
    const list = out.filter((t) => matchRecurring(t, items)?.id === item.id);
    const paid = list.reduce((s, t) => s + Number(t.amount || 0), 0);
    let status = list.length ? "지급" : "미지급";
    if (!list.length && (month > thisMonth || (month === thisMonth && item.pay_day && Number(today.slice(8)) < item.pay_day))) status = "예정";
    return { item, txns: list, paid, status };
  });
}

// 고정지출 후보: 여러 달에 걸쳐 같은 곳으로 나간 출금 (아직 목록에 없는 것)
export function recurringCandidates(items, txns) {
  const groups = {};
  (txns || []).filter((t) => t.direction === "출금" && !matchRecurring(t, items)).forEach((t) => {
    const key = normText(t.description);
    if (!key || key.length < 2) return;
    const g = (groups[key] = groups[key] || { name: (t.description || "").trim(), months: new Set(), amounts: [], days: [] });
    g.months.add(t.txn_date.slice(0, 7));
    g.amounts.push(Number(t.amount));
    g.days.push(Number(t.txn_date.slice(8)));
  });
  return Object.values(groups).filter((g) => g.months.size >= 2).map((g) => {
    const days = [...g.days].sort((a, b) => a - b);
    const amounts = [...g.amounts];
    const same = amounts.every((a) => a === amounts[0]);
    return { name: g.name, months: g.months.size, amount: same ? amounts[0] : null, avg: Math.round(amounts.reduce((s, a) => s + a, 0) / amounts.length), pay_day: days[Math.floor(days.length / 2)] };
  }).sort((a, b) => b.months - a.months || b.avg - a.avg);
}
