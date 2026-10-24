"use client";

import { useEffect, useMemo, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabaseClient";
import { prepareUpload, DOC_MAX_SIDE } from "@/lib/uploadUtils";

export const EXPENSE_CATEGORIES = [
  "수선·유지보수", "청소·미화", "소방·안전점검", "승강기", "전기·수도·가스",
  "소모품·비품", "인건비·용역비", "보험료", "세금·공과금", "기타",
];
const CATEGORY_COLORS = {
  "수선·유지보수": "#3182F6", "청소·미화": "#03B26C", "소방·안전점검": "#F04452", "승강기": "#8B5CF6",
  "전기·수도·가스": "#F58B00", "소모품·비품": "#0EA5E9", "인건비·용역비": "#14B8A6", "보험료": "#D946EF",
  "세금·공과금": "#64748B", "기타": "#94A3B8",
};
const PAYMENT_METHODS = ["계좌이체", "카드", "현금", "자동이체"];

// 증빙 종류 (RCMS 방식). required: "선택필수" 묶음 중 하나는 반드시 있어야 '정상'
export const DOC_TYPES = [
  { key: "세금계산서", required: true },
  { key: "카드매출전표", required: true },
  { key: "현금영수증·간이영수증", required: true },
  { key: "거래명세서" },
  { key: "견적서" },
  { key: "계약서" },
  { key: "작업 전 사진", hint: "수선·교체 전 상태" },
  { key: "작업 후 사진", hint: "수선·교체 후 완료 상태" },
  { key: "보고서", hint: "시설 보수 시 작업·점검·완료 보고서 (최대 4개)", max: 4 },
  { key: "이체확인증" },
  { key: "기타" },
];
// 예전 이름으로 저장된 종류는 새 이름으로 보여줌
const LEGACY_DOC = { "작업완료 사진": "작업 후 사진" };
export const normDoc = (t) => LEGACY_DOC[t] || t || "기타";
const REQUIRED_TYPES = DOC_TYPES.filter((d) => d.required).map((d) => d.key);
const FILE_ACCEPT = "image/*,application/pdf,.xls,.xlsx,.xlsm,.csv,.hwp,.hwpx,.doc,.docx,.ppt,.pptx";

// 증빙파일 판정: 선택필수(세금계산서·카드매출전표·현금영수증) 중 하나라도 있으면 정상
export const evidenceOk = (receipts) => (receipts || []).some((r) => REQUIRED_TYPES.includes(r.doc_type));
// 증빙구분 (RCMS의 '증빙구분' 열)
export function evidenceType(receipts) {
  const types = (receipts || []).map((r) => r.doc_type);
  if (types.includes("세금계산서")) return "세금계산서";
  if (types.includes("카드매출전표")) return "카드";
  if (types.includes("현금영수증·간이영수증")) return "현금영수증";
  return types.length ? "기타증빙" : "-";
}
// 이체상태: 통장 출금과 연결되면 집행 완료 (카드·현금 결제는 통장 확인 대상 아님)
export function transferStatus(expense, txn) {
  if (txn) return "집행 완료";
  if (expense.payment_method === "카드" || expense.payment_method === "현금") return "-";
  return "미확인";
}

const won = (n) => (Number(n) || 0).toLocaleString("ko-KR");
const todayKST = () => new Date().toLocaleDateString("sv-SE", { timeZone: "Asia/Seoul" });
const md = (iso) => (iso ? iso.slice(5).replace("-", ".") : "-");

function shiftMonth(month, delta) {
  const [y, m] = month.split("-").map(Number);
  const d = new Date(y, m - 1 + delta, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function dateLabel(iso) {
  const d = new Date(iso + "T00:00:00");
  const days = ["일", "월", "화", "수", "목", "금", "토"];
  return `${d.getMonth() + 1}월 ${d.getDate()}일 (${days[d.getDay()]})`;
}

export { won, CATEGORY_COLORS, shiftMonth, dateLabel };

// 작은 상태 배지
function Pill({ tone, children }) {
  const cls = {
    ok: "bg-accent text-white",
    warn: "bg-warn/15 text-warn",
    bad: "bg-danger/10 text-danger",
    good: "bg-ok/10 text-ok",
    mute: "bg-surface2 text-inkDim",
  }[tone];
  return <span className={"inline-flex items-center justify-center rounded-full px-2.5 py-0.5 text-[11px] font-semibold whitespace-nowrap " + cls}>{children}</span>;
}
const reviewTone = (s) => (s === "정상" ? "good" : s === "미흡" ? "bad" : "mute");

export default function ExpensesManager({
  buildingName, buildingId, month, expenses, receiptsByExpense, txnByExpense = {}, canManage, setupNeeded, embedded = false,
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [editing, setEditing] = useState(null); // null | "new" | expense
  const [filter, setFilter] = useState("전체");
  const [printUrls, setPrintUrls] = useState(null); // 출력 준비 중일 때 { storage_path: 서명URL }
  const [preparing, setPreparing] = useState(false);

  // 출력: 영수증 사진 주소를 받아 모두 불러온 뒤 인쇄 창을 띄움
  async function handlePrint() {
    const all = expenses.flatMap((e) => receiptsByExpense[e.id] || []);
    if (!all.length) { setPrintUrls({}); return; }
    setPreparing(true);
    const supabase = createClient();
    const { data } = await supabase.storage.from("attachments").createSignedUrls(all.map((r) => r.storage_path), 600);
    const map = {};
    (data || []).forEach((d, i) => { if (d?.signedUrl) map[all[i].storage_path] = d.signedUrl; });
    setPrintUrls(map);
  }

  useEffect(() => {
    if (!printUrls) return;
    let cancelled = false;
    const imgs = Array.from(document.querySelectorAll("#expense-print img"));
    Promise.all(imgs.map((img) => (img.complete ? null : new Promise((r) => { img.onload = r; img.onerror = r; }))))
      .then(() => {
        if (cancelled) return;
        setPreparing(false);
        // 출력용 내용은 화면에 보이지 않으므로 그대로 둠 (모바일 브라우저는 인쇄 창이 늦게 떠서 지우면 빈 장이 나옴)
        setTimeout(() => window.print(), 100);
      });
    return () => { cancelled = true; };
  }, [printUrls]);

  function goMonth(next) {
    const params = new URLSearchParams(searchParams.toString());
    params.set("month", next);
    router.push(`${pathname}?${params.toString()}`);
  }

  const total = expenses.reduce((s, e) => s + (Number(e.amount) || 0), 0);
  const byCategory = useMemo(() => {
    const map = {};
    expenses.forEach((e) => { map[e.category] = (map[e.category] || 0) + (Number(e.amount) || 0); });
    return Object.entries(map).sort((a, b) => b[1] - a[1]);
  }, [expenses]);

  const evOk = (e) => evidenceOk(receiptsByExpense[e.id]);
  const trSt = (e) => transferStatus(e, txnByExpense[e.id]);
  const counts = {
    "증빙 미흡": expenses.filter((e) => !evOk(e)).length,
    "이체 미확인": expenses.filter((e) => trSt(e) === "미확인").length,
    "점검 미흡": expenses.filter((e) => e.review_status === "미흡").length,
    "점검 전": expenses.filter((e) => (e.review_status || "미확인") === "미확인").length,
  };
  const pass = (e) => {
    if (filter === "전체") return true;
    if (filter === "증빙 미흡") return !evOk(e);
    if (filter === "이체 미확인") return trSt(e) === "미확인";
    if (filter === "점검 미흡") return e.review_status === "미흡";
    if (filter === "점검 전") return (e.review_status || "미확인") === "미확인";
    return e.category === filter;
  };
  // 오래된 순으로 번호를 매김 (출력물 No와 같음)
  const ordered = [...expenses].sort((a, b) =>
    a.expense_date === b.expense_date ? (a.created_at || "").localeCompare(b.created_at || "") : a.expense_date.localeCompare(b.expense_date));
  const noOf = Object.fromEntries(ordered.map((e, i) => [e.id, i + 1]));
  const shown = ordered.filter(pass).reverse(); // 화면은 최신이 위

  const [y, m] = month.split("-");

  if (setupNeeded) {
    return (
      <div>
        {!embedded && <h1 className="font-display font-bold text-xl mb-5">지출내역</h1>}
        <div className="card text-sm">
          지출내역 기능을 쓰려면 Supabase에서 <strong>expenses.sql</strong>을 한 번 실행해야 합니다.
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="print:hidden">
      <div className="flex items-end justify-between gap-3 mb-5">
        {embedded ? (
          <div className="font-semibold text-sm text-inkDim">지출 증빙 내역</div>
        ) : (
          <div className="min-w-0">
            <div className="text-sm text-inkDim font-medium truncate">{buildingName}</div>
            <h1 className="font-display font-bold text-xl">지출내역</h1>
          </div>
        )}
        <div className="flex gap-2 shrink-0">
          <button className="btn-ghost" onClick={handlePrint} disabled={preparing || expenses.length === 0}>
            {preparing ? "출력 준비 중…" : "🖨 출력"}
          </button>
          {canManage && (
            <button className="btn" onClick={() => setEditing("new")}>+ 지출 등록</button>
          )}
        </div>
      </div>

      {/* 월 선택 + 합계 */}
      <div className="card mb-4">
        <div className="flex items-center justify-between mb-4">
          <button className="btn-ghost text-xs" onClick={() => goMonth(shiftMonth(month, -1))} aria-label="이전 달">‹ 이전</button>
          <div className="font-bold text-base">{y}년 {Number(m)}월</div>
          <button className="btn-ghost text-xs" onClick={() => goMonth(shiftMonth(month, 1))} aria-label="다음 달">다음 ›</button>
        </div>
        <div className="text-sm text-inkDim">이번 달 지출 합계</div>
        <div className="text-3xl font-bold tracking-tight mt-0.5">{won(total)}<span className="text-lg font-semibold ml-0.5">원</span></div>
        <div className="text-xs text-inkDim mt-1">총 {expenses.length}건</div>

        {/* 상태 요약 (누르면 걸러보기) */}
        <div className="flex flex-wrap gap-1.5 mt-4">
          <button onClick={() => setFilter("전체")}
            className={"tag py-1 px-3 " + (filter === "전체" ? "bg-ink text-white border-ink" : "bg-surface")}>전체 {expenses.length}</button>
          {Object.entries(counts).map(([k, v]) => (
            <button key={k} onClick={() => setFilter(filter === k ? "전체" : k)}
              className={"tag py-1 px-3 " + (filter === k ? "bg-ink text-white border-ink" : v ? "bg-surface text-warn border-warn/40" : "bg-surface text-inkDim")}>
              {k} {v}
            </button>
          ))}
        </div>

        {byCategory.length > 0 && (
          <>
            <div className="flex h-2.5 rounded-full overflow-hidden bg-surface2 mt-4">
              {byCategory.map(([c, v]) => (
                <div key={c} style={{ width: `${(v / total) * 100}%`, backgroundColor: CATEGORY_COLORS[c] || "#94A3B8" }} title={c} />
              ))}
            </div>
            <div className="flex flex-wrap gap-1.5 mt-3">
              {byCategory.map(([c, v]) => (
                <button key={c} onClick={() => setFilter(filter === c ? "전체" : c)}
                  className={"tag py-1 px-3 " + (filter === c ? "bg-ink text-white border-ink" : "bg-surface")}>
                  <span className="w-2 h-2 rounded-full" style={{ backgroundColor: CATEGORY_COLORS[c] || "#94A3B8" }} />
                  {c} <span className="opacity-70">{won(v)}</span>
                </button>
              ))}
            </div>
          </>
        )}
      </div>

      {/* 목록 */}
      {shown.length === 0 ? (
        <div className="card text-sm text-inkDim text-center py-10">
          {expenses.length === 0 ? "이번 달 등록된 지출이 없습니다." : "해당하는 지출이 없습니다."}
          {canManage && expenses.length === 0 && (
            <div className="mt-1 text-xs">오른쪽 위 [+ 지출 등록]을 눌러 추가하세요.</div>
          )}
        </div>
      ) : (
        <>
          {/* PC: RCMS식 표 */}
          <div className="card p-0 sm:p-0 md:p-0 hidden md:block">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left border-b border-border">
                  <th className="pl-5 w-10">No</th>
                  <th>사용일자</th>
                  <th>이체일자</th>
                  <th>증빙구분</th>
                  <th>분류</th>
                  <th>내용 · 거래처</th>
                  <th className="text-right">금액(원)</th>
                  <th className="text-center">증빙파일</th>
                  <th className="text-center">이체상태</th>
                  <th className="text-center pr-5">점검</th>
                </tr>
              </thead>
              <tbody>
                {shown.map((e) => {
                  const rcs = receiptsByExpense[e.id] || [];
                  const tx = txnByExpense[e.id];
                  const tr = trSt(e);
                  return (
                    <tr key={e.id} onClick={() => setEditing(e)} className="border-b border-border cursor-pointer hover:bg-surface2">
                      <td className="pl-5 text-inkDim">{noOf[e.id]}</td>
                      <td className="whitespace-nowrap">{md(e.expense_date)}</td>
                      <td className="whitespace-nowrap text-inkDim">{tx ? md(tx.txn_date) : "-"}</td>
                      <td className="whitespace-nowrap">{evidenceType(rcs)}</td>
                      <td className="whitespace-nowrap">
                        <span className="inline-block w-2 h-2 rounded-full mr-1.5" style={{ backgroundColor: CATEGORY_COLORS[e.category] || "#94A3B8" }} />
                        {e.category}
                      </td>
                      <td className="min-w-[10rem]">
                        <div className="font-semibold truncate max-w-[16rem]">{e.description || "-"}</div>
                        <div className="text-xs text-inkDim truncate max-w-[16rem]">{e.vendor || "-"}{e.payment_method ? ` · ${e.payment_method}` : ""}</div>
                      </td>
                      <td className="text-right font-semibold whitespace-nowrap">{won(e.amount)}</td>
                      <td className="text-center">
                        <Pill tone={evidenceOk(rcs) ? "ok" : "warn"}>{evidenceOk(rcs) ? "정상" : "미흡"}</Pill>
                        {rcs.length > 0 && <div className="text-[10px] text-inkDim mt-0.5">{rcs.length}개 파일</div>}
                      </td>
                      <td className="text-center">
                        <Pill tone={tr === "집행 완료" ? "good" : tr === "미확인" ? "warn" : "mute"}>{tr}</Pill>
                      </td>
                      <td className="text-center pr-5">
                        <Pill tone={reviewTone(e.review_status || "미확인")}>{e.review_status || "미확인"}</Pill>
                        {e.review_memo && <div className="text-[10px] text-inkDim mt-0.5 truncate max-w-[6rem] mx-auto" title={e.review_memo}>{e.review_memo}</div>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* 휴대폰: 카드 */}
          <div className="card p-0 sm:p-0 overflow-hidden md:hidden">
            {shown.map((e) => {
              const rcs = receiptsByExpense[e.id] || [];
              const tr = trSt(e);
              return (
                <button key={e.id} onClick={() => setEditing(e)}
                  className="w-full text-left px-4 py-3 border-b border-border last:border-0 hover:bg-surface2">
                  <div className="flex items-center gap-3">
                    <span className="w-10 h-10 rounded-xl shrink-0 flex items-center justify-center text-white text-xs font-bold"
                      style={{ backgroundColor: CATEGORY_COLORS[e.category] || "#94A3B8" }}>
                      {(e.category || "기").slice(0, 2)}
                    </span>
                    <span className="flex-1 min-w-0">
                      <span className="block font-semibold text-[15px] truncate">{e.description || e.category}</span>
                      <span className="block text-xs text-inkDim truncate">
                        No.{noOf[e.id]} · {md(e.expense_date)} · {e.vendor || e.category}{evidenceType(rcs) !== "-" ? ` · ${evidenceType(rcs)}` : ""}
                      </span>
                    </span>
                    <span className="font-bold text-[15px] shrink-0">{won(e.amount)}원</span>
                  </div>
                  <div className="flex gap-1.5 mt-2 ml-[3.25rem]">
                    <Pill tone={evidenceOk(rcs) ? "ok" : "warn"}>증빙 {evidenceOk(rcs) ? "정상" : "미흡"}</Pill>
                    {tr !== "-" && <Pill tone={tr === "집행 완료" ? "good" : "warn"}>{tr === "미확인" ? "이체 미확인" : tr}</Pill>}
                    <Pill tone={reviewTone(e.review_status || "미확인")}>점검 {e.review_status || "미확인"}</Pill>
                  </div>
                </button>
              );
            })}
          </div>
        </>
      )}

      </div>

      {/* 출력용 (화면에는 보이지 않음) */}
      {printUrls && (
        <PrintSheet
          buildingName={buildingName}
          month={month}
          expenses={ordered}
          receiptsByExpense={receiptsByExpense}
          txnByExpense={txnByExpense}
          byCategory={byCategory}
          total={total}
          urls={printUrls}
        />
      )}

      {editing && (
        <ExpenseModal
          key={editing === "new" ? "new" : editing.id}
          buildingId={buildingId}
          expense={editing === "new" ? null : editing}
          receipts={editing === "new" ? [] : receiptsByExpense[editing.id] || []}
          txn={editing === "new" ? null : txnByExpense[editing.id]}
          canManage={canManage}
          onClose={() => setEditing(null)}
          onSaved={() => { setEditing(null); router.refresh(); }}
        />
      )}
    </div>
  );
}

const isImage = (name) => /\.(jpe?g|png|gif|webp|bmp|heic)$/i.test(name || "");
const docOrder = (t) => { const i = DOC_TYPES.findIndex((d) => d.key === normDoc(t)); return i < 0 ? 99 : i; };

// ---------- 월별 출력 (A4, 쪽 번호·머리말·꼬리말이 있는 문서 양식) ----------
const NAVY = "#1f2a44";
const PAGE_ROWS_FIRST = 13;  // 1쪽: 요약표·안내문이 있어 표 줄 수가 적음
const PAGE_ROWS_NEXT = 22;   // 2쪽부터
const IMGS_PER_PAGE = 4;     // 증빙 첨부: 한 쪽에 사진 4장(2×2)

function chunk(arr, n) {
  const out = [];
  for (let i = 0; i < arr.length; i += n) out.push(arr.slice(i, i + n));
  return out;
}

function PrintPage({ title, right, page, pages, footLeft, footRight, children }) {
  return (
    <section className="flex flex-col break-after-page last:break-after-auto" style={{ height: "258mm", overflow: "hidden" }}>
      <div className="flex items-end justify-between border-b-2 pb-2 mb-3" style={{ borderColor: NAVY }}>
        <div className="text-[19pt] font-extrabold tracking-tight" style={{ color: NAVY }}>{title}</div>
        <div className="text-[9pt] text-black/60 whitespace-nowrap">{right} · {page} / {pages}쪽</div>
      </div>
      <div className="flex-1 min-h-0">{children}</div>
      <div className="flex items-center justify-between border-t pt-2 mt-2 text-[9pt]" style={{ borderColor: NAVY }}>
        <div className="font-bold" style={{ color: NAVY }}>{footLeft}</div>
        <div className="text-black/60">{footRight}</div>
      </div>
    </section>
  );
}

function PrintSheet({ buildingName, month, expenses, receiptsByExpense, txnByExpense, byCategory, total, urls }) {
  const [y, m] = month.split("-");
  const mm = Number(m);
  const lastDay = new Date(Number(y), mm, 0).getDate();
  const rows = expenses.map((e, i) => ({ e, no: i + 1 })); // 이미 오래된 순
  const today = new Date().toLocaleDateString("sv-SE", { timeZone: "Asia/Seoul" }).replaceAll("-", ". ");

  const okCnt = expenses.filter((e) => evidenceOk(receiptsByExpense[e.id])).length;
  const trDone = expenses.filter((e) => transferStatus(e, txnByExpense[e.id]) === "집행 완료").length;
  const trNeed = expenses.filter((e) => transferStatus(e, txnByExpense[e.id]) === "미확인").length;
  const rvOk = expenses.filter((e) => e.review_status === "정상").length;
  const rvBad = expenses.filter((e) => e.review_status === "미흡").length;

  // 표 쪽 나누기
  const tablePages = rows.length <= PAGE_ROWS_FIRST
    ? [rows]
    : [rows.slice(0, PAGE_ROWS_FIRST), ...chunk(rows.slice(PAGE_ROWS_FIRST), PAGE_ROWS_NEXT)];
  // 증빙 첨부 쪽 나누기: 지출 한 건의 사진을 4장씩
  const attachPages = [];
  rows.forEach(({ e, no }) => {
    // 작업 전·후 사진을 맨 앞에 두어 출력물에서 나란히(왼쪽 전, 오른쪽 후) 보이게 함
    const printOrder = (t) => (normDoc(t) === "작업 전 사진" ? -2 : normDoc(t) === "작업 후 사진" ? -1 : docOrder(t));
    const rcs = [...(receiptsByExpense[e.id] || [])].sort((a, b) => printOrder(a.doc_type) - printOrder(b.doc_type));
    if (!rcs.length) return;
    const imgs = rcs.filter((r) => isImage(r.file_name) && urls[r.storage_path]);
    const files = rcs.filter((r) => !(isImage(r.file_name) && urls[r.storage_path]));
    const groups = imgs.length ? chunk(imgs, IMGS_PER_PAGE) : [[]];
    groups.forEach((g, gi) => attachPages.push({ e, no, imgs: g, files: gi === 0 ? files : [], part: groups.length > 1 ? `${gi + 1}/${groups.length}` : "" }));
  });
  const pages = tablePages.length + attachPages.length;
  const right = `${buildingName} 관리단`;
  const footRight = `${buildingName} 관리단 · 관리업체 지니어스 1551-9976`;
  const th = "px-1.5 py-2 font-semibold text-white text-[8.5pt]";
  const td = "px-1.5 py-[7px] border-b border-black/15 text-[8.5pt] whitespace-nowrap overflow-hidden text-ellipsis";

  return (
    <div id="expense-print" className="hidden print:block text-black" style={{ WebkitPrintColorAdjust: "exact", printColorAdjust: "exact" }}>
      {tablePages.map((list, pi) => {
        const pageSum = list.reduce((s, { e }) => s + Number(e.amount || 0), 0);
        const isLast = pi === tablePages.length - 1;
        return (
          <PrintPage key={"t" + pi}
            title={pi === 0 ? `${buildingName} ${y}년 ${mm}월 지출 증빙 내역서` : `${y}년 ${mm}월 지출 증빙 내역서 (계속)`}
            right={right} page={pi + 1} pages={pages}
            footLeft={<>이 쪽 합계 {won(pageSum)}원{isLast ? <span className="font-normal text-black/60"> · 월 합계 {won(total)}원</span> : null}</>}
            footRight={footRight}>
            {pi === 0 ? (
              <>
                {/* 요약표 */}
                <table className="w-full border-collapse text-[9pt] mb-3">
                  <thead>
                    <tr>
                      <th className={th} style={{ background: "#fff" }}></th>
                      <th className={th} style={{ background: NAVY }}>지출 합계</th>
                      <th className={th} style={{ background: NAVY }}>증빙파일</th>
                      <th className={th} style={{ background: NAVY }}>이체상태</th>
                      <th className={th} style={{ background: "#b4441b" }}>관리자 점검</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr className="border-b border-black/15">
                      <td className="px-2 py-2 font-semibold bg-black/5">현황</td>
                      <td className="px-2 py-2 font-bold">{won(total)}원 · {expenses.length}건</td>
                      <td className="px-2 py-2">정상 {okCnt}건 · 미흡 {expenses.length - okCnt}건</td>
                      <td className="px-2 py-2">집행 완료 {trDone}건 · 미확인 {trNeed}건</td>
                      <td className="px-2 py-2">정상 {rvOk}건 · 미흡 {rvBad}건 · 점검 전 {expenses.length - rvOk - rvBad}건</td>
                    </tr>
                    <tr className="border-b border-black/15">
                      <td className="px-2 py-2 font-semibold bg-black/5 align-top">분류별</td>
                      <td className="px-2 py-2 text-[8.5pt] leading-relaxed" colSpan={4}>
                        {byCategory.map(([c, v]) => `${c} ${won(v)}원`).join("  ·  ") || "-"}
                      </td>
                    </tr>
                  </tbody>
                </table>
                <div className="rounded-md bg-black/5 px-3 py-2.5 text-[9.5pt] leading-relaxed mb-3">
                  {y}년 {mm}월 1일부터 {mm}월 {lastDay}일까지 {buildingName}의 관리비 지출 내역입니다.
                  지출마다 <b>증빙(세금계산서·카드매출전표·현금영수증 중 하나 이상)</b>을 첨부하고,
                  통장 출금 내역과 대조하여 <b>집행 여부를 확인</b>하였습니다. 증빙 사진은 {tablePages.length + 1}쪽부터 붙어 있습니다.
                </div>
              </>
            ) : (
              <div className="rounded-md bg-black/5 px-3 py-2 text-[9pt] mb-3">
                {buildingName} · {y}년 {mm}월 지출 증빙 내역 — 1쪽의 요약과 이어집니다.
              </div>
            )}

            <table className="w-full border-collapse table-fixed">
              <colgroup>
                <col style={{ width: "7%" }} /><col style={{ width: "9%" }} /><col style={{ width: "9%" }} /><col style={{ width: "10%" }} />
                <col style={{ width: "12%" }} /><col /><col style={{ width: "14%" }} /><col style={{ width: "12%" }} />
                <col style={{ width: "7%" }} /><col style={{ width: "7%" }} />
              </colgroup>
              <thead>
                <tr style={{ background: NAVY }}>
                  {["No", "사용일자", "이체일자", "증빙구분", "분류", "내용", "거래처", "금액(원)", "증빙", "점검"].map((h) => (
                    <th key={h} className={th + (h === "금액(원)" ? " text-right" : " text-center")}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {list.map(({ e, no }) => {
                  const rcs = receiptsByExpense[e.id] || [];
                  const tx = txnByExpense[e.id];
                  const ok = evidenceOk(rcs);
                  return (
                    <tr key={e.id}>
                      <td className={td + " text-center"}>{no}</td>
                      <td className={td + " text-center"}>{md(e.expense_date)}</td>
                      <td className={td + " text-center"}>{tx ? md(tx.txn_date) : "-"}</td>
                      <td className={td + " text-center"}>{evidenceType(rcs)}</td>
                      <td className={td}>{e.category}</td>
                      <td className={td}>{e.description || "-"}</td>
                      <td className={td}>{e.vendor || "-"}</td>
                      <td className={td + " text-right font-semibold"}>{won(e.amount)}</td>
                      <td className={td + " text-center font-semibold"} style={{ color: ok ? "#1b64da" : "#c2410c" }}>{ok ? "정상" : "미흡"}</td>
                      <td className={td + " text-center"}>{e.review_status || "미확인"}</td>
                    </tr>
                  );
                })}
                {isLast && (
                  <tr className="font-bold" style={{ background: "rgba(0,0,0,0.05)" }}>
                    <td className={td + " text-center"} colSpan={7}>월 합계 ({expenses.length}건)</td>
                    <td className={td + " text-right"}>{won(total)}</td>
                    <td className={td} colSpan={2}></td>
                  </tr>
                )}
              </tbody>
            </table>

            {pi === 0 && (
              <div className="mt-3 text-[8.5pt] leading-relaxed text-black/75">
                <div>※ 증빙 '정상'은 세금계산서·카드매출전표·현금영수증(간이영수증) 중 하나 이상이 첨부된 경우입니다.</div>
                <div>※ 이체일자는 관리비 통장 출금 내역과 연결된 날짜이며, 카드·현금 결제는 '-'로 표시됩니다.</div>
                <div>※ 출력일 {today} · 세부 증빙은 지니어스 앱 [통장·지출]에서도 확인할 수 있습니다.</div>
              </div>
            )}
          </PrintPage>
        );
      })}

      {attachPages.map((ap, i) => (
        <PrintPage key={"a" + i}
          title={`증빙 첨부 · No.${ap.no}${ap.part ? ` (${ap.part})` : ""}`}
          right={right} page={tablePages.length + i + 1} pages={pages}
          footLeft={<>No.{ap.no} · {won(ap.e.amount)}원</>}
          footRight={footRight}>
          <div className="rounded-md bg-black/5 px-3 py-2 text-[9.5pt] mb-3 flex justify-between gap-3">
            <span><b>{md(ap.e.expense_date)}</b> · {ap.e.description || ap.e.category} · {ap.e.vendor || "-"}</span>
            <span className="whitespace-nowrap">증빙구분 {evidenceType(receiptsByExpense[ap.e.id])} · <b>{won(ap.e.amount)}원</b></span>
          </div>
          {ap.imgs.length > 0 && (
            <div className={"grid gap-3 " + (ap.imgs.length === 1 ? "grid-cols-1" : "grid-cols-2")} style={{ height: ap.files.length ? "185mm" : "205mm" }}>
              {ap.imgs.map((r) => (
                <figure key={r.id} className="flex flex-col min-h-0 border border-black/15 rounded p-1.5">
                  <div className="text-[8.5pt] font-semibold mb-1" style={{ color: NAVY }}>[{normDoc(r.doc_type)}]</div>
                  <div className="flex-1 min-h-0 flex items-center justify-center">
                    <img src={urls[r.storage_path]} alt={r.file_name} className="max-h-full max-w-full object-contain" />
                  </div>
                </figure>
              ))}
            </div>
          )}
          {ap.files.length > 0 && (
            <div className="mt-3 text-[9pt]">
              <div className="font-semibold mb-1">사진이 아닌 증빙 파일 (앱에서 확인)</div>
              {ap.files.map((r) => <div key={r.id}>· [{normDoc(r.doc_type)}] {r.file_name}</div>)}
            </div>
          )}
        </PrintPage>
      ))}
    </div>
  );
}

// prefill: 통장 거래에서 [지출로 등록]을 눌렀을 때 미리 채울 값 { expense_date, amount, description, vendor }
export function ExpenseModal({ buildingId, expense, receipts, txn, canManage, onClose, onSaved, prefill }) {
  const supabase = createClient();
  const isEdit = !!expense;
  const readOnly = !canManage;
  const init = expense || prefill || {};
  const [date, setDate] = useState(init.expense_date || todayKST());
  const [amount, setAmount] = useState(init.amount ? String(init.amount) : "");
  const [category, setCategory] = useState(expense?.category || EXPENSE_CATEGORIES[0]);
  const [description, setDescription] = useState(init.description || "");
  const [vendor, setVendor] = useState(init.vendor || "");
  const [payment, setPayment] = useState(init.payment_method || "계좌이체");
  const [memo, setMemo] = useState(expense?.memo || "");
  const [reviewStatus, setReviewStatus] = useState(expense?.review_status || "미확인");
  const [reviewMemo, setReviewMemo] = useState(expense?.review_memo || "");
  const [newFiles, setNewFiles] = useState([]); // [{ file, docType, preview }]
  const [existing, setExisting] = useState(receipts.map((r) => ({ ...r, doc_type: normDoc(r.doc_type) })));
  const [typeChanges, setTypeChanges] = useState({}); // 기존 파일 종류 변경 { id: docType }
  const [urls, setUrls] = useState({}); // 기존 증빙 보기용 임시 링크
  const [saving, setSaving] = useState(false);
  const [viewer, setViewer] = useState(null);
  const [dragType, setDragType] = useState(null); // 끌어다 놓는 중인 칸
  const [dragAny, setDragAny] = useState(false);

  // 기존 증빙 미리보기 링크 (10분 유효)
  useEffect(() => {
    if (!existing.length) return;
    supabase.storage.from("attachments")
      .createSignedUrls(existing.map((r) => r.storage_path), 600)
      .then(({ data }) => {
        const map = {};
        (data || []).forEach((d, i) => { if (d.signedUrl) map[existing[i].id] = d.signedUrl; });
        setUrls(map);
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [existing.length]);

  // 새 파일 미리보기 주소 정리
  useEffect(() => () => newFiles.forEach((n) => n.preview && URL.revokeObjectURL(n.preview)), []); // eslint-disable-line react-hooks/exhaustive-deps

  // 칸별로 이미 있는 파일 수 (기존 + 새로 추가)
  const countOf = (docType) =>
    existing.filter((r) => (typeChanges[r.id] || r.doc_type) === docType).length +
    newFiles.filter((n) => n.docType === docType).length;

  function addFilesOf(docType, files) {
    let picked = Array.from(files || []);
    const max = DOC_TYPES.find((d) => d.key === docType)?.max;
    if (max) {
      const room = Math.max(0, max - countOf(docType));
      if (picked.length > room) {
        alert(`${docType}는 최대 ${max}개까지 첨부할 수 있어요.` + (room ? ` 앞의 ${room}개만 추가합니다.` : ""));
        picked = picked.slice(0, room);
      }
    }
    const list = picked.map((file) => ({
      file, docType, preview: file.type?.startsWith("image/") ? URL.createObjectURL(file) : null,
    }));
    if (list.length) setNewFiles((prev) => [...prev, ...list]);
  }
  function removeNew(idx) {
    setNewFiles((prev) => {
      const n = prev[idx];
      if (n?.preview) URL.revokeObjectURL(n.preview);
      return prev.filter((_, j) => j !== idx);
    });
  }

  async function removeExisting(r) {
    if (!confirm("이 증빙을 삭제할까요?")) return;
    await supabase.storage.from("attachments").remove([r.storage_path]);
    const { error } = await supabase.from("expense_receipts").delete().eq("id", r.id);
    if (error) { alert("삭제 실패: " + error.message); return; }
    setExisting((prev) => prev.filter((x) => x.id !== r.id));
  }

  // 현재 화면 기준 증빙 상태 (기존 + 새 파일)
  const currentDocs = [
    ...existing.map((r) => ({ doc_type: typeChanges[r.id] || r.doc_type })),
    ...newFiles.map((n) => ({ doc_type: n.docType })),
  ];
  const okNow = evidenceOk(currentDocs);

  async function save() {
    const amt = Number(String(amount).replace(/[^\d]/g, ""));
    if (!amt) { alert("금액을 입력해주세요."); return; }
    if (!description.trim()) { alert("지출 내용을 입력해주세요."); return; }
    setSaving(true);
    const payload = {
      expense_date: date, amount: amt, category,
      description: description.trim(), vendor: vendor.trim(), payment_method: payment, memo: memo.trim(),
      review_status: reviewStatus, review_memo: reviewMemo.trim(),
      reviewed_at: reviewStatus !== (expense?.review_status || "미확인") ? new Date().toISOString() : expense?.reviewed_at || null,
    };
    let expenseId = expense?.id;
    if (isEdit) {
      const { error } = await supabase.from("building_expenses").update(payload).eq("id", expenseId);
      if (error) { setSaving(false); alert("저장 실패: " + error.message); return; }
    } else {
      const { data, error } = await supabase.from("building_expenses").insert({ ...payload, building_id: buildingId }).select().single();
      if (error) { setSaving(false); alert("저장 실패: " + error.message); return; }
      expenseId = data.id;
    }
    for (const [id, docType] of Object.entries(typeChanges)) {
      await supabase.from("expense_receipts").update({ doc_type: docType }).eq("id", id);
    }
    for (const { file: original, docType } of newFiles) {
      const { file, storageName, displayName, size } = await prepareUpload(original, { maxSide: DOC_MAX_SIDE });
      const path = `expenses/${buildingId}/${expenseId}/${storageName}`;
      const { error: upErr } = await supabase.storage.from("attachments").upload(path, file);
      if (upErr) { alert(`"${displayName}" 업로드 실패: ` + upErr.message); continue; }
      await supabase.from("expense_receipts").insert({
        expense_id: expenseId, building_id: buildingId, file_name: displayName, storage_path: path, size_bytes: size, doc_type: docType,
      });
    }
    setSaving(false);
    onSaved(expenseId);
  }

  async function remove() {
    if (!confirm("이 지출내역을 삭제할까요? 첨부된 증빙도 함께 삭제됩니다.")) return;
    setSaving(true);
    if (existing.length) await supabase.storage.from("attachments").remove(existing.map((r) => r.storage_path));
    const { error } = await supabase.from("building_expenses").delete().eq("id", expense.id);
    setSaving(false);
    if (error) { alert("삭제 실패: " + error.message); return; }
    onSaved();
  }

  // 창 아무 곳에 놓으면 '기타'로, 증빙 칸 위에 놓으면 그 종류로 추가
  const modalDrop = readOnly ? {} : {
    onDragOver: (e) => { e.preventDefault(); if (!dragAny) setDragAny(true); },
    onDragLeave: (e) => { if (!e.currentTarget.contains(e.relatedTarget)) { setDragAny(false); setDragType(null); } },
    onDrop: (e) => { e.preventDefault(); setDragAny(false); setDragType(null); addFilesOf("기타", e.dataTransfer?.files); },
  };
  const rowDrop = (key) => (readOnly ? {} : {
    onDragOver: (e) => { e.preventDefault(); e.stopPropagation(); if (dragType !== key) setDragType(key); if (!dragAny) setDragAny(true); },
    onDrop: (e) => { e.preventDefault(); e.stopPropagation(); setDragAny(false); setDragType(null); addFilesOf(key, e.dataTransfer?.files); },
  });

  const Thumb = ({ name, src, onOpen, onRemove, typeSelect, isNew }) => (
    <div className={"relative w-20 h-20 rounded-lg bg-surface2 overflow-hidden shrink-0 " + (isNew ? "ring-2 ring-accent/50" : "")}>
      {src && isImage(name) ? (
        <button type="button" className="w-full h-full" onClick={onOpen}>
          <img src={src} alt={name} className="w-full h-full object-cover" />
        </button>
      ) : (
        <a href={src || "#"} target="_blank" rel="noopener noreferrer" onClick={(e) => !src && e.preventDefault()}
          className="w-full h-full flex flex-col items-center justify-center text-[10px] text-inkDim p-1 text-center">
          <span className="text-xl">📄</span><span className="truncate w-full">{name}</span>
        </a>
      )}
      {onRemove && (
        <button type="button" onClick={onRemove} className="absolute top-0.5 right-0.5 w-5 h-5 rounded-full bg-black/60 text-white text-[10px]">✕</button>
      )}
      {typeSelect}
    </div>
  );

  return (
    <div className="fixed inset-0 bg-black/50 flex items-end sm:items-center justify-center sm:p-4 z-50" onClick={onClose}
      onDragOver={(e) => e.preventDefault()} onDrop={(e) => e.preventDefault()}>
      <div className="relative bg-surface w-full sm:max-w-lg max-h-[92vh] overflow-y-auto p-5 rounded-t-3xl sm:rounded-3xl" onClick={(e) => e.stopPropagation()} {...modalDrop}>
        <div className="flex items-center justify-between mb-4">
          <div className="font-bold text-lg">{readOnly ? "지출 상세" : isEdit ? "지출 수정" : "지출 등록"}</div>
          <button className="text-inkDim text-xl leading-none px-2" onClick={onClose} aria-label="닫기">×</button>
        </div>

        <div className="flex flex-col gap-3">
          <label className="block text-xs font-semibold text-inkDim">금액
            <div className="relative mt-1">
              <input inputMode="numeric" placeholder="0" disabled={readOnly}
                className="text-2xl font-bold text-ink pr-10 py-3"
                value={amount ? won(String(amount).replace(/[^\d]/g, "")) : ""}
                onChange={(e) => setAmount(e.target.value.replace(/[^\d]/g, ""))} />
              <span className="absolute right-4 top-1/2 -translate-y-1/2 text-lg font-semibold text-inkDim">원</span>
            </div>
          </label>

          <label className="block text-xs font-semibold text-inkDim">내용 (품목·지급용도)
            <input className="mt-1" placeholder="예: 3층 복도 전등 교체" disabled={readOnly}
              value={description} onChange={(e) => setDescription(e.target.value)} />
          </label>

          <div className="grid grid-cols-2 gap-2">
            <label className="block text-xs font-semibold text-inkDim">사용일자
              <input type="date" className="mt-1" disabled={readOnly} value={date} onChange={(e) => setDate(e.target.value)} />
            </label>
            <label className="block text-xs font-semibold text-inkDim">분류
              <select className="mt-1" disabled={readOnly} value={category} onChange={(e) => setCategory(e.target.value)}>
                {EXPENSE_CATEGORIES.map((c) => <option key={c}>{c}</option>)}
              </select>
            </label>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <label className="block text-xs font-semibold text-inkDim">거래처
              <input className="mt-1" placeholder="예: OO전기" disabled={readOnly} value={vendor} onChange={(e) => setVendor(e.target.value)} />
            </label>
            <label className="block text-xs font-semibold text-inkDim">결제수단
              <select className="mt-1" disabled={readOnly} value={payment} onChange={(e) => setPayment(e.target.value)}>
                {PAYMENT_METHODS.map((p) => <option key={p}>{p}</option>)}
              </select>
            </label>
          </div>

          {(!readOnly || memo) && (
            <label className="block text-xs font-semibold text-inkDim">메모
              <input className="mt-1" placeholder="선택 사항" disabled={readOnly} value={memo} onChange={(e) => setMemo(e.target.value)} />
            </label>
          )}

          {isEdit && (
            <div className="rounded-xl bg-surface2 px-3 py-2 text-xs flex items-center justify-between">
              <span className="text-inkDim">이체상태</span>
              {txn
                ? <span className="font-semibold text-ok">집행 완료 · {md(txn.txn_date)} 출금 ({txn.account_label})</span>
                : <span className="font-semibold text-warn">{transferStatus(expense, null) === "-" ? "카드·현금 결제" : "통장 출금 미확인"}</span>}
            </div>
          )}

          {/* 증빙파일 목록 (RCMS 방식) */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <div className="text-xs font-semibold text-inkDim">증빙파일 목록</div>
              <Pill tone={okNow ? "ok" : "warn"}>증빙 {okNow ? "정상" : "미흡"}</Pill>
            </div>
            {!readOnly && (
              <div className="text-[11px] text-inkDim mb-2">
                <b className="text-accent">선택필수</b> 3가지 중 하나는 꼭 올려주세요.
                <span className="hidden md:inline"> 파일을 해당 칸 위로 끌어다 놓아도 돼요.</span>
              </div>
            )}
            <div className="rounded-xl border border-border divide-y divide-border">
              {DOC_TYPES.map((d) => {
                const ex = existing.filter((r) => (typeChanges[r.id] || r.doc_type) === d.key);
                const nw = newFiles.map((n, i) => ({ ...n, i })).filter((n) => n.docType === d.key);
                const has = ex.length + nw.length > 0;
                if (readOnly && !has) return null;
                return (
                  <div key={d.key} {...rowDrop(d.key)}
                    className={"px-3 py-2 transition-colors " + (dragType === d.key ? "bg-accent/10" : dragAny ? "bg-surface2/60" : "")}>
                    <div className="flex items-center gap-2">
                      <span className="flex-1 min-w-0 text-sm font-semibold">
                        {d.key}
                        {d.required && <span className="text-danger ml-0.5">*</span>}
                        {d.hint && <span className="text-[11px] font-normal text-inkDim ml-1">{d.hint}</span>}
                      </span>
                      {d.required && <span className="text-[11px] font-semibold text-accent">선택필수</span>}
                      {has && <span className="text-[11px] text-inkDim">{ex.length + nw.length}{d.max ? ` / ${d.max}` : ""}개</span>}
                      {!readOnly && !(d.max && ex.length + nw.length >= d.max) && (
                        <>
                          <label className="w-8 h-8 rounded-lg bg-surface2 flex items-center justify-center cursor-pointer hover:bg-border" title="사진 찍기">
                            📷
                            <input type="file" accept="image/*" capture="environment" className="hidden"
                              onChange={(e) => { addFilesOf(d.key, e.target.files); e.target.value = ""; }} />
                          </label>
                          <label className="w-8 h-8 rounded-lg bg-surface2 flex items-center justify-center cursor-pointer hover:bg-border text-lg font-bold text-inkDim" title="파일 추가">
                            +
                            <input type="file" accept={FILE_ACCEPT} multiple className="hidden"
                              onChange={(e) => { addFilesOf(d.key, e.target.files); e.target.value = ""; }} />
                          </label>
                        </>
                      )}
                    </div>
                    {has && (
                      <div className="flex gap-2 overflow-x-auto mt-2 pb-1">
                        {ex.map((r) => (
                          <Thumb key={r.id} name={r.file_name} src={urls[r.id]} onOpen={() => setViewer(urls[r.id])}
                            onRemove={readOnly ? null : () => removeExisting(r)}
                            typeSelect={!readOnly && (
                              <select value={typeChanges[r.id] || r.doc_type}
                                onChange={(e) => setTypeChanges((p) => ({ ...p, [r.id]: e.target.value }))}
                                className="absolute bottom-0 inset-x-0 text-[9px] px-1 py-0.5 rounded-none bg-black/60 text-white border-0"
                                title="종류 변경">
                                {DOC_TYPES.map((t) => <option key={t.key} value={t.key}>{t.key}</option>)}
                              </select>
                            )} />
                        ))}
                        {nw.map((n) => (
                          <Thumb key={"n" + n.i} name={n.file.name} src={n.preview} isNew onOpen={() => n.preview && setViewer(n.preview)}
                            onRemove={() => removeNew(n.i)} />
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
              {readOnly && existing.length === 0 && <div className="px-3 py-3 text-xs text-inkDim">첨부된 증빙이 없습니다.</div>}
            </div>
          </div>

          {/* 관리자 점검 */}
          {(canManage || (expense && (expense.review_status || "미확인") !== "미확인")) && (
            <div className="rounded-xl border border-border p-3">
              <div className="text-xs font-semibold text-inkDim mb-2">점검 (관리자)</div>
              {canManage ? (
                <>
                  <div className="grid grid-cols-3 gap-1.5 mb-2">
                    {["미확인", "정상", "미흡"].map((s) => (
                      <button key={s} type="button" onClick={() => setReviewStatus(s)}
                        className={"rounded-lg py-2 text-sm font-semibold border " + (reviewStatus === s
                          ? (s === "정상" ? "bg-ok text-white border-ok" : s === "미흡" ? "bg-danger text-white border-danger" : "bg-ink text-white border-ink")
                          : "bg-surface border-border text-inkDim")}>{s}</button>
                    ))}
                  </div>
                  <input placeholder="점검메모 (예: 세금계산서 재발행 요청)" value={reviewMemo} onChange={(e) => setReviewMemo(e.target.value)} />
                </>
              ) : (
                <div className="flex items-center gap-2 text-sm">
                  <Pill tone={reviewTone(expense.review_status)}>{expense.review_status}</Pill>
                  <span className="text-inkDim">{expense.review_memo}</span>
                </div>
              )}
            </div>
          )}
        </div>

        {!readOnly && (
          <div className="flex items-center justify-between gap-2 mt-6">
            <div>
              {isEdit && <button className="text-danger text-sm font-medium" disabled={saving} onClick={remove}>삭제</button>}
            </div>
            <div className="flex gap-2">
              <button className="btn-ghost" onClick={onClose}>취소</button>
              <button className="btn px-6" disabled={saving} onClick={save}>{saving ? "저장 중…" : "저장"}</button>
            </div>
          </div>
        )}
      </div>

      {viewer && (
        <div className="fixed inset-0 z-[60] bg-black/90 flex items-center justify-center p-4" onClick={(e) => { e.stopPropagation(); setViewer(null); }}>
          <img src={viewer} alt="증빙" className="max-w-full max-h-full object-contain rounded-lg" />
        </div>
      )}
    </div>
  );
}
