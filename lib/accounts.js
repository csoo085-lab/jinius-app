// 계정과목표 읽기 + 복식부기 분개 계산
// - 회계프로그램에서 출력한 계정과목 PDF(계정코드·계정명·차대구분)나 엑셀을 읽어 건물별 계정과목표로 저장
// - 들여쓰기(PDF의 글자 위치)로 상위·하위 계정을 구분하고, 맨 아래 계정만 전표에 쓸 수 있음

import { matchRecurring, periodLabel } from "./recurring";
import { findTransfers } from "./transfers";
import { duesPaymentIds, monthEnd } from "./dues";

const PDFJS_VERSION = "3.11.174";
const SIDE_RE = /^(차변|대변)$/;
const CODE_RE = /^\d{4,6}$/;

// 줄 목록 [{ code, name, side, indent }] → 계층 정리
export function buildAccounts(lines) {
  const rows = lines
    .filter((l) => l.code && l.name && l.name.replace(/[.\s]/g, "") !== "")
    .map((l) => ({ ...l, name: l.name.trim() }));
  // 들여쓰기 값을 단계(0,1,2…)로 변환 (가까운 값은 같은 단계)
  const xs = [...new Set(rows.map((r) => Math.round(r.indent ?? 0)))].sort((a, b) => a - b);
  const levels = [];
  xs.forEach((x) => { if (!levels.length || x - levels[levels.length - 1] > 3) levels.push(x); });
  const levelOf = (x) => {
    let lv = 0;
    levels.forEach((v, i) => { if (Math.round(x ?? 0) >= v - 3) lv = i; });
    return lv;
  };
  const stack = [];
  const out = rows.map((r, i) => {
    const level = r.indent == null ? (/^\(.*\)$/.test(r.name) ? 0 : 1) : levelOf(r.indent);
    while (stack.length && stack[stack.length - 1].level >= level) stack.pop();
    const parent = stack[stack.length - 1];
    const a = { code: r.code, name: r.name, side: r.side || "차변", level, parent_code: parent?.code || null, sort: i };
    stack.push(a);
    return a;
  });
  // 바로 아래 단계 자식이 있으면 묶음 계정, 없으면 전표에 쓰는 계정
  out.forEach((a, i) => {
    const next = out[i + 1];
    a.is_leaf = !(next && next.level > a.level) && !/^\(.*\)$/.test(a.name);
  });
  // 합계용 줄(총합계, 끝부분 50000번대 묶음 제목 등)은 제외
  return out.filter((a) => !/총합계/.test(a.name) && !(/^\(.*\)$/.test(a.name) && Number(a.code) >= 50000));
}

