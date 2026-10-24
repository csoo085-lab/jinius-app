"use client";

// 회계 시작 설정: 회계 시작일 · 통장 기초잔액 · 이전 관리 기간 미납 처리
// 장부 화면과 출력물 첫머리에 함께 보여줘서, 입주민이 장부를 볼 때 출발점이 분명하게 함
import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabaseClient";
import { leafAccounts } from "@/lib/accounts";

const won = (n) => Math.round(Number(n) || 0).toLocaleString("ko-KR");
const krDate = (iso) => (iso ? `${Number(iso.slice(0, 4))}년 ${Number(iso.slice(5, 7))}월 ${Number(iso.slice(8, 10))}일` : "");
const MODE = { memo: "장부 밖에서 따로 관리", books: "장부에 기초 미수관리비로 포함", none: "관리하지 않음" };

const firstChargeOf = (charges, opening) => [...(charges || [])]
  .filter((c) => !opening?.date || c.charge_date >= opening.date)
  .sort((a, b) => a.month.localeCompare(b.month))[0];
const arrearsTotal = (c) => (c?.units || []).reduce((s, u) => s + (Number(u.unpaid) || 0), 0);

// 출력물·화면에 쓰는 한 줄 설명
export function openingLines(opening, charges, accounts) {
  if (!opening?.date) return [];
  const byCode = Object.fromEntries((accounts || []).map((a) => [a.code, a]));
  const bal = Object.entries(opening.balances || {});
  const total = bal.reduce((s, [, v]) => s + (Number(v) || 0), 0);
  const fc = firstChargeOf(charges, opening);
  const arr = arrearsTotal(fc);
  const lines = [
    `회계 시작일 ${krDate(opening.date)} · 통장 기초잔액 ${bal.length ? bal.map(([k, v]) => `${k} ${won(v)}원`).join(", ") : "0원"}${bal.length > 1 ? ` (합계 ${won(total)}원)` : ""}`,
  ];
  if (arr && opening.arrearsMode) {
    const acc = byCode[opening.arrearsCode];
    lines.push(`이전 관리 기간 미납 ${won(arr)}원 (${Number(fc.month.slice(5))}월분 부과 파일 기준): ${MODE[opening.arrearsMode]}`
      + (opening.arrearsMode === "memo" ? ` — 입금되면 ${acc ? `${acc.code} ${acc.name}` : "별도 계정"}으로 처리` : ""));
  }
  if (opening.note) lines.push(opening.note);
  return lines;
}

export function OpeningSummary({ opening, charges, accounts, canManage, onEdit, ready = true }) {
  if (!ready) {
    return canManage ? <div className="card mb-4 text-sm">회계 시작 설정을 쓰려면 Supabase에서 <strong>book_opening.sql</strong>을 한 번 실행해야 합니다.</div> : null;
  }
  if (!opening?.date) {
    if (!canManage) return null;
    return (
      <div className="card mb-4 flex flex-wrap items-center gap-3">
        <div className="flex-1 text-sm">
          <div className="font-semibold">회계 시작 조건이 아직 없습니다</div>
          <div className="text-xs text-inkDim mt-0.5">언제부터, 얼마에서 시작하는지와 이전 미납을 어떻게 처리할지 먼저 정해두면 장부를 보는 누구나 출발점을 알 수 있어요.</div>
        </div>
        <button className="btn" onClick={onEdit}>🏁 회계 시작 설정</button>
      </div>
    );
  }
  const lines = openingLines(opening, charges, accounts);
  return (
    <div className="card mb-4">
      <div className="flex items-start justify-between gap-2">
        <div className="font-semibold">🏁 회계 기초</div>
        {canManage && <button className="btn-ghost text-xs" onClick={onEdit}>수정</button>}
      </div>
      <ul className="mt-2 space-y-1 text-sm">
        {lines.map((l, i) => <li key={i} className={i === 0 ? "" : "text-inkDim"}>· {l}</li>)}
      </ul>
    </div>
  );
}

