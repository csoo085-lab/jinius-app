"use client";

// 회계 장부
// - 모든 건물: 수입·지출 장부(통장 입출금 + 카드·현금 지출) 출력
// - 복식부기를 켠 건물: 계정과목표를 올리면 분개장 · 계정별 원장 · 합계시산표 · 수지계산서 출력
import { useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabaseClient";
import {
  parseAccountsFile, leafAccounts, suggestBankAccount, buildJournal, accountTotals, rollupTotals, balanceOf,
} from "@/lib/accounts";
import { won, shiftMonth } from "@/components/ExpensesManager";
import RecurringExpenses from "@/components/RecurringExpenses";

const NAVY = "#1f2a44";
const REPORTS = [
  { key: "journal", label: "분개장" },
  { key: "ledger", label: "계정별 원장" },
  { key: "trial", label: "합계시산표" },
  { key: "income", label: "수지계산서" },
];
const md = (iso) => (iso ? `${Number(iso.slice(5, 7))}/${Number(iso.slice(8, 10))}` : "");
const todayDots = () => new Date().toLocaleDateString("sv-SE", { timeZone: "Asia/Seoul" }).replaceAll("-", ". ");

function chunk(arr, n) {
  const out = [];
  for (let i = 0; i < arr.length; i += n) out.push(arr.slice(i, i + n));
  return out.length ? out : [[]];
}

export default function BookkeepingManager({
  buildingId, buildingName, month, settings, accounts, txns, expenses, canManage, setupNeeded,
  recurring = [], recurringReady = true,
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [settingOpen, setSettingOpen] = useState(false);
  const [report, setReport] = useState("journal");
  const [printing, setPrinting] = useState(null); // { kind, n } 출력할 장부
  const [busy, setBusy] = useState("");
  const [ledgerCode, setLedgerCode] = useState("");

  const enabled = !!settings.enabled && accounts.length > 0;
  const [y, m] = month.split("-");
  const monthStart = `${month}-01`;
  const inMonth = (d) => (d || "").slice(0, 7) === month;
  const byCode = useMemo(() => Object.fromEntries(accounts.map((a) => [a.code, a])), [accounts]);

  function goMonth(next) {
    const params = new URLSearchParams(searchParams.toString());
    params.set("month", next);
    router.push(`${pathname}?${params.toString()}`);
  }

  // 출력: 숨겨둔 출력용 내용을 그린 뒤 인쇄 창 (출력용 내용은 화면에 안 보이므로 그대로 둠 — 모바일 빈 장 방지)
  useEffect(() => {
    if (!printing) return;
    const t = setTimeout(() => window.print(), 150);
    return () => clearTimeout(t);
  }, [printing]);

  // ---------- 분개 (1월~이번 달) ----------
  const journalAll = useMemo(() => (enabled ? buildJournal({
    accounts, txns, expenses, bankMap: settings.bankMap || {}, cashCode: settings.cashCode, cardCode: settings.cardCode, recurring,
  }) : []), [enabled, accounts, txns, expenses, settings, recurring]);
  const journal = useMemo(() => {
    const list = journalAll.filter((e) => inMonth(e.date));
    list.forEach((e, i) => { e.mno = i + 1; });
    return list;
  }, [journalAll, month]); // eslint-disable-line react-hooks/exhaustive-deps
  const before = useMemo(() => journalAll.filter((e) => e.date < monthStart), [journalAll, monthStart]);

  const totM = useMemo(() => rollupTotals(accounts, accountTotals(journal)), [accounts, journal]);
  const totY = useMemo(() => rollupTotals(accounts, accountTotals(journalAll.filter((e) => e.date < `${shiftMonth(month, 1)}-01`))), [accounts, journalAll, month]);
  const totB = useMemo(() => rollupTotals(accounts, accountTotals(before)), [accounts, before]);

  const missing = journal.filter((e) => !e.debit || !e.credit);
  const suggested = journal.filter((e) => e.suggested && e.debit && e.credit);

  async function saveCode(edit, code) {
    setBusy("saving");
    const supabase = createClient();
    const { error } = await supabase.from(edit.table).update({ account_code: code }).eq("id", edit.id);
    setBusy("");
    if (error) { alert("저장하지 못했어요: " + error.message); return; }
    router.refresh();
  }

  async function confirmAll() {
    if (!suggested.length) return;
    if (!confirm(`추천 계정 ${suggested.length}건을 그대로 확정할까요?`)) return;
    setBusy("saving");
    const supabase = createClient();
    for (const part of chunk(suggested, 10)) {
      await Promise.all(part.map((e) => supabase.from(e.edit.table)
        .update({ account_code: e.edit.side === "debit" ? e.debit : e.credit }).eq("id", e.edit.id)));
    }
    setBusy("");
    router.refresh();
  }

  // ---------- 수입·지출 장부 (복식부기 미사용 건물도) ----------
  const cashbook = useMemo(() => {
    const rows = [];
    txns.filter((t) => inMonth(t.txn_date)).forEach((t) => {
      const e = t.expense_id ? expenses.find((x) => x.id === t.expense_id) : null;
      rows.push({
        at: t.txn_at, date: t.txn_date, via: t.account_label || "통장",
        desc: e ? `${e.description}${e.vendor ? ` (${e.vendor})` : ""}` : (t.description || t.txn_type || ""),
        cat: e?.category || (t.direction === "입금" ? (t.txn_type || "") : ""),
        inc: t.direction === "입금" ? Number(t.amount) : 0, out: t.direction === "출금" ? Number(t.amount) : 0,
        bal: t.balance,
      });
    });
    expenses.filter((e) => inMonth(e.expense_date) && (e.payment_method === "카드" || e.payment_method === "현금")).forEach((e) => {
      rows.push({
        at: `${e.expense_date}T12:00:00+09:00`, date: e.expense_date, via: e.payment_method,
        desc: `${e.description}${e.vendor ? ` (${e.vendor})` : ""}`, cat: e.category, inc: 0, out: Number(e.amount), bal: null,
      });
    });
    rows.sort((a, b) => (a.at || "").localeCompare(b.at || ""));
    return rows;
  }, [txns, expenses, month]); // eslint-disable-line react-hooks/exhaustive-deps
  const cbIn = cashbook.reduce((s, r) => s + r.inc, 0);
  const cbOut = cashbook.reduce((s, r) => s + r.out, 0);

  if (setupNeeded) {
    return (
      <div className="card text-sm">
        회계 장부 기능을 쓰려면 Supabase에서 <strong>bookkeeping.sql</strong>을 한 번 실행해야 합니다.
      </div>
    );
  }

  const usedLeaves = Object.keys(totY).filter((c) => byCode[c]?.is_leaf).sort();
  const selLedger = ledgerCode && byCode[ledgerCode] ? ledgerCode : usedLeaves[0] || "";

  return (
    <div>
      <div className="print:hidden">
        <div className="flex items-end justify-between gap-3 mb-5">
          <div className="font-semibold text-sm text-inkDim">
            회계 장부 {enabled ? <span className="tag ml-1 text-accent border-accent/40">복식부기</span> : <span className="tag ml-1">수입·지출 장부</span>}
          </div>
          <div className="flex gap-2 shrink-0">
            {canManage && <button className="btn-ghost" onClick={() => setSettingOpen(true)}>⚙ 회계 설정</button>}
            <button className="btn" onClick={() => setPrinting((p) => ({ kind: enabled ? report : "cashbook", n: (p?.n || 0) + 1 }))}>🖨 출력</button>
          </div>
        </div>

        <div className="card mb-4">
          <div className="flex items-center justify-between mb-4">
            <button className="btn-ghost text-xs" onClick={() => goMonth(shiftMonth(month, -1))}>‹ 이전</button>
            <div className="font-bold text-base">{y}년 {Number(m)}월</div>
            <button className="btn-ghost text-xs" onClick={() => goMonth(shiftMonth(month, 1))}>다음 ›</button>
          </div>
          <div className="grid grid-cols-3 gap-3 text-center">
            <Stat label="수입" value={cbIn} tone="text-accent" />
            <Stat label="지출" value={cbOut} tone="text-warn" />
            <Stat label="차액" value={cbIn - cbOut} />
          </div>
          {!enabled && canManage && (
            <div className="mt-4 rounded-xl bg-surface2 p-3 text-xs text-inkDim leading-relaxed">
              이 건물은 <b className="text-ink">수입·지출 장부</b>로 출력합니다. 분개장·시산표·수지계산서가 필요하면
              <button className="underline font-semibold text-accent ml-1" onClick={() => setSettingOpen(true)}>⚙ 회계 설정</button>에서
              복식부기를 켜고 계정과목표를 올려주세요.
            </div>
          )}
        </div>

        <RecurringExpenses buildingId={buildingId} month={month} items={recurring} txns={txns} accounts={enabled ? accounts : []}
          canManage={canManage} ready={recurringReady} />

        {!enabled ? (
          <CashbookTable rows={cashbook} />
        ) : (
          <>
            {canManage && (missing.length > 0 || suggested.length > 0) && (
              <div className="card mb-4 text-sm flex flex-wrap items-center gap-2">
                {missing.length > 0 && <span className="tag bg-surface text-warn border-warn/40">계정 미분류 {missing.length}건</span>}
                {suggested.length > 0 && <span className="tag bg-surface">추천 계정 {suggested.length}건 (회색 글씨)</span>}
                <span className="text-xs text-inkDim">분개장에서 계정을 눌러 바꿀 수 있어요.</span>
                {suggested.length > 0 && (
                  <button className="btn-ghost text-xs ml-auto" disabled={!!busy} onClick={confirmAll}>추천대로 모두 확정</button>
                )}
              </div>
            )}

            <div className="flex gap-1 p-1 rounded-xl bg-surface2 mb-4 w-full md:w-auto md:inline-flex">
              {REPORTS.map((r) => (
                <button key={r.key} onClick={() => setReport(r.key)}
                  className={"flex-1 md:flex-none whitespace-nowrap px-2 md:px-4 py-2 rounded-lg text-xs md:text-sm font-semibold " + (report === r.key ? "bg-surface text-ink shadow-sm" : "text-inkDim")}>
                  {r.label}
                </button>
              ))}
            </div>

            {report === "journal" && (
              <JournalTable rows={journal} accounts={accounts} canManage={canManage} busy={!!busy} onChange={saveCode} />
            )}
            {report === "ledger" && (
              <div className="card">
                <div className="flex items-center gap-2 mb-3">
                  <select className="max-w-xs" value={selLedger} onChange={(e) => setLedgerCode(e.target.value)}>
                    {usedLeaves.map((c) => <option key={c} value={c}>{c} {byCode[c].name}</option>)}
                  </select>
                  <span className="text-xs text-inkDim">출력하면 이번 달 거래가 있는 계정이 모두 나옵니다.</span>
                </div>
                {selLedger ? <LedgerTable acc={byCode[selLedger]} rows={journal} opening={balanceOf(byCode[selLedger], totB[selLedger])} />
                  : <div className="text-sm text-inkDim">거래가 없습니다.</div>}
              </div>
            )}
            {report === "trial" && <div className="card"><TrialTable accounts={accounts} totM={totM} totY={totY} /></div>}
            {report === "income" && <div className="card"><IncomeTable accounts={accounts} totM={totM} totY={totY} /></div>}
            <div className="text-xs text-inkDim mt-3 leading-relaxed">
              통장 입출금은 통장내역 기준으로, 카드·현금 지출은 지출 등록 기준으로 분개됩니다. 계좌이체로 등록한 지출은 통장 출금이 확인된 뒤 장부에 들어갑니다.
              누계는 {y}년 1월부터입니다.
            </div>
          </>
        )}
      </div>

      {printing && (
        <PrintReports kind={printing.kind} buildingName={buildingName} month={month} accounts={accounts} byCode={byCode}
          journal={journal} totM={totM} totY={totY} totB={totB} cashbook={cashbook} cbIn={cbIn} cbOut={cbOut} />
      )}

      {settingOpen && (
        <BookSettings buildingId={buildingId} settings={settings} accounts={accounts} txns={txns}
          onClose={() => setSettingOpen(false)} onSaved={() => { setSettingOpen(false); router.refresh(); }} />
      )}
    </div>
  );
}

function Stat({ label, value, tone = "" }) {
  return (
    <div className="rounded-xl bg-surface2 py-3">
      <div className="text-xs text-inkDim">{label}</div>
      <div className={"text-lg font-bold mt-0.5 " + tone}>{won(value)}<span className="text-xs font-semibold ml-0.5">원</span></div>
    </div>
  );
}

// ---------- 화면 표 ----------
function CashbookTable({ rows }) {
  if (!rows.length) return <div className="card text-sm text-inkDim">이번 달 통장 거래나 카드·현금 지출이 없습니다. [거래내역] 탭에서 통장 엑셀을 올려주세요.</div>;
  return (
    <div className="card">
      <table className="w-full text-sm">
        <thead><tr className="border-b text-left">
          <th>일자</th><th>통장·수단</th><th>내용</th><th className="text-right">수입</th><th className="text-right">지출</th><th className="text-right hidden md:table-cell">통장 잔액</th>
        </tr></thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} className="border-b">
              <td className="whitespace-nowrap">{md(r.date)}</td>
              <td className="text-xs text-inkDim whitespace-nowrap">{r.via}</td>
              <td className="min-w-[10rem]">{r.desc}{r.cat && <span className="text-xs text-inkDim"> · {r.cat}</span>}</td>
              <td className="text-right whitespace-nowrap text-accent">{r.inc ? won(r.inc) : ""}</td>
              <td className="text-right whitespace-nowrap">{r.out ? won(r.out) : ""}</td>
              <td className="text-right whitespace-nowrap text-inkDim hidden md:table-cell">{r.bal != null ? won(r.bal) : ""}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function AccountSelect({ value, accounts, suggested, disabled, onChange }) {
  const leaves = leafAccounts(accounts);
  return (
    <select value={value || ""} disabled={disabled} onChange={(e) => onChange(e.target.value)}
      className={"text-xs py-1 px-2 min-w-[9rem] " + (!value ? "text-warn font-semibold" : suggested ? "text-inkDim" : "font-semibold")}>
      <option value="">미분류</option>
      {leaves.map((a) => <option key={a.code} value={a.code}>{a.code} {a.name}</option>)}
    </select>
  );
}

function JournalTable({ rows, accounts, canManage, busy, onChange }) {
  const byCode = Object.fromEntries(accounts.map((a) => [a.code, a]));
  const nm = (c) => (c && byCode[c] ? `${byCode[c].name}` : "미분류");
  if (!rows.length) return <div className="card text-sm text-inkDim">이번 달 분개할 거래가 없습니다.</div>;
  const total = rows.reduce((s, r) => s + r.amount, 0);
  return (
    <div className="card">
      <table className="w-full text-sm">
        <thead><tr className="border-b text-left">
          <th>No</th><th>일자</th><th>적요</th><th>차변 계정</th><th>대변 계정</th><th className="text-right">금액</th>
        </tr></thead>
        <tbody>
          {rows.map((r) => {
            const editSide = r.edit.side;
            const cell = (side) => {
              const code = side === "debit" ? r.debit : r.credit;
              if (canManage && side === editSide) {
                return <AccountSelect value={code} accounts={accounts} suggested={r.suggested} disabled={busy} onChange={(c) => onChange(r.edit, c)} />;
              }
              return <span className={code ? "" : "text-warn font-semibold"}>{nm(code)}</span>;
            };
            return (
              <tr key={r.no} className="border-b">
                <td className="text-inkDim">{r.mno}</td>
                <td className="whitespace-nowrap">{md(r.date)}</td>
                <td className="min-w-[9rem]">{r.desc}<div className="text-[11px] text-inkDim">{r.src}</div></td>
                <td>{cell("debit")}</td>
                <td>{cell("credit")}</td>
                <td className="text-right whitespace-nowrap font-semibold">{won(r.amount)}</td>
              </tr>
            );
          })}
          <tr><td colSpan={5} className="text-right font-semibold">합계</td><td className="text-right font-bold">{won(total)}</td></tr>
        </tbody>
      </table>
    </div>
  );
}

function ledgerLines(acc, rows, opening) {
  let bal = opening;
  return rows.filter((r) => r.debit === acc.code || r.credit === acc.code).map((r) => {
    const isD = r.debit === acc.code;
    const d = isD ? r.amount : 0, c = isD ? 0 : r.amount;
    bal += acc.side === "대변" ? c - d : d - c;
    return { date: r.date, desc: r.desc, other: isD ? r.creditName : r.debitName, d, c, bal };
  });
}

function LedgerTable({ acc, rows, opening }) {
  const lines = ledgerLines(acc, rows, opening);
  return (
    <table className="w-full text-sm">
      <thead><tr className="border-b text-left">
        <th>일자</th><th>적요</th><th>상대 계정</th><th className="text-right">차변</th><th className="text-right">대변</th><th className="text-right">잔액</th>
      </tr></thead>
      <tbody>
        <tr className="border-b text-inkDim"><td /><td>전월 이월</td><td /><td /><td /><td className="text-right">{won(opening)}</td></tr>
        {lines.map((l, i) => (
          <tr key={i} className="border-b">
            <td className="whitespace-nowrap">{md(l.date)}</td><td>{l.desc}</td><td className="text-xs">{l.other}</td>
            <td className="text-right">{l.d ? won(l.d) : ""}</td><td className="text-right">{l.c ? won(l.c) : ""}</td>
            <td className="text-right font-semibold">{won(l.bal)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

// 거래가 있는 계정만 (묶음 계정 포함), 계정표 순서대로
const activeAccounts = (accounts, tot) => accounts.filter((a) => tot[a.code] && (tot[a.code].debit || tot[a.code].credit));

function TrialTable({ accounts, totM, totY }) {
  const list = activeAccounts(accounts, totY);
  const tops = accounts.filter((a) => a.level === 0);
  const sum = (tot, k) => tops.reduce((s, a) => s + (tot[a.code]?.[k] || 0), 0);
  return (
    <table className="w-full text-sm">
      <thead>
        <tr className="border-b text-left">
          <th className="text-right">누계 차변</th><th className="text-right">당월 차변</th><th className="text-center">계정과목</th>
          <th className="text-right">당월 대변</th><th className="text-right">누계 대변</th>
        </tr>
      </thead>
      <tbody>
        {list.map((a) => (
          <tr key={a.code} className={"border-b " + (a.is_leaf ? "" : "font-semibold")}>
            <td className="text-right">{won(totY[a.code]?.debit || 0)}</td>
            <td className="text-right">{won(totM[a.code]?.debit || 0)}</td>
            <td style={{ paddingLeft: `${a.level * 0.9 + 0.4}rem` }} className="whitespace-nowrap">{a.name.replace(/^\((.*)\)$/, "$1")}</td>
            <td className="text-right">{won(totM[a.code]?.credit || 0)}</td>
            <td className="text-right">{won(totY[a.code]?.credit || 0)}</td>
          </tr>
        ))}
        <tr className="font-bold">
          <td className="text-right">{won(sum(totY, "debit"))}</td><td className="text-right">{won(sum(totM, "debit"))}</td>
          <td className="text-center">합계</td>
          <td className="text-right">{won(sum(totM, "credit"))}</td><td className="text-right">{won(sum(totY, "credit"))}</td>
        </tr>
      </tbody>
    </table>
  );
}

// 수지계산서: 손익(4로 시작) 계정만, 수익(대변) / 비용(차변)
function incomeRows(accounts, totY) {
  const pl = activeAccounts(accounts, totY).filter((a) => a.code.startsWith("4") && a.level > 0);
  return { rev: pl.filter((a) => a.side === "대변"), exp: pl.filter((a) => a.side === "차변") };
}
function IncomeTable({ accounts, totM, totY }) {
  const byCode = Object.fromEntries(accounts.map((a) => [a.code, a]));
  const { rev, exp } = incomeRows(accounts, totY);
  const minLv = Math.min(...[...rev, ...exp].map((a) => a.level), 9);
  const top = (list) => list.filter((a) => a.level === minLv);
  const sumOf = (list, tot) => top(list).reduce((s, a) => s + balanceOf(byCode[a.code], tot[a.code]), 0);
  const revM = sumOf(rev, totM), revY = sumOf(rev, totY), expM = sumOf(exp, totM), expY = sumOf(exp, totY);
  const block = (title, list, sM, sY) => (
    <>
      <tr className="bg-surface2">
        <td className="font-bold px-2">{title}</td><td className="text-right font-bold">{won(sM)}</td><td className="text-right font-bold">{won(sY)}</td>
      </tr>
      {list.map((a) => (
        <tr key={a.code} className={"border-b " + (a.is_leaf ? "" : "font-semibold")}>
          <td style={{ paddingLeft: `${(a.level - minLv) * 0.9 + 0.8}rem` }}>{a.name.replace(/^\((.*)\)$/, "$1")}</td>
          <td className="text-right">{won(balanceOf(a, totM[a.code]))}</td>
          <td className="text-right">{won(balanceOf(a, totY[a.code]))}</td>
        </tr>
      ))}
    </>
  );
  return (
    <table className="w-full text-sm">
      <thead><tr className="border-b text-left"><th>과목</th><th className="text-right">당월</th><th className="text-right">누계</th></tr></thead>
      <tbody>
        {block("수익", rev, revM, revY)}
        {block("비용", exp, expM, expY)}
        <tr className="font-bold border-t-2"><td className="px-2">수지 차액 (수익 − 비용)</td><td className="text-right">{won(revM - expM)}</td><td className="text-right">{won(revY - expY)}</td></tr>
      </tbody>
    </table>
  );
}

// ---------- 출력 ----------
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

const TH = "px-1.5 py-2 font-semibold text-white text-[8.5pt] text-left";
const TD = "px-1.5 py-[4px] leading-tight border-b border-black/15 text-[8.5pt]";
const PER_PAGE = 40;

function PrintTable({ head, rows, widths }) {
  return (
    <table className="w-full border-collapse table-fixed">
      <colgroup>{widths.map((w, i) => <col key={i} style={{ width: w }} />)}</colgroup>
      <thead><tr style={{ background: NAVY }}>{head.map((h, i) => <th key={i} className={TH + (h.r ? " text-right" : "")}>{h.t}</th>)}</tr></thead>
      <tbody>{rows}</tbody>
    </table>
  );
}

function PrintReports({ kind, buildingName, month, accounts, byCode, journal, totM, totY, totB, cashbook, cbIn, cbOut }) {
  const [y, m] = month.split("-");
  const mm = Number(m);
  const period = `${y}년 ${mm}월`;
  const right = `${buildingName} 관리단`;
  const footRight = `${buildingName} 관리단 · 관리업체 지니어스 1551-9976 · 출력 ${todayDots()}`;
  const R = "text-right whitespace-nowrap";
  let pages = [];

  if (kind === "cashbook") {
    let run = 0;
    const rows = cashbook.map((r, i) => {
      run += r.inc - r.out;
      return (
        <tr key={i}>
          <td className={TD}>{md(r.date)}</td><td className={TD + " truncate"}>{r.via}</td>
          <td className={TD + " truncate"}>{r.desc}</td><td className={TD + " truncate"}>{r.cat}</td>
          <td className={TD + " " + R}>{r.inc ? won(r.inc) : ""}</td><td className={TD + " " + R}>{r.out ? won(r.out) : ""}</td>
          <td className={TD + " " + R}>{won(run)}</td>
        </tr>
      );
    });
    const head = [{ t: "일자" }, { t: "통장·수단" }, { t: "내용" }, { t: "분류" }, { t: "수입", r: 1 }, { t: "지출", r: 1 }, { t: "누계 차액", r: 1 }];
    pages = chunk(rows, PER_PAGE).map((part) => ({
      title: `${period} 수입·지출 장부`,
      body: <PrintTable head={head} rows={part} widths={["7%", "13%", "33%", "13%", "11%", "11%", "12%"]} />,
    }));
    pages.forEach((p) => { p.foot = <>수입 {won(cbIn)}원 · 지출 {won(cbOut)}원 · 차액 {won(cbIn - cbOut)}원</>; });
  }

  if (kind === "journal") {
    const rows = journal.map((r) => (
      <tr key={r.no}>
        <td className={TD}>{r.mno}</td><td className={TD}>{md(r.date)}</td>
        <td className={TD + " truncate"}>{r.desc}</td>
        <td className={TD + " truncate"}>{r.debit ? `${r.debitName}` : "미분류"}</td>
        <td className={TD + " " + R}>{won(r.amount)}</td>
        <td className={TD + " truncate"}>{r.credit ? `${r.creditName}` : "미분류"}</td>
        <td className={TD + " " + R}>{won(r.amount)}</td>
      </tr>
    ));
    const total = journal.reduce((s, r) => s + r.amount, 0);
    const head = [{ t: "No" }, { t: "일자" }, { t: "적요" }, { t: "차변 계정" }, { t: "차변 금액", r: 1 }, { t: "대변 계정" }, { t: "대변 금액", r: 1 }];
    pages = chunk(rows, PER_PAGE).map((part) => ({
      title: `${period} 분개장`,
      body: <PrintTable head={head} rows={part} widths={["5%", "7%", "32%", "15%", "13%", "15%", "13%"]} />,
      foot: <>차변 합계 {won(total)}원 · 대변 합계 {won(total)}원 · {journal.length}건</>,
    }));
  }

  if (kind === "ledger") {
    // 계정마다 머리줄 + 이월 + 거래 줄을 이어 붙여 쪽을 나눔
    const lines = [];
    accounts.filter((a) => a.is_leaf && (totM[a.code] || totB[a.code])).forEach((a) => {
      const opening = balanceOf(a, totB[a.code]);
      const ls = ledgerLines(a, journal, opening);
      if (!ls.length && !opening) return;
      lines.push(<tr key={a.code + "h"} style={{ background: "#eef1f6" }}><td colSpan={6} className={TD + " font-bold"} style={{ color: NAVY }}>{a.code} {a.name} <span className="font-normal text-black/50">({a.side})</span></td></tr>);
      lines.push(<tr key={a.code + "o"}><td className={TD} /><td className={TD + " text-black/60"}>전월 이월</td><td className={TD} /><td className={TD} /><td className={TD} /><td className={TD + " " + R}>{won(opening)}</td></tr>);
      ls.forEach((l, i) => lines.push(
        <tr key={a.code + i}>
          <td className={TD}>{md(l.date)}</td><td className={TD + " truncate"}>{l.desc}</td><td className={TD + " truncate"}>{l.other}</td>
          <td className={TD + " " + R}>{l.d ? won(l.d) : ""}</td><td className={TD + " " + R}>{l.c ? won(l.c) : ""}</td><td className={TD + " " + R + " font-semibold"}>{won(l.bal)}</td>
        </tr>,
      ));
    });
    const head = [{ t: "일자" }, { t: "적요" }, { t: "상대 계정" }, { t: "차변", r: 1 }, { t: "대변", r: 1 }, { t: "잔액", r: 1 }];
    pages = chunk(lines, PER_PAGE).map((part) => ({
      title: `${period} 계정별 원장`,
      body: <PrintTable head={head} rows={part} widths={["7%", "37%", "16%", "13%", "13%", "14%"]} />,
    }));
  }

  if (kind === "trial") {
    const head = [{ t: "누계 차변", r: 1 }, { t: "당월 차변", r: 1 }, { t: "계정과목" }, { t: "당월 대변", r: 1 }, { t: "누계 대변", r: 1 }];
    pages = chunk(trialRows(accounts, totM, totY), 40).map((part) => ({
      title: `${period} 합계시산표`,
      body: <PrintTable head={head} rows={part} widths={["17%", "17%", "32%", "17%", "17%"]} />,
    }));
  }
  if (kind === "income") {
    const head = [{ t: "과 목" }, { t: "당 월", r: 1 }, { t: "누 계", r: 1 }];
    const parts = chunk(incomePrintRows(accounts, totM, totY), 40);
    pages = parts.map((part, i) => ({
      title: `${period} 수지계산서`,
      body: (
        <>
          <PrintTable head={head} rows={part} widths={["50%", "25%", "25%"]} />
          {i === parts.length - 1 && <div className="mt-8 text-[9.5pt] text-center">위와 같이 {y}년 {mm}월 수지 내역을 보고합니다.</div>}
        </>
      ),
    }));
  }

  return (
    <div id="book-print" className="hidden print:block text-black" style={{ WebkitPrintColorAdjust: "exact", printColorAdjust: "exact" }}>
      {pages.map((p, i) => (
        <PrintPage key={i} title={i === 0 ? `${buildingName} ${p.title}` : `${p.title} (계속)`} right={right} page={i + 1} pages={pages.length}
          footLeft={p.foot || ""} footRight={footRight}>
          {i === 0 && (
            <div className="text-[9pt] text-black/70 mb-2">
              기간 {y}. {String(mm).padStart(2, "0")}. 01 ~ {y}. {String(mm).padStart(2, "0")}. {new Date(Number(y), mm, 0).getDate()}
              {(kind === "trial" || kind === "income") && <> · 누계 {y}. 01. 01부터</>}
              {kind !== "cashbook" && <> · 단위: 원</>}
            </div>
          )}
          {p.body}
        </PrintPage>
      ))}
    </div>
  );
}

function trialRows(accounts, totM, totY) {
  const list = activeAccounts(accounts, totY);
  const tops = accounts.filter((a) => a.level === 0);
  const sum = (tot, k) => tops.reduce((s, a) => s + (tot[a.code]?.[k] || 0), 0);
  const R = TD + " text-right whitespace-nowrap";
  return [
    ...list.map((a) => (
      <tr key={a.code} className={a.is_leaf ? "" : "font-semibold"} style={a.level === 0 ? { background: "#eef1f6" } : undefined}>
        <td className={R}>{won(totY[a.code]?.debit || 0)}</td><td className={R}>{won(totM[a.code]?.debit || 0)}</td>
        <td className={TD + " truncate"} style={{ paddingLeft: `${a.level * 10 + 6}px` }}>{a.name.replace(/^\((.*)\)$/, "$1")}</td>
        <td className={R}>{won(totM[a.code]?.credit || 0)}</td><td className={R}>{won(totY[a.code]?.credit || 0)}</td>
      </tr>
    )),
    <tr key="sum" className="font-bold" style={{ borderTop: `2px solid ${NAVY}` }}>
      <td className={R}>{won(sum(totY, "debit"))}</td><td className={R}>{won(sum(totM, "debit"))}</td>
      <td className={TD + " text-center"}>합 계</td>
      <td className={R}>{won(sum(totM, "credit"))}</td><td className={R}>{won(sum(totY, "credit"))}</td>
    </tr>,
  ];
}

function incomePrintRows(accounts, totM, totY) {
  const byCode = Object.fromEntries(accounts.map((a) => [a.code, a]));
  const { rev, exp } = incomeRows(accounts, totY);
  const minLv = Math.min(...[...rev, ...exp].map((a) => a.level), 9);
  const sumOf = (list, tot) => list.filter((a) => a.level === minLv).reduce((s, a) => s + balanceOf(byCode[a.code], tot[a.code]), 0);
  const revM = sumOf(rev, totM), revY = sumOf(rev, totY), expM = sumOf(exp, totM), expY = sumOf(exp, totY);
  const R = TD + " text-right whitespace-nowrap";
  const block = (title, list, sM, sY) => [
    <tr key={title} style={{ background: "#eef1f6" }}><td className={TD + " font-bold"} style={{ color: NAVY }}>{title}</td><td className={R + " font-bold"}>{won(sM)}</td><td className={R + " font-bold"}>{won(sY)}</td></tr>,
    ...list.map((a) => (
      <tr key={a.code} className={a.is_leaf ? "" : "font-semibold"}>
        <td className={TD + " truncate"} style={{ paddingLeft: `${(a.level - minLv) * 10 + 14}px` }}>{a.name.replace(/^\((.*)\)$/, "$1")}</td>
        <td className={R}>{won(balanceOf(a, totM[a.code]))}</td><td className={R}>{won(balanceOf(a, totY[a.code]))}</td>
      </tr>
    )),
  ];
  return [
    ...block("Ⅰ. 수 익", rev, revM, revY),
    ...block("Ⅱ. 비 용", exp, expM, expY),
    <tr key="diff" className="font-bold" style={{ borderTop: `2px solid ${NAVY}` }}>
      <td className={TD}>Ⅲ. 수지 차액 (Ⅰ − Ⅱ)</td><td className={R}>{won(revM - expM)}</td><td className={R}>{won(revY - expY)}</td>
    </tr>,
  ];
}

// ---------- 설정 ----------
function BookSettings({ buildingId, settings, accounts, txns, onClose, onSaved }) {
  const [enabled, setEnabled] = useState(!!settings.enabled);
  const [parsed, setParsed] = useState(null); // 새로 올린 계정과목표
  const [fileName, setFileName] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState("");
  const fileRef = useRef(null);
  const list = parsed || accounts;
  const leaves = leafAccounts(list);
  const labels = Array.from(new Set(txns.map((t) => t.account_label).filter(Boolean)));
  const [bankMap, setBankMap] = useState(() => ({ ...(settings.bankMap || {}) }));
  const [cashCode, setCashCode] = useState(settings.cashCode || "");
  const [cardCode, setCardCode] = useState(settings.cardCode || "");

  // 기본값 채우기 (계정표가 바뀌면 다시)
  useEffect(() => {
    if (!list.length) return;
    const has = (c) => list.some((a) => a.code === c && a.is_leaf);
    setBankMap((bm) => {
      const n = { ...bm };
      labels.forEach((l) => { if (!has(n[l])) n[l] = suggestBankAccount(list, l); });
      return n;
    });
    const find = (names) => names.map((nm) => leafAccounts(list).find((a) => a.name === nm)?.code).find(Boolean) || "";
    setCashCode((c) => (has(c) ? c : find(["현금"])));
    setCardCode((c) => (has(c) ? c : find(["미지급금", "미지급비용"])));
  }, [parsed]); // eslint-disable-line react-hooks/exhaustive-deps

  async function readFile(f) {
    if (!f) return;
    setErr(""); setBusy("reading"); setFileName(f.name);
    try {
      const rows = await parseAccountsFile(f);
      if (rows.length < 5) throw new Error("계정이 너무 적게 읽혔어요. 파일을 확인해주세요.");
      setParsed(rows);
    } catch (e) { setErr(e.message || String(e)); setParsed(null); }
    setBusy("");
  }

  async function save() {
    if (enabled && !list.length) { setErr("복식부기를 쓰려면 계정과목표를 먼저 올려주세요."); return; }
    setBusy("saving"); setErr("");
    const supabase = createClient();
    if (parsed) {
      const { error: de } = await supabase.from("building_accounts").delete().eq("building_id", buildingId);
      if (de) { setErr(de.message); setBusy(""); return; }
      for (const part of chunk(parsed, 200)) {
        const { error } = await supabase.from("building_accounts").insert(part.map((a) => ({
          building_id: buildingId, code: a.code, name: a.name, side: a.side, level: a.level, parent_code: a.parent_code, is_leaf: a.is_leaf, sort: a.sort,
        })));
        if (error) { setErr(error.message); setBusy(""); return; }
      }
    }
    const { error } = await supabase.from("buildings").update({
      bookkeeping_enabled: enabled, bank_account_codes: bankMap, cash_account_code: cashCode, card_account_code: cardCode,
    }).eq("id", buildingId);
    setBusy("");
    if (error) { setErr(error.message); return; }
    onSaved();
  }

  const Pick = ({ value, onChange, filter }) => (
    <select value={value || ""} onChange={(e) => onChange(e.target.value)} className="text-sm">
      <option value="">선택</option>
      {leaves.filter(filter || (() => true)).map((a) => <option key={a.code} value={a.code}>{a.code} {a.name}</option>)}
    </select>
  );

  return (
    <div className="fixed inset-0 bg-black/50 flex items-end sm:items-center justify-center sm:p-4 z-50" onClick={() => !busy && onClose()}>
      <div className="bg-surface w-full sm:max-w-lg max-h-[92vh] overflow-y-auto p-5 rounded-t-3xl sm:rounded-3xl" onClick={(e) => e.stopPropagation()}>
        <div className="font-bold text-lg mb-1">회계 설정</div>
        <div className="text-xs text-inkDim mb-4">수입·지출 장부는 모든 건물에서 출력됩니다. 복식부기는 필요한 건물만 켜세요.</div>

        <label className="flex items-center gap-2 rounded-xl bg-surface2 p-3 mb-4 cursor-pointer">
          <input type="checkbox" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} />
          <span className="font-semibold text-sm">복식부기 사용</span>
          <span className="text-xs text-inkDim">분개장 · 계정별 원장 · 합계시산표 · 수지계산서</span>
        </label>

        {enabled && (
          <>
            <div className="text-sm font-semibold mb-1">계정과목표</div>
            <div className="text-xs text-inkDim mb-2">회계프로그램에서 출력한 계정과목 PDF, 또는 계정코드 · 계정명 · 차대구분 칸이 있는 엑셀</div>
            <div className="flex items-center gap-2 mb-2">
              <button className="btn-ghost text-xs" disabled={!!busy} onClick={() => fileRef.current?.click()}>
                {busy === "reading" ? "읽는 중…" : list.length ? "다른 파일로 바꾸기" : "파일 올리기"}
              </button>
              <span className="text-xs text-inkDim truncate">{fileName || (accounts.length ? `저장된 계정 ${accounts.length}개` : "아직 없음")}</span>
              <input ref={fileRef} type="file" accept=".pdf,.xls,.xlsx,.csv" className="hidden" onChange={(e) => { readFile(e.target.files?.[0]); e.target.value = ""; }} />
            </div>
            {list.length > 0 && (
              <div className="rounded-xl border max-h-56 overflow-y-auto text-xs mb-4" style={{ borderColor: "rgb(var(--border))" }}>
                <div className="sticky top-0 bg-surface2 px-3 py-1.5 font-semibold">
                  {parsed ? "새로 읽은 " : ""}계정 {list.length}개 · 전표용 {leaves.length}개
                </div>
                {list.map((a) => (
                  <div key={a.code} className={"flex gap-2 px-3 py-1 " + (a.is_leaf ? "" : "font-semibold")}>
                    <span className="w-12 text-inkDim">{a.code}</span>
                    <span style={{ paddingLeft: `${a.level * 0.75}rem` }} className="flex-1 truncate">{a.name}</span>
                    <span className="text-inkDim">{a.side}</span>
                  </div>
                ))}
              </div>
            )}

            {list.length > 0 && (
              <>
                <div className="text-sm font-semibold mb-2">통장 · 결제수단 계정</div>
                <div className="space-y-2 mb-4">
                  {labels.length === 0 && <div className="text-xs text-inkDim">통장 거래를 올리면 통장별로 예금 계정을 정할 수 있어요.</div>}
                  {labels.map((l) => (
                    <div key={l} className="grid grid-cols-[1fr_1.3fr] items-center gap-2">
                      <span className="text-sm truncate">🏦 {l}</span>
                      <Pick value={bankMap[l]} onChange={(v) => setBankMap({ ...bankMap, [l]: v })} filter={(a) => a.side === "차변" && Number(a.code) < 20000} />
                    </div>
                  ))}
                  <div className="grid grid-cols-[1fr_1.3fr] items-center gap-2">
                    <span className="text-sm">💵 현금 지출</span>
                    <Pick value={cashCode} onChange={setCashCode} />
                  </div>
                  <div className="grid grid-cols-[1fr_1.3fr] items-center gap-2">
                    <span className="text-sm">💳 카드 지출</span>
                    <Pick value={cardCode} onChange={setCardCode} />
                  </div>
                </div>
              </>
            )}
          </>
        )}

        {err && <div className="text-sm text-warn mb-3 whitespace-pre-line">{err}</div>}
        {parsed && accounts.length > 0 && (
          <div className="text-xs text-warn mb-3">저장하면 기존 계정과목표가 새 파일로 바뀝니다. 이미 지정한 계정코드는 그대로 남아요.</div>
        )}
        <div className="flex gap-2 justify-end">
          <button className="btn-ghost" disabled={!!busy} onClick={onClose}>닫기</button>
          <button className="btn" disabled={!!busy} onClick={save}>{busy === "saving" ? "저장 중…" : "저장"}</button>
        </div>
      </div>
    </div>
  );
}
