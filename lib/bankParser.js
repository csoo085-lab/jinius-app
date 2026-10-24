// 은행 입출금내역 엑셀(xlsx·xls·csv)을 읽어 거래 목록으로 바꿉니다.
// 은행마다 칸 이름과 순서가 달라서, 머리글(거래일시·입금·출금·잔액 등)을 찾아 맞춥니다.
// - 금액 한 칸(출금은 '-')인 형식: 카카오뱅크 등
// - 입금/출금 칸이 따로 있는 형식: 부산은행·농협·국민 등

const BANKS = ["카카오뱅크", "부산은행", "BNK", "경남은행", "농협", "NH", "국민", "KB", "신한", "우리", "하나", "기업", "IBK", "새마을", "신협", "우체국", "토스뱅크", "케이뱅크", "SC제일", "수협", "대구"];

const clean = (v) => String(v ?? "").replace(/\s+/g, " ").trim();
const head = (v) => clean(v).replace(/\s/g, "");

function toNumber(v) {
  if (typeof v === "number") return v;
  const s = clean(v).replace(/[,원\s]/g, "");
  if (!s || s === "-") return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

const pad = (n) => String(n).padStart(2, "0");

// 날짜(+시간) → { iso: "2026-09-03T00:11:52+09:00", date: "2026-09-03" }
function toDateTime(v, timeV) {
  let y, mo, d, h = 0, mi = 0, s = 0;
  if (v instanceof Date && !isNaN(v)) {
    y = v.getFullYear(); mo = v.getMonth() + 1; d = v.getDate();
    h = v.getHours(); mi = v.getMinutes(); s = v.getSeconds();
  } else if (typeof v === "number" && v > 20000 && v < 80000) {
    // 엑셀 날짜 일련번호
    const ms = Math.round((v - 25569) * 86400 * 1000);
    const t = new Date(ms);
    y = t.getUTCFullYear(); mo = t.getUTCMonth() + 1; d = t.getUTCDate();
    h = t.getUTCHours(); mi = t.getUTCMinutes(); s = t.getUTCSeconds();
  } else {
    const str = clean(v);
    let m = str.match(/(\d{4})\s*[.\-/년]\s*(\d{1,2})\s*[.\-/월]\s*(\d{1,2})/);
    if (!m) {
      m = str.match(/^(\d{4})(\d{2})(\d{2})/); // 20260903
      if (!m) return null;
    }
    [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
    const t = str.slice(m.index + m[0].length).match(/(\d{1,2}):(\d{2})(?::(\d{2}))?/);
    if (t) { h = Number(t[1]); mi = Number(t[2]); s = Number(t[3] || 0); }
  }
  if (timeV !== undefined && timeV !== null && timeV !== "") {
    if (typeof timeV === "number" && timeV < 1) {
      const sec = Math.round(timeV * 86400);
      h = Math.floor(sec / 3600); mi = Math.floor((sec % 3600) / 60); s = sec % 60;
    } else if (timeV instanceof Date && !isNaN(timeV)) {
      h = timeV.getHours(); mi = timeV.getMinutes(); s = timeV.getSeconds();
    } else {
      const t = clean(timeV).match(/(\d{1,2}):?(\d{2}):?(\d{2})?/);
      if (t) { h = Number(t[1]); mi = Number(t[2]); s = Number(t[3] || 0); }
    }
  }
  if (!y || mo < 1 || mo > 12 || d < 1 || d > 31) return null;
  const date = `${y}-${pad(mo)}-${pad(d)}`;
  return { date, iso: `${date}T${pad(h)}:${pad(mi)}:${pad(s)}+09:00` };
}

// 머리글 줄에서 각 칸의 위치를 찾음
function mapColumns(row) {
  const H = row.map(head);
  const find = (...tests) => {
    for (const t of tests) {
      const i = H.findIndex((h, idx) => h && !used.has(idx) && (t instanceof RegExp ? t.test(h) : h === t));
      if (i >= 0) { used.add(i); return i; }
    }
    return -1;
  };
  const used = new Set();
  const c = {};
  c.date = find("거래일시", "거래일자", "거래일", "일시", "일자", "날짜", /^거래일/, /일자$/);
  c.time = find("거래시간", "시간", "시각");
  c.balance = find(/잔액/);
  c.deposit = find("입금액", "입금금액", "맡기신금액", "입금(원)", /^입금/, /맡기신/);
  c.withdraw = find("출금액", "출금금액", "찾으신금액", "지급액", "출금(원)", /^출금/, /찾으신/, /^지급/);
  c.amount = find("거래금액", "금액", /금액/);
  c.kind = find("구분", "입출금구분", "입출구분", /입출/);
  c.type = find("거래구분", "거래종류", "적요구분", /거래구분|거래종류/);
  // 농협: '거래내용'은 경로(폰부산은행·NH콕송금), '거래기록사항'이 보낸 분 이름 → 기록사항을 내용으로, 거래내용은 거래구분으로
  c.desc = find("거래기록사항", "기록사항", "내용", "적요", "기재내용", "거래내용", "받는분", "보낸분", "거래처", "의뢰인", /내용|적요|받는|보낸|상대/);
  if (c.type < 0 && /기록사항/.test(H[c.desc] || "")) c.type = find("거래내용");
  c.memo = find("메모", "비고", /메모|비고/);
  return c;
}

function findHeader(rows) {
  for (let i = 0; i < Math.min(rows.length, 40); i++) {
    const c = mapColumns(rows[i]);
    if (c.date >= 0 && (c.amount >= 0 || c.deposit >= 0 || c.withdraw >= 0)) return { index: i, cols: c };
  }
  return null;
}

// 표 위쪽 안내 문구에서 은행명·계좌 끝자리·조회기간 찾기
function findMeta(rows, upto) {
  const text = rows.slice(0, Math.max(upto, 1)).map((r) => r.map(clean).join(" ")).join(" \n ");
  let bank = BANKS.find((b) => text.includes(b)) || "";
  let account = "";
  const accLine = text.match(/계좌번호[^\n]*/);
  if (accLine) {
    const digits = accLine[0].replace(/계좌번호/, "").match(/[\d*][\d*\-\s]{5,}\d/);
    if (digits) account = digits[0].replace(/\D/g, "").slice(-4);
    // 은행 이름이 없는 농협 파일: 계좌번호 형식(301-0373-9623-51 등)으로 알아봄
    if (!bank && /\b(301|302|312|351|352|355|356)-\d{4}-\d{4}-\d{2}\b/.test(accLine[0])) bank = "농협";
  }
  const period = text.match(/(\d{4}[.\-/]\d{1,2}[.\-/]\d{1,2})\s*[-~]\s*(\d{4}[.\-/]\d{1,2}[.\-/]\d{1,2})/);
  return {
    bank: bank === "BNK" ? "부산은행" : bank === "NH" ? "농협" : bank === "KB" ? "국민" : bank === "IBK" ? "기업" : bank,
    account,
    periodStart: period ? toDateTime(period[1])?.date : null,
    periodEnd: period ? toDateTime(period[2])?.date : null,
  };
}

// 2차원 배열(엑셀 시트) → 거래 목록
export function parseBankRows(rows) {
  const hdr = findHeader(rows);
  if (!hdr) throw new Error("거래일시·금액 칸을 찾지 못했습니다. 은행에서 받은 입출금내역 원본 엑셀인지 확인해주세요.");
  const { cols } = hdr;
  const meta = findMeta(rows, hdr.index);
  const txns = [];
  const cell = (r, i) => (i >= 0 ? r[i] : "");

  for (const r of rows.slice(hdr.index + 1)) {
    const dt = toDateTime(cell(r, cols.date), cols.time >= 0 ? cell(r, cols.time) : undefined);
    if (!dt) continue;

    let direction = null, amount = null;
    const dep = toNumber(cell(r, cols.deposit));
    const wd = toNumber(cell(r, cols.withdraw));
    if (cols.deposit >= 0 || cols.withdraw >= 0) {
      if (wd) { direction = "출금"; amount = Math.abs(wd); }
      else if (dep) { direction = "입금"; amount = Math.abs(dep); }
    }
    if (!direction && cols.amount >= 0) {
      const a = toNumber(cell(r, cols.amount));
      if (a) {
        const kind = clean(cell(r, cols.kind));
        if (/출금|지급|출/.test(kind)) direction = "출금";
        else if (/입금|입/.test(kind)) direction = "입금";
        else direction = a < 0 ? "출금" : "입금";
        amount = Math.abs(a);
      }
    }
    if (!direction || !amount) continue;

    txns.push({
      txn_at: dt.iso,
      txn_date: dt.date,
      direction,
      amount: Math.round(amount),
      balance: (() => { const b = toNumber(cell(r, cols.balance)); return b === null ? null : Math.round(b); })(),
      txn_type: clean(cell(r, cols.type)),
      description: clean(cell(r, cols.desc)) || clean(cell(r, cols.type)),
      memo: clean(cell(r, cols.memo)),
    });
  }
  if (!txns.length) {
    // 머리글은 있는데 금액 있는 거래가 없음 (예: 새로 만든 통장이라 '신규 0원'만 있음)
    const hasRows = rows.slice(hdr.index + 1).some((r) => toDateTime(cell(r, cols.date)));
    throw new Error(hasRows
      ? "이 파일에는 금액이 있는 거래가 없습니다. (예: 새로 만든 통장이라 '신규 0원'만 있는 경우) 거래가 생긴 뒤의 파일을 올려주세요."
      : "거래 줄을 하나도 읽지 못했습니다. 파일 형식을 확인해주세요.");
  }
  txns.sort((a, b) => a.txn_at.localeCompare(b.txn_at));
  // 조회기간보다 실제 거래가 있는 기간이 정확함
  return { ...meta, periodStart: txns[0].txn_date, periodEnd: txns[txns.length - 1].txn_date, transactions: txns };
}

// 브라우저에서 고른 파일 → 거래 목록
export async function parseBankFile(file) {
  const XLSX = await import("xlsx"); // 엑셀 읽기 도구는 파일을 올릴 때만 불러옴 (화면이 빨리 뜨도록)
  const buf = await file.arrayBuffer();
  let wb;
  try {
    wb = XLSX.read(buf, { type: "array", cellDates: true });
  } catch (e) {
    const msg = String(e?.message || e);
    if (/password|encrypt|protect/i.test(msg)) {
      throw new Error("비밀번호가 걸린 파일이라 읽을 수 없습니다. 엑셀에서 [파일 → 정보 → 통합 문서 보호 → 암호 설정]의 암호를 지우고 저장한 뒤 다시 올려주세요.");
    }
    throw new Error("엑셀 파일을 열 수 없습니다: " + msg);
  }
  let lastErr;
  for (const name of wb.SheetNames) {
    const rows = XLSX.utils.sheet_to_json(wb.Sheets[name], { header: 1, raw: true, defval: "" });
    try {
      return parseBankRows(rows);
    } catch (e) { lastErr = e; }
  }
  throw lastErr || new Error("읽을 수 있는 시트가 없습니다.");
}

// 같은 거래를 두 번 저장하지 않기 위한 값
export function dedupKey(accountLabel, t) {
  return [accountLabel, t.txn_at, t.direction, t.amount, t.balance ?? "", t.description].join("|");
}