// PDF (회계프로그램 출력물) 읽기
export async function parseAccountsPdf(file) {
  const mod = await import("pdfjs-dist/legacy/build/pdf");
  const pdfjsLib = mod.getDocument ? mod : mod.default;
  pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${PDFJS_VERSION}/pdf.worker.min.js`;
  const pdf = await pdfjsLib.getDocument({ data: await file.arrayBuffer() }).promise;
  const lines = [];
  for (let p = 1; p <= pdf.numPages; p++) {
    const page = await pdf.getPage(p);
    const tc = await page.getTextContent();
    const rows = {};
    tc.items.forEach((it) => {
      const s = (it.str || "").trim();
      if (!s) return;
      const y = Math.round(it.transform[5]);
      const key = Object.keys(rows).find((k) => Math.abs(Number(k) - y) <= 2) ?? y;
      (rows[key] = rows[key] || []).push({ s, x: it.transform[4] });
    });
    Object.keys(rows).sort((a, b) => Number(b) - Number(a)).forEach((k) => {
      const items = rows[k].sort((a, b) => a.x - b.x);
      const code = items.find((i) => CODE_RE.test(i.s));
      const side = items.find((i) => SIDE_RE.test(i.s));
      if (!code || !side) return;
      const nameItems = items.filter((i) => i !== code && i !== side && i.x > code.x && i.x < side.x);
      if (!nameItems.length) return;
      lines.push({ code: code.s, name: nameItems.map((i) => i.s).join(" "), side: side.s, indent: nameItems[0].x });
    });
  }
  if (!lines.length) throw new Error("계정코드·계정명·차대구분을 찾지 못했습니다. 회계프로그램에서 출력한 '계정과목' PDF인지 확인해주세요.");
  return buildAccounts(lines);
}

// 엑셀 읽기: 계정코드 / 계정명 / 차대구분 칸 (계정명 앞 공백으로 단계 구분)
export async function parseAccountsExcel(file) {
  const XLSX = await import("xlsx");
  const wb = XLSX.read(await file.arrayBuffer(), { type: "array" });
  const rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, raw: false, defval: "" });
  const hi = rows.findIndex((r) => r.some((c) => String(c).replace(/\s/g, "") === "계정코드"));
  if (hi < 0) throw new Error("'계정코드' 머리글을 찾지 못했습니다. 계정코드 / 계정명 / 차대구분 칸이 있는 엑셀이어야 해요.");
  const H = rows[hi].map((c) => String(c).replace(/\s/g, ""));
  const ci = H.indexOf("계정코드"), ni = H.findIndex((h) => h === "계정명" || h === "계정과목"), si = H.findIndex((h) => /차대/.test(h));
  const lines = rows.slice(hi + 1).map((r) => {
    const rawName = String(r[ni] ?? "");
    return { code: String(r[ci] ?? "").trim(), name: rawName, side: String(r[si] ?? "").trim(), indent: rawName.length - rawName.trimStart().length };
  }).filter((l) => CODE_RE.test(l.code));
  if (!lines.length) throw new Error("계정 줄을 읽지 못했습니다.");
  return buildAccounts(lines.map((l) => ({ ...l, indent: l.indent * 4 })));
}

export async function parseAccountsFile(file) {
  return /\.pdf$/i.test(file.name) ? parseAccountsPdf(file) : parseAccountsExcel(file);
}

// ---------- 추천 계정 ----------
const CATEGORY_HINT = {
  "수선·유지보수": ["수선비", "시설유지비", "수선유지비"],
  "청소·미화": ["청소비"],
  "소방·안전점검": ["안전점검비", "재해예방비"],
  "승강기": ["승강기유지비"],
  "전기·수도·가스": ["전기료", "공과금 중 전기료", "수도료", "가스사용료"],
  "소모품·비품": ["관리용품구입비", "일반사무용품비", "잡비"],
  "인건비·용역비": ["위탁관리수수료", "경비비", "급여"],
  "보험료": ["건물보험료", "보험료"],
  "세금·공과금": ["제세공과금 등", "제세공과금"],
  "기타": ["잡비", "잡지출"],
};

export function leafAccounts(accounts) {
  return (accounts || []).filter((a) => a.is_leaf);
}

function findByNames(accounts, names) {
  const leaves = leafAccounts(accounts);
  for (const n of names) {
    const hit = leaves.find((a) => a.name === n);
    if (hit) return hit.code;
  }
  return "";
}

export const suggestExpenseAccount = (accounts, category, description = "") => {
  if (/수도/.test(description)) { const c = findByNames(accounts, ["수도료"]); if (c) return c; }
  if (/전기|전력|한전/.test(description)) { const c = findByNames(accounts, ["전기료", "공과금 중 전기료"]); if (c) return c; }
  return findByNames(accounts, CATEGORY_HINT[category] || []);
};

export const suggestIncomeAccount = (accounts, description = "", txnType = "") => {
  if (/이자/.test(description + txnType)) return findByNames(accounts, ["이자수입"]);
  if (/주차/.test(description)) return findByNames(accounts, ["주차수입"]);
  if (/연체/.test(description)) return findByNames(accounts, ["연체료수입"]);
  return findByNames(accounts, ["관리비수입"]);
};

// 통장 이름 → 예금 계정 추천 (예: "관리비계좌(농협)")
export function suggestBankAccount(accounts, label = "") {
  const leaves = leafAccounts(accounts);
  const banks = leaves.filter((a) => /계좌|예금|예치금/.test(a.name) && a.side === "차변");
  const hit = banks.find((a) => (/주차/.test(label) && /주차/.test(a.name)) || (/장충|장기수선/.test(label) && /장기수선/.test(a.name)));
  if (hit) return hit.code;
  const mgmt = banks.find((a) => /관리비/.test(a.name));
  return (mgmt || banks[0])?.code || findByNames(accounts, ["제예금", "현금"]);
}

export const suggestWithdrawAccount = (accounts, description = "", txnType = "") => {
  const d = description + " " + txnType;
  if (/수수료/.test(d)) return findByNames(accounts, ["잡비", "잡지출"]);
  if (/수도/.test(d)) return findByNames(accounts, ["수도료"]);
  if (/한전|전력|전기/.test(d)) return findByNames(accounts, ["전기료", "공과금 중 전기료"]);
  if (/승강기|엘리베이터/.test(d)) return findByNames(accounts, ["승강기유지비"]);
  if (/보험/.test(d)) return findByNames(accounts, ["건물보험료"]);
  if (/청소/.test(d)) return findByNames(accounts, ["청소비"]);
  return "";
};

// 부과 항목 이름 → 대변 계정 (건물에서 정한 값이 없을 때의 추천)
export function suggestFeeItemAccount(accounts, name = "") {
  const n = String(name).replace(/\s/g, "");
  if (/장기수선/.test(n)) return findByNames(accounts, ["장기수선충당금"]) || findByCodeSide(accounts, "22400");
  if (/공유부지/.test(n)) return findByNames(accounts, ["공유부지충당금"]);
  if (/^주차비$|주차료|주차수입/.test(n)) return findByNames(accounts, ["주차수입"]);
  if (/연체료/.test(n)) return findByNames(accounts, ["연체료수입"]);
  if (/수도잉여금/.test(n)) return findByNames(accounts, ["수도잉여금"]);
  return findByNames(accounts, ["관리비수입"]);
}
function findByCodeSide(accounts, code) {
  const a = (accounts || []).find((x) => x.code === code && x.is_leaf);
  return a ? a.code : "";
}
export const receivableCode = (accounts) => findByNames(accounts, ["미수관리비"]);

// 처음 올린 달의 이전 미납 처리: books = 장부에 기초 미수관리비로 / memo = 장부 밖에서 호실별로만 관리 / none = 안 씀
export const openingModeOf = (c) => c?.totals?.openingMode || (Number(c?.opening_unpaid) ? "books" : "none");

// 입금 → 호실 번호 (지정된 호실 우선, 없으면 입금자명의 "○○○호")
function hoOfDeposit(t, unitsById) {
  const norm = (s) => String(s ?? "").replace(/\s/g, "").replace(/호$/, "").replace(/^0+/, "");
  const u = t.unit_id && unitsById[t.unit_id];
  if (u) return norm(String(u.ho).match(/\d{3,4}(?:-\d+)?/)?.[0] || u.ho);
  const m = [...String(t.description || "").matchAll(/(\d{3,4}(?:-\d+)?)\s*호/g)].map((x) => norm(x[1]));
  return m.length === 1 ? m[0] : "";
}

// ---------- 분개 만들기 ----------
// 통장 거래 기준(현금주의). 카드·현금 지출은 통장에 없으므로 지출 기준으로 따로 분개.
// 계좌이체로 등록했지만 아직 통장내역에 없는 지출은 출금이 확인된 뒤 분개됩니다.
// 각 줄: { no, date, desc, debit, credit, amount, src, edit: {table, id, side}, suggested }
export function buildJournal({ accounts, txns, expenses, bankMap = {}, cashCode = "", cardCode = "", recurring = [], charges = [], units = [], allCharges = null, priorDeposits = [], opening = null, dues = null }) {
  // 회계 시작일 이전 거래는 장부에 넣지 않음
  const startDate = opening?.date || "";
  if (startDate) {
    txns = (txns || []).filter((t) => t.txn_date >= startDate);
    expenses = (expenses || []).filter((e) => e.expense_date >= startDate);
    charges = (charges || []).filter((c) => c.charge_date >= startDate);
    allCharges = (allCharges || charges).filter((c) => c.charge_date >= startDate);
  }
  const byCode = Object.fromEntries((accounts || []).map((a) => [a.code, a]));
  const name = (c) => (c && byCode[c] ? byCode[c].name : "미분류");
  const expById = Object.fromEntries((expenses || []).map((e) => [e.id, e]));
  const bankOf = (label) => bankMap[label] || suggestBankAccount(accounts, label);
  const expCode = (e) => {
    if (e.account_code && byCode[e.account_code]) return { code: e.account_code, suggested: false };
    return { code: suggestExpenseAccount(accounts, e.category, e.description), suggested: true };
  };
  const entries = [];
  // 부과 내역이 있으면 발생주의: 부과할 때 미수관리비, 관리비 입금은 미수관리비를 줄임
  const recv = charges.length || (allCharges || []).length ? receivableCode(accounts) : "";
  const feeIncome = findByNames(accounts, ["관리비수입"]);
  const noEdit = { table: null, id: null, side: null };
  // 회계 시작일의 통장 기초잔액: 차) 통장 / 대) 전기이월이익잉여금
  if (startDate && opening?.balances) {
    const eq = findByNames(accounts, ["전기이월이익잉여금"]);
    Object.entries(opening.balances).forEach(([label, amt]) => {
      const a = Number(amt) || 0;
      if (!a) return;
      const bank = bankMap[label] || suggestBankAccount(accounts, label);
      entries.push({ date: startDate, at: `${startDate}T00:00:00+09:00`, desc: `기초 잔액 (${label})`, debit: a > 0 ? bank : eq, credit: a > 0 ? eq : bank,
        amount: Math.abs(a), src: "기초", edit: { table: null, id: null, side: null }, suggested: false });
    });
  }
  // 이전 미납 처리: 회계 시작 설정이 있으면 그걸 따르고, 없으면 부과 파일마다 정한 값
  const arrearsMode = (c) => (opening?.arrearsMode ? opening.arrearsMode : openingModeOf(c));
  const firstCharge = [...(allCharges || charges)].sort((a, b) => a.month.localeCompare(b.month))[0];
  const arrearsOf = (c) => (opening?.arrearsMode ? (c.units || []).reduce((s2, u) => s2 + (Number(u.unpaid) || 0), 0) : Number(c.opening_unpaid) || 0);
  charges.forEach((c) => {
    const mm = Number(String(c.month).slice(5));
    const at = `${c.charge_date}T23:59:00+09:00`;
    const add = (desc, debit, credit, amount) => amount && entries.push({ date: c.charge_date, at, desc, debit, credit, amount: Math.round(amount), src: "부과", edit: noEdit, suggested: false });
    if (c === firstCharge && arrearsOf(c) && arrearsMode(c) === "books") add(`기초 미수관리비 (${mm}월 이전 미납)`, recv, findByNames(accounts, ["전기이월이익잉여금"]), arrearsOf(c));
    (c.items || []).forEach((it) => {
      const code = it.account_code && byCode[it.account_code] ? it.account_code : suggestFeeItemAccount(accounts, it.name);
      add(`${mm}월분 관리비 부과 · ${it.name}`, recv, code, it.total);
    });
    const r = Number(c.totals?.rounding) || 0;
    if (r > 0) add(`${mm}월분 부과 끝수 조정`, recv, findByNames(accounts, ["부과차익"]), r);
    if (r < 0) add(`${mm}월분 부과 끝수 조정`, findByNames(accounts, ["부과차손"]), recv, -r);
    if (c.late_fee_charged && Number(c.totals?.unpaidLate)) add(`${mm}월분 미납 연체료 부과`, recv, findByNames(accounts, ["연체료수입"]), c.totals.unpaidLate);
  });
  const xfer = findTransfers(txns);
  const duesPays = duesPaymentIds(dues);
  // 장부 밖 이전 미납(memo): 그 호실 입금은 이전 미납부터 갚은 것으로 보고 따로 잡음 (기본 가수금)
  //  (지난해에 올린 부과도 보도록 allCharges, 장부 기간 전에 이미 갚은 입금은 priorDeposits로 미리 빼 둠)
  const memo = firstCharge && arrearsOf(firstCharge) && arrearsMode(firstCharge) === "memo" ? firstCharge : null;
  const oldLeft = {};
  let oldCode = "", memoFrom = "";
  const unitsById = Object.fromEntries((units || []).map((u) => [u.id, u]));
  const recvAny = recv || receivableCode(accounts);
  if (memo && recvAny) {
    (memo.units || []).forEach((u) => { if (Number(u.unpaid)) oldLeft[String(u.ho)] = Number(u.unpaid); });
    oldCode = opening?.arrearsCode || memo.totals?.oldArrearsCode || findByNames(accounts, ["가수금"]);
    memoFrom = memo.charge_date;
    const firstTxn = (txns || []).reduce((m, t) => (!m || t.txn_date < m ? t.txn_date : m), "");
    (priorDeposits || []).filter((t) => t.direction === "입금" && t.txn_date > memoFrom && firstTxn && t.txn_date < firstTxn)
      .sort((a, b) => a.txn_date.localeCompare(b.txn_date))
      .forEach((t) => { const ho = hoOfDeposit(t, unitsById); if (oldLeft[ho] > 0) oldLeft[ho] = Math.max(0, oldLeft[ho] - Number(t.amount)); });
  }
  (txns || []).forEach((tx) => {
    let t = tx;
    const bank = bankOf(t.account_label);
    // 내 통장 간 이체: 보낸 쪽 출금에서 한 번만 (차) 받는 통장 / 대) 보낸 통장), 받는 쪽 입금은 건너뜀
    const x = xfer[t.id];
    if (x?.role === "in") return;
    if (x?.role === "out") {
      entries.push({ date: t.txn_date, at: t.txn_at, desc: `통장 간 이체 (${x.from} → ${x.to})`, debit: bankOf(x.to), credit: bank,
        amount: Number(t.amount), src: t.account_label, edit: { table: null, id: null, side: null }, suggested: false });
      return;
    }
    const saved = t.account_code && byCode[t.account_code] ? t.account_code : "";
    if (t.direction === "입금") {
      let code = saved || suggestIncomeAccount(accounts, t.description, t.txn_type);
      // 발생주의: 관리비 입금은 관리비수입이 아니라 미수관리비를 줄임
      if (recv && code === feeIncome) code = recv;
      // 이전 미납을 먼저 갚은 부분은 따로 (이전 관리 기간의 돈)
      if (oldCode && code === recv && t.txn_date > memoFrom) {
        const ho = hoOfDeposit(t, unitsById);
        const left = oldLeft[ho] || 0;
        if (left > 0) {
          const part = Math.min(left, Number(t.amount));
          oldLeft[ho] = left - part;
          entries.push({ date: t.txn_date, at: t.txn_at, desc: `${t.description || "입금"} (이전 미납 회수 · ${ho}호)`, debit: bank, credit: oldCode,
            amount: part, src: t.account_label || "통장", edit: { table: null, id: null, side: null }, suggested: false });
          if (part >= Number(t.amount)) return;
          t = { ...t, amount: Number(t.amount) - part };
        }
      }
      entries.push({ date: t.txn_date, at: t.txn_at, desc: t.description || t.txn_type || "입금", debit: bank, credit: code, amount: Number(t.amount),
        src: t.account_label || "통장", edit: { table: "bank_transactions", id: t.id, side: "credit" }, suggested: !saved });
    } else {
      // 고정지출 결재: 비용은 귀속월에 미지급비용으로 잡고, 이 출금은 미지급비용을 갚은 것으로 (아래에서 따로)
      if (duesPays.has(t.id)) return;
      const e = t.expense_id ? expById[t.expense_id] : null;
      let code, suggested, edit;
      if (e) { ({ code, suggested } = expCode(e)); edit = { table: "building_expenses", id: e.id, side: "debit" }; }
      else {
        // 고정지출로 등록된 출금이면 그 계정을 그대로 사용
        const rc = matchRecurring(t, recurring);
        const rcCode = rc?.account_code && byCode[rc.account_code] ? rc.account_code : "";
        code = saved || rcCode || suggestWithdrawAccount(accounts, t.description, t.txn_type);
        suggested = !saved && !rcCode;
        edit = { table: "bank_transactions", id: t.id, side: "debit" };
        if (rc) t = { ...t, description: `${t.description || rc.name} [${rc.name} ${periodLabel(rc, t.txn_date.slice(0, 7))}]` };
      }
      entries.push({ date: t.txn_date, at: t.txn_at,
        desc: e ? `${e.description}${e.vendor ? ` (${e.vendor})` : ""}` : (t.description || t.txn_type || "출금"),
        debit: code, credit: bank, amount: Number(t.amount), src: t.account_label || "통장", edit, suggested });
    }
  });
  // 고정지출 (발생주의): ○월분 비용은 그달 말에 미지급비용으로, 결재하면 미지급비용을 줄임
  if (dues) {
    const payable = findByNames(accounts, ["미지급비용", "미지급금"]);
    const noEdit2 = { table: null, id: null, side: null };
    Object.values(dues).forEach(({ item, dues: list, extra }) => {
      const code = item.account_code && byCode[item.account_code] ? item.account_code : suggestExpenseAccount(accounts, item.category, item.name);
      list.forEach((d) => {
        const mm = Number(d.month.slice(5));
        if (d.amount != null && (!startDate || monthEnd(d.month) >= startDate)) {
          entries.push({ date: monthEnd(d.month), at: `${monthEnd(d.month)}T23:58:00+09:00`, desc: `${mm}월분 ${item.name}${d.paid >= d.amount ? "" : " (미결재)"}`,
            debit: code, credit: payable, amount: Math.round(d.amount), src: "고정지출", edit: noEdit2, suggested: !item.account_code });
        }
        d.payments.forEach((p) => {
          if (startDate && p.txn.txn_date < startDate) return;
          entries.push({ date: p.txn.txn_date, at: p.txn.txn_at, desc: `${item.name} ${mm}월분 결재 (${p.txn.description || "출금"})`,
            debit: payable, credit: bankOf(p.txn.account_label), amount: Math.round(p.amount), src: p.txn.account_label || "통장", edit: noEdit2, suggested: false });
        });
      });
      extra.forEach((x) => {
        if (startDate && x.txn.txn_date < startDate) return;
        entries.push({ date: x.txn.txn_date, at: x.txn.txn_at, desc: `${item.name} (몫보다 더 낸 금액 · ${x.txn.description || "출금"})`,
          debit: code, credit: bankOf(x.txn.account_label), amount: Math.round(x.amount), src: x.txn.account_label || "통장", edit: noEdit2, suggested: false });
      });
    });
  }

  (expenses || []).filter((e) => e.payment_method === "카드" || e.payment_method === "현금").forEach((e) => {
    const { code, suggested } = expCode(e);
    entries.push({
      date: e.expense_date, at: `${e.expense_date}T12:00:00+09:00`, desc: `${e.description}${e.vendor ? ` (${e.vendor})` : ""}`,
      debit: code, credit: e.payment_method === "카드" ? cardCode : cashCode, amount: Number(e.amount), src: e.payment_method,
      edit: { table: "building_expenses", id: e.id, side: "debit" }, suggested,
    });
  });
  entries.sort((a, b) => (a.at || "").localeCompare(b.at || ""));
  entries.forEach((en, i) => { en.no = i + 1; en.debitName = name(en.debit); en.creditName = name(en.credit); });
  return entries;
}

// 계정별 합계 (시산표·수지계산서용) { code: { debit, credit } }
export function accountTotals(entries) {
  const t = {};
  entries.forEach((e) => {
    const d = e.debit || "", c = e.credit || "";
    (t[d] = t[d] || { debit: 0, credit: 0 }).debit += e.amount;
    (t[c] = t[c] || { debit: 0, credit: 0 }).credit += e.amount;
  });
  return t;
}

// 묶음 계정까지 합계 올리기
export function rollupTotals(accounts, totals) {
  const byCode = Object.fromEntries((accounts || []).map((a) => [a.code, a]));
  const out = {};
  Object.entries(totals).forEach(([code, v]) => {
    let c = code;
    const seen = new Set();
    while (c && byCode[c] && !seen.has(c)) {
      seen.add(c);
      (out[c] = out[c] || { debit: 0, credit: 0 });
      out[c].debit += v.debit; out[c].credit += v.credit;
      c = byCode[c].parent_code;
    }
  });
  return out;
}

// 계정 잔액 (차변 계정은 차-대, 대변 계정은 대-차)
export const balanceOf = (acc, v) => (!v ? 0 : acc?.side === "대변" ? v.credit - v.debit : v.debit - v.credit);
