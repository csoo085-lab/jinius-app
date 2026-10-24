// 고지서 작업용 파일 읽기
// - 한전 "종합아파트 세대별 요금내역" 엑셀(.xls)
// - 수도 검침표 엑셀 (월별 시트: 호수 / 당월지침 / 당월수정 / 전월지침 / 전월수정 / 사용량 / 1차 / 2차 / 비고)

const num = (v) => {
  if (typeof v === "number") return v;
  const s = String(v ?? "").replace(/[,\s원]/g, "");
  return s === "" || isNaN(Number(s)) ? null : Number(s);
};
const clean = (v) => String(v ?? "").replace(/\s+/g, "");
// 한전 할인구분 코드
export const KEPCO_DISCOUNT_CODES = {
  "2": "장애인", "3": "국가유공자", "4": "기초생계의료", "5": "독립유공자", "6": "대가족", "7": "사회복지", "8": "의료기기",
  "9": "차상위", A: "다자녀", B: "대가족(다자녀)", C: "차상위주거교육", D: "기초주거교육", E: "출산가구",
};
// 감면금액으로 보는 칸 (사용량0감액·자동이체 할인 등은 제외)
const KEPCO_DISCOUNT_COLS = ["필수사용공제", "복지추가감액", "요금할인", "에너지캐시백", "전기바우처"];

const hoOf = (v) => {
  const m = String(v ?? "").match(/(\d{3,4})/);
  return m ? String(Number(m[1])) : "";
};

export async function readSheets(fileOrBuffer) {
  const XLSX = await import("xlsx");
  const buf = fileOrBuffer.arrayBuffer ? await fileOrBuffer.arrayBuffer() : fileOrBuffer;
  const wb = XLSX.read(buf, { type: "array" });
  return wb.SheetNames.map((name) => ({
    name,
    rows: XLSX.utils.sheet_to_json(wb.Sheets[name], { header: 1, raw: true, defval: "" }),
  }));
}

// 한전 세대종합 → { customerNo, baseMonth, units: [{ ho, usage, claim }], common: { usage, claim } }
export async function parseKepcoUnits(file) {
  const sheets = await readSheets(file);
  for (const { rows } of sheets) {
    const hi = rows.findIndex((r) => r.some((c) => clean(c) === "청구전기요금") && r.some((c) => clean(c) === "호"));
    if (hi < 0) continue;
    const H = rows[hi].map(clean);
    const ci = { ho: H.indexOf("호"), name: H.findIndex((h) => h.startsWith("위치동호")), usage: H.indexOf("사용량"), claim: H.indexOf("청구전기요금"), code: H.indexOf("할인구분") };
    const dcols = KEPCO_DISCOUNT_COLS.map((k) => [k, H.indexOf(k)]).filter(([, i]) => i >= 0);
    const head = rows.slice(0, hi).flat().map(String).join(" ");
    const customerNo = (head.match(/고객번호\s*:\s*([\d-]+)/) || [])[1] || "";
    const baseMonth = (head.match(/기준월\s*:\s*(\d{4})년\s*(\d{1,2})월/) || []).slice(1).join("-");
    const units = [];
    let common = null;
    rows.slice(hi + 1).forEach((r) => {
      const claim = num(r[ci.claim]);
      if (claim == null) return;
      const label = String(r[ci.name] ?? "");
      if (/공용/.test(label)) { common = { usage: num(r[ci.usage]) || 0, claim }; return; }
      const ho = hoOf(r[ci.ho]) || hoOf(label);
      // 감면: 할인 칸의 금액(음수)을 양수로 더함
      const parts = {};
      dcols.forEach(([k, i]) => { const v = num(r[i]); if (v) parts[k] = -v; });
      const discount = Object.values(parts).reduce((a, b) => a + b, 0);
      const code = String(r[ci.code] ?? "").trim();
      if (ho) units.push({ ho, usage: num(r[ci.usage]) || 0, claim, discount, discountParts: parts, discountType: KEPCO_DISCOUNT_CODES[code] || (code ? code : "") });
    });
    if (!units.length) break;
    return { customerNo, baseMonth, units, common };
  }
  throw new Error("한전 '종합아파트 세대별 요금내역' 엑셀이 아닌 것 같아요. (청구전기요금 칸을 찾지 못했습니다)");
}

// 수도 검침표 → 마지막(또는 지정한) 시트의 세대별 지침·사용량
export async function parseWaterMeter(file, sheetName) {
  const sheets = await readSheets(file);
  const cand = sheets.filter(({ rows }) => rows.some((r) => clean(r[0]).replace(/\s/g, "") === "호수"));
  const sheet = (sheetName && cand.find((s) => s.name === sheetName)) || cand[cand.length - 1];
  if (!sheet) throw new Error("수도 검침표에서 '호 수' 머리글을 찾지 못했습니다.");
  const hi = sheet.rows.findIndex((r) => clean(r[0]) === "호수");
  const H = sheet.rows[hi].map(clean);
  const find = (re) => H.findIndex((h) => re.test(h));
  const ci = {
    cur: find(/^당월지침/), curAdj: find(/^당월수정/), prev: find(/^전월지침/), prevAdj: find(/^전월수정/),
    use: find(/^사용량$/), use1: find(/1차/), use2: find(/2차/), note: find(/^비고/),
  };
  const rows = [];
  let billTons = null;
  sheet.rows.slice(hi + 1).forEach((r) => {
    const label = clean(r[ci.prevAdj] ?? r[4]);
    if (/고지서/.test(label)) { billTons = num(r[ci.use2 >= 0 ? ci.use2 : ci.use]); return; }
    const ho = hoOf(r[0]);
    if (!ho || num(r[ci.cur]) == null) return;
    const cur = num(r[ci.cur]), curAdj = num(r[ci.curAdj]) ?? cur;
    const prev = num(r[ci.prev]), prevAdj = num(r[ci.prevAdj]) ?? prev;
    rows.push({
      ho, cur, curAdj, prev, prevAdj,
      use2: ci.use2 >= 0 ? num(r[ci.use2]) ?? curAdj - prevAdj : curAdj - prevAdj,
      prevUse: ci.note >= 0 ? num(r[ci.note]) : null,
    });
  });
  return { sheet: sheet.name, sheets: cand.map((s) => s.name), rows, billTons };
}
