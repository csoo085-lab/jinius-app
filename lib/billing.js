// 관리비 고지서 계산 (아진 엑셀 방식)
// - 항목별 금액은 소수점 그대로 두고, 세대별 최종 합계에서만 10원 미만 절사
// - 끝수를 특정 세대에 몰아주지 않음 (절사로 덜 걷히는 금액은 그대로 둠)

// 부산 가정용 상·하수도 (2026년 2월 납기분부터) — 요금이 바뀌면 여기만 고침
export const WATER_TIERS_BUSAN_2026 = [
  { upTo: 10, price: 1649.8 },        // 상수도 920 + 하수도 580 + 물이용부담금 149.8
  { upTo: 20, price: 1819.8 },        // 하수도 750
  { upTo: 30, price: 1859.8 },        // 하수도 790
  { upTo: Infinity, price: 2179.8 },  // 하수도 1,110
];

// 구간별 사용량·금액 [{ tons, price, amount }]
export function waterTierSplit(tons, tiers = WATER_TIERS_BUSAN_2026) {
  const out = [];
  let left = Math.max(0, Number(tons) || 0);
  let prev = 0;
  for (const t of tiers) {
    const cap = t.upTo - prev;
    const used = Math.min(left, cap);
    out.push({ tons: used, price: t.price, amount: used * t.price });
    left -= used;
    prev = t.upTo;
  }
  return out;
}
export const waterUsageCharge = (tons, tiers) => waterTierSplit(tons, tiers).reduce((s, x) => s + x.amount, 0);

export const floor10 = (n) => Math.floor((Number(n) || 0) / 10 + 1e-9) * 10;
const ratio = (d) => (d && d[1] ? (Number(d[0]) || 0) / Number(d[1]) : 1);

/**
 * 고지서 계산
 * units: [{ ho, area, fee, parking, feeDays:[사용,전체], parkDays:[사용,전체], tv, unpaid, deduct, repair,
 *           elecClaim (세대전기: 한전 세대별 청구요금), elecDiscount (한전 감면금액), elecDiscountType,
 *           waterDiscount (수도 감면금액), elecPrev, elecCur, waterPrev, waterCur, waterUse }]
 * 감면: 고지서에는 감면 전 금액(청구액 + 감면금액)을 적고, 감면금액을 따로 적어 뺀 금액을 부과
 * opts: {
 *   elecMode: "세대전기" | "공용전기" | "없음",
 *   elecAreaExtra: 세대전기 건물에서 면적으로 나눌 금액 (한전 연체료·가산금 등),
 *   elecCommonTotal: 공용전기 건물에서 면적으로 나눌 청구금액,
 *   tvFee: TV 있는 세대 수신료 (기본 2,500),
 *   waterMode: "세대수도" | "없음", waterBill: 수도 고지서 청구액, waterTiers
 * }
 */
