// 관리비 부과 내역 엑셀 읽기
// - 회계프로그램 "세대별 관리비 조정집계표": 호실마다 3줄, 칸마다 항목 3개(윗줄·가운데줄·아랫줄)
//   머리글(동호 / 면적 …)이 쪽마다 반복됨
// 결과: { month, buildingName, items: [{ name, total }], units: [{ ho, area, values, charge, unpaid, unpaidLate }], totals }

const clean = (v) => String(v ?? "").replace(/\s+/g, "");
const num = (v) => {
  if (typeof v === "number") return v;
  const s = String(v ?? "").replace(/[,\s원]/g, "");
  return s === "" || isNaN(Number(s)) ? 0 : Number(s);
};

// 금액이 아닌 칸 (사용량·소계·합계 등) — 부과 항목에서 뺌
const NOT_ITEM = /^(동호|면적|확인|소계|당월소계|미납관리비|미납연체료|납기내금액|납기후금액|연체료|가수금|.*량)$/;
// 이름 다듬기 (잘린 이름 보정)
const FIX = { 생활폐기물수수: "생활폐기물수수료", 전기금액: "세대전기료", 수도금액: "세대수도료", 하수도금액: "하수도료" };

export async function parseFeeSheet(file) {
  const XLSX = await import("xlsx");
  const wb = XLSX.read(await file.arrayBuffer(), { type: "array" });
  for (const name of wb.SheetNames) {
    const rows = XLSX.utils.sheet_to_json(wb.Sheets[name], { header: 1, raw: true, defval: "" });
    const res = parseRows(rows);
    if (res) return res;
  }
  throw new Error("'세대별 관리비 조정집계표' 형식을 찾지 못했습니다. (동호 · 면적 머리글이 있는 엑셀이어야 해요)");
}

export function parseRows(rows) {
  const hi = rows.findIndex((r) => clean(r[0]) === "동호");
  if (hi < 0) return null;
  // (칸, 줄) → 항목 이름
  const map = {};
  const width = Math.max(...rows.slice(hi, hi + 3).map((r) => r.length));
  for (let c = 1; c < width; c++) {
    for (let o = 0; o < 3; o++) {
      const n = clean(rows[hi + o]?.[c]);
      if (n) map[`${c}:${o}`] = FIX[n] || n;
    }
  }
  const col = (label) => {
    const k = Object.keys(map).find((x) => map[x] === label);
    return k ? k.split(":").map(Number) : null;
  };
  const C = { charge: col("당월소계"), unpaid: col("미납관리비"), unpaidLate: col("미납연체료"), check: col("확인") };
  const head = rows.slice(0, hi).map((r) => r.map((x) => String(x ?? "")).join(" ")).join(" ");
  const ym = head.match(/부과년월\s*:?\s*(\d{4})\s*년\s*(\d{1,2})\s*월/) || head.match(/(\d{4})\s*년\s*(\d{1,2})\s*월/);
  const month = ym ? `${ym[1]}-${String(ym[2]).padStart(2, "0")}` : "";
  const bm = head.match(/단지명\s*:?\s*(\S+)/);

  const itemKeys = Object.keys(map).filter((k) => !NOT_ITEM.test(map[k]));
  const units = [];
  for (let r = hi + 3; r < rows.length - 2; r++) {
    const a = rows[r], b = rows[r + 1];
    const label0 = clean(a[0]);
    if (label0 === "동호") { r += 2; continue; } // 다음 쪽 머리글
    if (/소계|합계/.test(label0)) { r += 2; continue; }
    const hoRaw = a[1];
    if (hoRaw === "" || hoRaw == null || typeof b?.[0] !== "number") continue;
    const ho = String(typeof hoRaw === "number" ? hoRaw : clean(hoRaw)).replace(/호$/, "");
    const at = ([c, o]) => num(rows[r + o]?.[c]);
    const values = {};
    itemKeys.forEach((k) => {
      const [c, o] = k.split(":").map(Number);
      const v = num(rows[r + o]?.[c]);
      if (v) values[map[k]] = (values[map[k]] || 0) + v;
    });
    units.push({
      ho, dong: String(a[0] ?? ""), area: num(b[0]), values,
      charge: C.charge ? at(C.charge) : Object.values(values).reduce((s, v) => s + v, 0),
      unpaid: C.unpaid ? at(C.unpaid) : 0,
      unpaidLate: C.unpaidLate ? at(C.unpaidLate) : 0,
    });
    r += 2;
  }
  if (!units.length) return null;

  // 항목 순서는 머리글 순서대로, 합계가 0인 항목은 뺌
  const order = [];
  itemKeys.sort((x, y) => { const [c1, o1] = x.split(":").map(Number); const [c2, o2] = y.split(":").map(Number); return o1 - o2 || c1 - c2; })
    .forEach((k) => { if (!order.includes(map[k])) order.push(map[k]); });
  const items = order.map((name) => ({ name, total: units.reduce((s, u) => s + (u.values[name] || 0), 0) })).filter((i) => i.total);
  const sum = (k) => units.reduce((s, u) => s + (Number(u[k]) || 0), 0);
  const itemsTotal = items.reduce((s, i) => s + i.total, 0);
  return {
    month, buildingName: bm ? bm[1] : "", items, units,
    totals: { charge: sum("charge"), unpaid: sum("unpaid"), unpaidLate: sum("unpaidLate"), items: itemsTotal, rounding: sum("charge") - itemsTotal, units: units.length },
  };
}
