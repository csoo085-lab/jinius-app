"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabaseClient";
import { parseBankFile, dedupKey } from "@/lib/bankParser";
import { ExpenseModal, won, shiftMonth, dateLabel, evidenceOk } from "@/components/ExpensesManager";

const MATCH_DAYS = 7; // 출금일과 지출일이 이 날짜 안이면 같은 건으로 자동 연결

// 저장된 거래시각(UTC)을 한국 시간 "HH:MM"으로 표시
const kstTime = (iso) =>
  new Date(iso).toLocaleTimeString("en-GB", { timeZone: "Asia/Seoul", hour: "2-digit", minute: "2-digit", hour12: false });

const dayDiff = (a, b) => Math.abs((new Date(a + "T00:00:00") - new Date(b + "T00:00:00")) / 86400000);

// 증빙 없는 출금 ↔ 연결 안 된 지출을 금액·날짜로 자동 연결할 목록 만들기
function findMatches(txns, expenses, linkedExpenseIds) {
  const free = expenses.filter((e) => !linkedExpenseIds.has(e.id));
  const used = new Set();
  const pairs = [];
  txns
    .filter((t) => t.direction === "출금" && !t.expense_id && !t.receipt_exempt)
    .forEach((t) => {
      let best = null;
      free.forEach((e) => {
        if (used.has(e.id) || Number(e.amount) !== Number(t.amount)) return;
        const d = dayDiff(e.expense_date, t.txn_date);
        if (d <= MATCH_DAYS && (!best || d < best.d)) best = { e, d };
      });
      if (best) { used.add(best.e.id); pairs.push({ txnId: t.id, expenseId: best.e.id }); }
    });
  return pairs;
}