export function computeBills(units, opts = {}) {
  const {
    elecMode = "세대전기", elecAreaExtra = 0, elecCommonTotal = 0, tvFee = 2500,
    waterMode = "세대수도", waterBill = 0, waterTiers = WATER_TIERS_BUSAN_2026,
  } = opts;
  const totalArea = units.reduce((s, u) => s + (Number(u.area) || 0), 0);
  const n = units.length;

  // 수도: 사용요금 합계를 먼저 구하고, 기본료 = (청구액 + 감면 합계 − 사용요금 합계) ÷ 세대수
  //  (수도 고지서 청구액은 감면이 빠진 금액이므로, 감면을 더해 감면 전 금액으로 나눈 뒤 감면 세대에서만 뺌)
  const usage = units.map((u) => (waterMode === "세대수도" ? waterUsageCharge(u.waterUse, waterTiers) : 0));
  const usageSum = usage.reduce((s, x) => s + x, 0);
  const waterDiscSum = waterMode === "세대수도" ? units.reduce((s, u) => s + (Number(u.waterDiscount) || 0), 0) : 0;
  const waterBase = waterMode === "세대수도" && n ? (Number(waterBill) + waterDiscSum - usageSum) / n : 0;

  const rows = units.map((u, i) => {
    const areaShare = totalArea ? (Number(u.area) || 0) / totalArea : 0;
    const fee = (Number(u.fee) || 0) * ratio(u.feeDays);
    const parking = (Number(u.parking) || 0) * ratio(u.parkDays);
    let elecClaim = 0, elecTv = 0, elecExtra = 0, elecCommon = 0, elecDiscount = 0;
    if (elecMode === "세대전기") {
      elecClaim = Number(u.elecClaim) || 0;
      elecDiscount = Number(u.elecDiscount) || 0;
      elecTv = u.tv ? tvFee : 0;
      elecExtra = (Number(elecAreaExtra) || 0) * areaShare;
    } else if (elecMode === "공용전기") {
      elecCommon = (Number(elecCommonTotal) || 0) * areaShare;
    }
    const elecGross = elecClaim + elecDiscount + elecTv + elecExtra + elecCommon; // 고지서 표기 (감면 전)
    const elec = elecGross - elecDiscount;                                        // 부과
    const waterDiscount = waterMode === "세대수도" ? Number(u.waterDiscount) || 0 : 0;
    const waterGross = waterMode === "세대수도" ? waterBase + usage[i] : 0;
    const water = waterGross - waterDiscount;
    const subtotal = fee + parking + elec + water;
    const net = subtotal - (Number(u.deduct) || 0) + (Number(u.repair) || 0);
    const charge = floor10(net);
    const unpaid = Number(u.unpaid) || 0;
    return {
      ...u, fee, parking, elecClaim, elecTv, elecExtra, elecCommon, elecDiscount, elecGross, elec, waterDiscount, waterGross,
      waterBase: waterMode === "세대수도" ? waterBase : 0, waterUsage: usage[i], water,
      waterTiers: waterMode === "세대수도" ? waterTierSplit(u.waterUse, waterTiers) : [],
      subtotal, net, charge, cut: net - charge, unpaid, total: charge + unpaid,
    };
  });

  const sum = (k) => rows.reduce((s, r) => s + (Number(r[k]) || 0), 0);
  return {
    rows,
    totals: {
      units: n, area: totalArea, fee: sum("fee"), parking: sum("parking"), elec: sum("elec"), elecClaim: sum("elecClaim"),
      elecTv: sum("elecTv"), elecExtra: sum("elecExtra"), elecDiscount: sum("elecDiscount"), waterDiscount: waterDiscSum, water: sum("water"), waterUse: sum("waterUse"),
      waterUsage: usageSum, waterBase, net: sum("net"), charge: sum("charge"), cut: sum("cut"), unpaid: sum("unpaid"), total: sum("total"),
    },
  };
}

// 수도 조정안: 2차 사용량 합계를 고지서 사용량에 맞추기
// - 공실·사용량 0 세대는 건드리지 않음
// - 모자라면 전월보다 적게 쓴 세대부터 +1톤, 남으면 전월보다 많이 쓴 세대부터 −1톤 (세대당 최대 ±3톤)
export function proposeWaterAdjust(rows, target, maxPerUnit = 3) {
  const cur = rows.map((r) => ({ ...r, adj: 0 }));
  let diff = Math.round(Number(target) - cur.reduce((s, r) => s + (Number(r.use) || 0), 0));
  const sign = Math.sign(diff);
  if (!sign) return { diff: 0, rows: cur, left: 0 };
  const pool = cur.filter((r) => !r.vacant && Number(r.use) > 0)
    .sort((a, b) => sign * ((Number(b.prevUse) || 0) - (Number(b.use) || 0)) - sign * ((Number(a.prevUse) || 0) - (Number(a.use) || 0)));
  let round = 0;
  while (diff !== 0 && round < maxPerUnit && pool.length) {
    for (const r of pool) {
      if (diff === 0) break;
      if (sign < 0 && Number(r.use) + r.adj <= 1) continue;
      r.adj += sign;
      diff -= sign;
    }
    round++;
  }
  return { diff: Math.round(Number(target) - cur.reduce((s, r) => s + (Number(r.use) || 0), 0)), rows: cur, left: diff };
}