export function OpeningEditor({ buildingId, opening, charges, txns, settings, accounts, onClose }) {
  const router = useRouter();
  const leaves = leafAccounts(accounts);
  const labels = Array.from(new Set([...Object.keys(settings?.bankMap || {}), ...(txns || []).map((t) => t.account_label).filter(Boolean), ...Object.keys(opening?.balances || {})]));
  const fc = firstChargeOf(charges, null);
  const firstTxn = (txns || []).reduce((m, t) => (!m || t.txn_date < m ? t.txn_date : m), "");
  const [date, setDate] = useState(opening?.date || (fc ? `${fc.month}-01` : firstTxn || ""));
  const [balances, setBalances] = useState(() => Object.fromEntries(labels.map((l) => [l, opening?.balances?.[l] ?? 0])));
  const [mode, setMode] = useState(opening?.arrearsMode || "memo");
  const [code, setCode] = useState(opening?.arrearsCode || leaves.find((a) => a.name === "가수금")?.code || "");
  const [note, setNote] = useState(opening?.note || "");
  const [busy, setBusy] = useState(false);
  const arr = arrearsTotal(firstChargeOf(charges, { date }));

  async function save() {
    if (!date) { alert("회계 시작일을 넣어주세요."); return; }
    setBusy(true);
    const value = { date, balances: Object.fromEntries(Object.entries(balances).map(([k, v]) => [k, Number(String(v).replace(/[^\d-]/g, "")) || 0])), arrearsMode: mode, arrearsCode: code, note: note.trim() };
    const { error } = await createClient().from("buildings").update({ bookkeeping_opening: value }).eq("id", buildingId);
    setBusy(false);
    if (error) { alert(/bookkeeping_opening/.test(error.message) ? "Supabase에서 book_opening.sql을 먼저 실행해주세요." : error.message); return; }
    onClose();
    router.refresh();
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-end sm:items-center justify-center sm:p-4 z-50" onClick={() => !busy && onClose()}>
      <div className="bg-surface w-full sm:max-w-lg max-h-[92vh] overflow-y-auto p-5 rounded-t-3xl sm:rounded-3xl text-sm" onClick={(e) => e.stopPropagation()}>
        <div className="font-bold text-lg mb-1">🏁 회계 시작 설정</div>
        <div className="text-xs text-inkDim mb-4">장부가 언제, 얼마에서 시작하는지 정합니다. 장부 화면과 출력물 첫머리에 함께 표시됩니다.</div>

        <label className="block mb-3">
          <span className="block text-xs font-semibold mb-1">1. 회계 시작일</span>
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          <span className="block text-[11px] text-inkDim mt-1">이 날짜 이전의 통장 거래·지출·부과는 장부에 넣지 않습니다. (예: 관리단이 관리를 시작한 달의 1일)</span>
        </label>

        <div className="mb-3">
          <div className="text-xs font-semibold mb-1">2. 시작일의 통장 잔액</div>
          {labels.length === 0 && <div className="text-xs text-inkDim">통장 거래를 올리면 통장별로 넣을 수 있어요. 새로 만든 통장이면 0원입니다.</div>}
          {labels.map((l) => (
            <div key={l} className="grid grid-cols-[1fr_9rem] items-center gap-2 mb-1">
              <span className="truncate">🏦 {l}</span>
              <input inputMode="numeric" className="text-right" value={balances[l] === "" ? "" : won(balances[l])}
                onChange={(e) => setBalances({ ...balances, [l]: e.target.value.replace(/[^\d-]/g, "") })} />
            </div>
          ))}
          <span className="block text-[11px] text-inkDim">새로 만든 통장은 0원. 이전부터 쓰던 통장이면 시작일 전날의 잔액을 넣으세요.</span>
        </div>

        <div className="mb-3">
          <div className="text-xs font-semibold mb-1">3. 이전 관리 기간의 미납 {arr ? <span className="text-warn">{won(arr)}원</span> : <span className="text-inkDim font-normal">(첫 부과 파일을 올리면 금액이 보여요)</span>}</div>
          {[["memo", "장부 밖에서 따로 관리 (권장)", "관리단 장부는 0에서 시작합니다. 호실별 미납에는 남기고, 입금되면 아래 계정으로 따로 잡아 관리비 수입과 섞이지 않게 합니다."],
            ["books", "장부에 기초 미수관리비로 포함", "관리단이 이전 미납까지 넘겨받아 장부에 함께 잡을 때"],
            ["none", "관리하지 않음", "이전 미납을 앱에서 다루지 않을 때"]].map(([k, label, help]) => (
            <label key={k} className="flex items-start gap-2 mb-1.5 cursor-pointer">
              <input type="radio" className="mt-1" checked={mode === k} onChange={() => setMode(k)} />
              <span>{label}<span className="block text-xs text-inkDim">{help}</span></span>
            </label>
          ))}
          {mode === "memo" && leaves.length > 0 && (
            <label className="flex items-center gap-2 mt-1 text-xs">
              <span className="shrink-0 text-inkDim">이전 미납이 입금되면</span>
              <select className="text-xs py-1" value={code} onChange={(e) => setCode(e.target.value)}>
                <option value="">선택</option>
                {leaves.map((a) => <option key={a.code} value={a.code}>{a.code} {a.name}</option>)}
              </select>
            </label>
          )}
        </div>

        <label className="block mb-2">
          <span className="block text-xs font-semibold mb-1">4. 설명 (선택)</span>
          <textarea rows={2} value={note} placeholder="예: 2025년 8월 관리단 설립. 이전 관리업체 시기 미납은 별도 관리하며 회수 시 가수금으로 처리함."
            onChange={(e) => setNote(e.target.value)} />
        </label>

        <div className="flex gap-2 justify-end mt-4">
          <button className="btn-ghost" disabled={busy} onClick={onClose}>닫기</button>
          <button className="btn" disabled={busy} onClick={save}>{busy ? "저장 중…" : "저장"}</button>
        </div>
      </div>
    </div>
  );
}