export default function BankTransactionsManager({
  buildingId, month, txns, expenses, receiptsByExpense, linkedExpenseIds, canManage, setupNeeded, thresholds,
}) {
  const supabase = createClient();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [filter, setFilter] = useState("전체");
  const [dragOver, setDragOver] = useState(false);
  const [busy, setBusy] = useState("");
  const [preview, setPreview] = useState(null); // 올리기 전 확인 창
  const [editing, setEditing] = useState(null); // { txn, expense? } 지출 등록/보기 창
  const [linking, setLinking] = useState(null); // 기존 지출 연결 창
  const fileRef = useRef(null);
  const autoRan = useRef(false);

  const expenseById = useMemo(() => Object.fromEntries(expenses.map((e) => [e.id, e])), [expenses]);
  const linkedSet = useMemo(() => new Set(linkedExpenseIds), [linkedExpenseIds]);
  const accounts = useMemo(() => Array.from(new Set(txns.map((t) => t.account_label).filter(Boolean))), [txns]);

  function goMonth(next) {
    const params = new URLSearchParams(searchParams.toString());
    params.set("month", next);
    router.push(`${pathname}?${params.toString()}`);
  }

  // 자동 연결 (관리자·담당자만): 금액이 같고 날짜가 7일 안인 지출을 찾아 연결
  useEffect(() => {
    if (!canManage || setupNeeded || autoRan.current) return;
    const pairs = findMatches(txns, expenses, linkedSet);
    if (!pairs.length) return;
    autoRan.current = true;
    (async () => {
      for (const p of pairs) {
        await supabase.from("bank_transactions").update({ expense_id: p.expenseId }).eq("id", p.txnId);
      }
      autoRan.current = false;
      router.refresh();
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [txns, expenses]);

  // ---------- 파일 올리기 ----------
  async function handleFile(file) {
    if (!file) return;
    setBusy("파일 읽는 중…");
    try {
      const parsed = await parseBankFile(file);
      const label = [parsed.bank, parsed.account].filter(Boolean).join(" ") || accounts[0] || "통장";
      setPreview({ file, parsed, label, keepFile: true });
    } catch (e) {
      alert(e.message);
    }
    setBusy("");
  }

  async function confirmImport() {
    const { file, parsed, label, keepFile } = preview;
    const accountLabel = label.trim() || "통장";
    setBusy("저장 중…");
    const rows = parsed.transactions.map((t) => ({
      ...t, building_id: buildingId, account_label: accountLabel, dedup_key: dedupKey(accountLabel, t), source_file: file.name,
    }));
    let inserted = 0;
    for (let i = 0; i < rows.length; i += 200) {
      const chunk = rows.slice(i, i + 200);
      const { data, error } = await supabase
        .from("bank_transactions")
        .upsert(chunk, { onConflict: "building_id,dedup_key", ignoreDuplicates: true })
        .select("id");
      if (error) { setBusy(""); alert("저장 실패: " + error.message); return; }
      inserted += (data || []).length;
    }

    // 원본 파일도 [통장 파일] 탭에 보관
    if (keepFile) {
      const ext = (file.name.split(".").pop() || "xlsx").toLowerCase().replace(/[^a-z0-9]/g, "");
      const path = `bankstatement/${buildingId}/${Date.now()}_${Math.random().toString(36).slice(2, 8)}.${ext}`;
      const { error: upErr } = await supabase.storage.from("building_docs").upload(path, file);
      if (!upErr) {
        const dates = parsed.transactions.map((t) => t.txn_date);
        await supabase.from("bank_statements").insert({
          building_id: buildingId,
          period_start: parsed.periodStart || dates[0],
          period_end: parsed.periodEnd || dates[dates.length - 1],
          file_name: file.name,
          storage_path: path,
        });
      }
    }

    setBusy("");
    setPreview(null);
    const skipped = rows.length - inserted;
    alert(`${inserted}건을 저장했습니다.` + (skipped ? ` (이미 있던 ${skipped}건은 건너뜀)` : ""));
    const firstMonth = (parsed.periodStart || parsed.transactions[0].txn_date).slice(0, 7);
    if (firstMonth !== month) goMonth(firstMonth);
    else router.refresh();
  }

  // ---------- 출금 한 건 처리 ----------
  async function setExempt(t, value) {
    const { error } = await supabase.from("bank_transactions").update({ receipt_exempt: value, expense_id: null }).eq("id", t.id);
    if (error) { alert("저장 실패: " + error.message); return; }
    router.refresh();
  }
  async function linkExpense(t, expenseId) {
    const { error } = await supabase.from("bank_transactions").update({ expense_id: expenseId, receipt_exempt: false }).eq("id", t.id);
    if (error) { alert("저장 실패: " + error.message); return; }
    setLinking(null);
    router.refresh();
  }
  async function unlink(t) {
    if (!confirm("이 출금과 지출의 연결을 해제할까요? (지출내역은 지워지지 않습니다)")) return;
    await linkExpense(t, null);
  }
  async function deleteMonth() {
    if (!confirm(`${Number(month.slice(5))}월 통장 거래 ${txns.length}건을 모두 삭제할까요?\n(지출내역과 통장 파일은 지워지지 않습니다)`)) return;
    const ids = txns.map((t) => t.id);
    const { error } = await supabase.from("bank_transactions").delete().in("id", ids);
    if (error) { alert("삭제 실패: " + error.message); return; }
    router.refresh();
  }

  // ---------- 계산 ----------
  const inSum = txns.filter((t) => t.direction === "입금").reduce((s, t) => s + Number(t.amount), 0);
  const outSum = txns.filter((t) => t.direction === "출금").reduce((s, t) => s + Number(t.amount), 0);
  const status = (t) => (t.direction === "입금" ? "입금" : t.expense_id ? "완료" : t.receipt_exempt ? "불필요" : "필요");
  const needList = txns.filter((t) => status(t) === "필요");
  const shown = txns.filter((t) =>
    filter === "전체" ? true : filter === "증빙 필요" ? status(t) === "필요" : t.direction === filter);
  const byDate = [];
  [...shown].reverse().forEach((t) => {
    const last = byDate[byDate.length - 1];
    if (last && last.date === t.txn_date) last.items.push(t);
    else byDate.push({ date: t.txn_date, items: [t] });
  });
  const [y, m] = month.split("-");

  if (setupNeeded) {
    return (
      <div className="card text-sm">
        거래내역 기능을 쓰려면 Supabase에서 <strong>bank_transactions.sql</strong>을 한 번 실행해야 합니다.
      </div>
    );
  }

  const dropProps = canManage ? {
    onDragOver: (e) => { e.preventDefault(); if (!dragOver) setDragOver(true); },
    onDragLeave: (e) => { if (!e.currentTarget.contains(e.relatedTarget)) setDragOver(false); },
    onDrop: (e) => { e.preventDefault(); setDragOver(false); handleFile(e.dataTransfer?.files?.[0]); },
  } : {};

  return (
    <div {...dropProps} className="relative">
      {dragOver && (
        <div className="pointer-events-none fixed inset-0 z-40 bg-accent/10 border-4 border-dashed border-accent flex items-center justify-center">
          <div className="bg-surface rounded-2xl px-6 py-4 font-semibold text-accent shadow-lg">여기에 놓으면 통장 거래를 불러와요</div>
        </div>
      )}

      {/* 올리기 */}
      {canManage && (
        <label className={"block card mb-4 border-2 border-dashed text-center cursor-pointer transition-colors " +
          (dragOver ? "border-accent" : "border-borderBright hover:border-accent")}>
          <div className="text-2xl">📥</div>
          <div className="text-sm mt-1">
            {busy || <>통장 입출금내역 엑셀을 <b>끌어다 놓거나</b> 눌러서 선택하세요</>}
          </div>
          <div className="text-[11px] text-inkDim mt-1">카카오뱅크·부산은행 등 은행 원본 엑셀(xlsx·xls·csv). 비밀번호가 없는 파일이어야 해요. 같은 파일을 다시 올려도 중복 저장되지 않아요.</div>
          <input ref={fileRef} type="file" accept=".xlsx,.xls,.xlsm,.csv" className="hidden"
            onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; handleFile(f); }} />
        </label>
      )}

      {/* 월 + 요약 */}
      <div className="card mb-4">
        <div className="flex items-center justify-between mb-4">
          <button className="btn-ghost text-xs" onClick={() => goMonth(shiftMonth(month, -1))}>‹ 이전</button>
          <div className="font-bold text-base">{y}년 {Number(m)}월</div>
          <button className="btn-ghost text-xs" onClick={() => goMonth(shiftMonth(month, 1))}>다음 ›</button>
        </div>
        <div className="grid grid-cols-3 gap-2 text-center">
          <div className="rounded-xl bg-surface2 py-3">
            <div className="text-xs text-inkDim">입금</div>
            <div className="font-bold text-accent text-[15px] md:text-lg">{won(inSum)}</div>
          </div>
          <div className="rounded-xl bg-surface2 py-3">
            <div className="text-xs text-inkDim">출금</div>
            <div className="font-bold text-[15px] md:text-lg">{won(outSum)}</div>
          </div>
          <button onClick={() => setFilter(filter === "증빙 필요" ? "전체" : "증빙 필요")}
            className={"rounded-xl py-3 " + (needList.length ? "bg-warn/10" : "bg-surface2")}>
            <div className="text-xs text-inkDim">증빙 필요</div>
            <div className={"font-bold text-[15px] md:text-lg " + (needList.length ? "text-warn" : "text-ok")}>
              {needList.length ? `${needList.length}건` : "없음 ✓"}
            </div>
          </button>
        </div>
        <div className="flex flex-wrap gap-1.5 mt-4">
          {["전체", "입금", "출금", "증빙 필요"].map((f) => (
            <button key={f} onClick={() => setFilter(f)}
              className={"tag py-1 px-3 " + (filter === f ? "bg-ink text-white border-ink" : "bg-surface")}>{f}</button>
          ))}
          {accounts.length > 0 && <span className="text-[11px] text-inkDim self-center ml-auto">{accounts.join(" · ")}</span>}
        </div>
      </div>

      {/* 목록 */}
      {shown.length === 0 ? (
        <div className="card text-sm text-inkDim text-center py-10">
          {txns.length === 0 ? "이번 달 불러온 통장 거래가 없습니다." : "해당하는 거래가 없습니다."}
        </div>
      ) : (
        <div className="card p-0 sm:p-0 md:p-0 overflow-hidden">
          {byDate.map((g) => (
            <div key={g.date}>
              <div className="px-4 md:px-6 pt-4 pb-1 text-xs font-semibold text-inkDim">{dateLabel(g.date)}</div>
              {g.items.map((t) => {
                const st = status(t);
                const exp = t.expense_id ? expenseById[t.expense_id] : null;
                return (
                  <div key={t.id} className="px-4 md:px-6 py-3 border-b border-border last:border-0">
                    <div className="flex items-start gap-3">
                      <span className={"w-9 h-9 rounded-xl shrink-0 flex items-center justify-center text-xs font-bold " +
                        (t.direction === "입금" ? "bg-accent/10 text-accent" : "bg-surface2 text-ink")}>
                        {t.direction === "입금" ? "입" : "출"}
                      </span>
                      <div className="flex-1 min-w-0">
                        <div className="font-semibold text-[15px] truncate">{t.description || t.txn_type || t.direction}</div>
                        <div className="text-xs text-inkDim truncate">
                          {kstTime(t.txn_at)}{t.txn_type ? ` · ${t.txn_type}` : ""}{accounts.length > 1 ? ` · ${t.account_label}` : ""}
                        </div>
                      </div>
                      <div className="text-right shrink-0">
                        <div className={"font-bold text-[15px] " + (t.direction === "입금" ? "text-accent" : "")}>
                          {t.direction === "입금" ? "+" : "−"}{won(t.amount)}원
                        </div>
                        {t.balance !== null && <div className="text-[11px] text-inkDim">잔액 {won(t.balance)}</div>}
                      </div>
                    </div>

                    {t.direction === "출금" && (
                      <div className="mt-2 ml-12 flex flex-wrap items-center gap-1.5">
                        {st === "완료" && (
                          <>
                            <button onClick={() => exp && setEditing({ txn: t, expense: exp })}
                              className="tag py-1 px-2.5 border-ok/40 text-ok bg-ok/5">
                              ✓ 지출 연결{exp ? ` · ${exp.description || exp.category}` : ""}
                              {exp && (receiptsByExpense[exp.id] || []).length ? ` 📎${receiptsByExpense[exp.id].length}` : ""}
                            </button>
                            {exp && (evidenceOk(receiptsByExpense[exp.id])
                              ? <span className="text-[11px] font-semibold text-accent">증빙 정상</span>
                              : <span className="text-[11px] font-semibold text-warn">증빙 미흡</span>)}
                            {canManage && <button onClick={() => unlink(t)} className="text-[11px] text-inkDim underline">연결 해제</button>}
                          </>
                        )}
                        {st === "불필요" && (
                          <>
                            <span className="tag py-1 px-2.5 text-inkDim">증빙 불필요</span>
                            {canManage && <button onClick={() => setExempt(t, false)} className="text-[11px] text-inkDim underline">되돌리기</button>}
                          </>
                        )}
                        {st === "필요" && (
                          <>
                            <span className="tag py-1 px-2.5 border-warn/40 text-warn bg-warn/5">증빙 필요</span>
                            {canManage && (
                              <>
                                <button className="btn text-xs" onClick={() => setEditing({ txn: t })}>지출로 등록</button>
                                <button className="btn-ghost text-xs" onClick={() => setLinking(t)}>기존 지출 연결</button>
                                <button className="text-[11px] text-inkDim underline" onClick={() => setExempt(t, true)}>증빙 불필요</button>
                              </>
                            )}
                          </>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      )}

      {canManage && txns.length > 0 && (
        <div className="text-right mt-3">
          <button onClick={deleteMonth} className="text-xs text-inkDim underline">이 달 거래 전체 삭제</button>
        </div>
      )}

      {/* 올리기 전 확인 */}
      {preview && (
        <ImportPreview
          preview={preview}
          setPreview={setPreview}
          busy={busy}
          onConfirm={confirmImport}
        />
      )}

      {/* 기존 지출 연결 */}
      {linking && (
        <LinkPicker
          txn={linking}
          expenses={expenses.filter((e) => !linkedSet.has(e.id))}
          onPick={(id) => linkExpense(linking, id)}
          onClose={() => setLinking(null)}
        />
      )}

      {/* 지출 등록 / 보기 */}
      {editing && (
        <ExpenseModal
          key={editing.expense?.id || editing.txn.id}
          buildingId={buildingId}
          expense={editing.expense || null}
          receipts={editing.expense ? receiptsByExpense[editing.expense.id] || [] : []}
          txn={editing.expense ? editing.txn : null}
          thresholds={thresholds}
          canManage={canManage}
          prefill={editing.expense ? null : {
            expense_date: editing.txn.txn_date,
            amount: editing.txn.amount,
            description: editing.txn.description,
            vendor: editing.txn.description,
            payment_method: "계좌이체",
          }}
          onClose={() => setEditing(null)}
          onSaved={async (expenseId) => {
            if (!editing.expense && expenseId) {
              await supabase.from("bank_transactions").update({ expense_id: expenseId, receipt_exempt: false }).eq("id", editing.txn.id);
            }
            setEditing(null);
            router.refresh();
          }}
        />
      )}
    </div>
  );
}

function ImportPreview({ preview, setPreview, busy, onConfirm }) {
  const { parsed, label, keepFile, file } = preview;
  const t = parsed.transactions;
  const inS = t.filter((x) => x.direction === "입금").reduce((s, x) => s + x.amount, 0);
  const outS = t.filter((x) => x.direction === "출금").reduce((s, x) => s + x.amount, 0);
  const first = t[0].txn_date, last = t[t.length - 1].txn_date;
  return (
    <div className="fixed inset-0 bg-black/50 flex items-end sm:items-center justify-center sm:p-4 z-50" onClick={() => !busy && setPreview(null)}>
      <div className="bg-surface w-full sm:max-w-lg max-h-[92vh] overflow-y-auto p-5 rounded-t-3xl sm:rounded-3xl" onClick={(e) => e.stopPropagation()}>
        <div className="font-bold text-lg mb-1">통장 거래 불러오기</div>
        <div className="text-xs text-inkDim mb-4 break-all">{file.name}</div>

        <label className="block text-xs font-semibold text-inkDim mb-3">통장 이름
          <input value={label} onChange={(e) => setPreview({ ...preview, label: e.target.value })} className="mt-1" />
          <span className="block font-normal mt-1">통장이 여러 개인 건물은 구분되게 적어주세요. (예: 카카오뱅크 8652, 장충금통장)</span>
        </label>

        <div className="grid grid-cols-3 gap-2 text-center mb-3">
          <div className="rounded-xl bg-surface2 py-2.5"><div className="text-[11px] text-inkDim">거래</div><div className="font-bold">{t.length}건</div></div>
          <div className="rounded-xl bg-surface2 py-2.5"><div className="text-[11px] text-inkDim">입금</div><div className="font-bold text-accent">{won(inS)}</div></div>
          <div className="rounded-xl bg-surface2 py-2.5"><div className="text-[11px] text-inkDim">출금</div><div className="font-bold">{won(outS)}</div></div>
        </div>
        <div className="text-xs text-inkDim mb-3">
          기간: {parsed.periodStart || first} ~ {parsed.periodEnd || last}
        </div>

        <div className="rounded-xl border border-border max-h-56 overflow-y-auto text-xs mb-3">
          <table className="w-full">
            <tbody>
              {t.map((x, i) => (
                <tr key={i} className="border-b border-border last:border-0">
                  <td className="px-2 py-1.5 text-inkDim whitespace-nowrap">{x.txn_date.slice(5).replace("-", "/")}</td>
                  <td className="px-2 py-1.5 truncate max-w-[10rem]">{x.description || x.txn_type}</td>
                  <td className={"px-2 py-1.5 text-right whitespace-nowrap font-semibold " + (x.direction === "입금" ? "text-accent" : "")}>
                    {x.direction === "입금" ? "+" : "−"}{won(x.amount)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <label className="flex items-center gap-2 text-sm mb-5">
          <input type="checkbox" checked={keepFile} onChange={(e) => setPreview({ ...preview, keepFile: e.target.checked })} />
          원본 파일도 [통장 파일]에 보관
        </label>

        <div className="flex justify-end gap-2">
          <button className="btn-ghost" disabled={!!busy} onClick={() => setPreview(null)}>취소</button>
          <button className="btn" disabled={!!busy} onClick={onConfirm}>{busy || `${t.length}건 저장`}</button>
        </div>
      </div>
    </div>
  );
}

function LinkPicker({ txn, expenses, onPick, onClose }) {
  const sorted = [...expenses].sort((a, b) => {
    const sa = (Number(a.amount) === Number(txn.amount) ? 0 : 1) * 1000 + dayDiff(a.expense_date, txn.txn_date);
    const sb = (Number(b.amount) === Number(txn.amount) ? 0 : 1) * 1000 + dayDiff(b.expense_date, txn.txn_date);
    return sa - sb;
  });
  return (
    <div className="fixed inset-0 bg-black/50 flex items-end sm:items-center justify-center sm:p-4 z-50" onClick={onClose}>
      <div className="bg-surface w-full sm:max-w-md max-h-[85vh] overflow-y-auto p-5 rounded-t-3xl sm:rounded-3xl" onClick={(e) => e.stopPropagation()}>
        <div className="font-bold text-lg">기존 지출 연결</div>
        <div className="text-sm text-inkDim mb-4">
          {txn.txn_date.slice(5).replace("-", "/")} · {txn.description} · <b className="text-ink">{won(txn.amount)}원</b>
        </div>
        {sorted.length === 0 ? (
          <div className="text-sm text-inkDim py-6 text-center">연결할 수 있는 지출이 없습니다.<br />[지출로 등록]을 눌러 새로 만들어주세요.</div>
        ) : (
          <div className="flex flex-col gap-1.5">
            {sorted.map((e) => {
              const same = Number(e.amount) === Number(txn.amount);
              return (
                <button key={e.id} onClick={() => onPick(e.id)}
                  className={"flex items-center justify-between gap-3 text-left rounded-xl px-3 py-2.5 border " +
                    (same ? "border-accent/50 bg-accent/5" : "border-border hover:bg-surface2")}>
                  <span className="min-w-0">
                    <span className="block font-semibold text-sm truncate">{e.description || e.category}</span>
                    <span className="block text-xs text-inkDim">{e.expense_date.slice(5).replace("-", "/")} · {e.vendor || e.category}</span>
                  </span>
                  <span className="text-right shrink-0">
                    <span className="block font-bold text-sm">{won(e.amount)}원</span>
                    {same && <span className="block text-[11px] text-accent">금액 같음</span>}
                  </span>
                </button>
              );
            })}
          </div>
        )}
        <div className="text-right mt-4"><button className="btn-ghost" onClick={onClose}>닫기</button></div>
      </div>
    </div>
  );
}
