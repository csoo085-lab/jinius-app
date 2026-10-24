"use client";

// 고정지출: 매달 나가는 지출 목록 → 이번 달 통장 출금과 맞춰 지급 / 미지급 표시
import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabaseClient";
import { recurringStatus, recurringCandidates, periodLabel } from "@/lib/recurring";
import { leafAccounts } from "@/lib/accounts";
import { won, EXPENSE_CATEGORIES } from "@/components/ExpensesManager";

const md = (iso) => (iso ? `${Number(iso.slice(5, 7))}/${Number(iso.slice(8, 10))}` : "");
const TONE = {
  지급: "border-ok/40 text-ok bg-ok/5",
  미지급: "border-warn/40 text-warn bg-warn/5",
  예정: "text-inkDim",
};

export default function RecurringExpenses({ buildingId, month, items, txns, accounts = [], canManage, ready = true }) {
  const [open, setOpen] = useState(false);
  if (!ready) {
    return canManage ? (
      <div className="card mb-4 text-sm">
        고정지출 기능을 쓰려면 Supabase에서 <strong>fixed_expenses_units.sql</strong>을 한 번 실행해야 합니다.
      </div>
    ) : null;
  }
  const rows = recurringStatus(items, txns, month);
  const cnt = (s) => rows.filter((r) => r.status === s).length;
  const unpaidSum = rows.filter((r) => r.status === "미지급").reduce((s, r) => s + (Number(r.item.amount) || 0), 0);

  return (
    <div className="card mb-4">
      <div className="flex items-center justify-between gap-2 mb-3">
        <div>
          <div className="font-semibold">고정지출 <span className="text-inkDim font-normal text-sm">· {Number(month.slice(5))}월 출금 확인</span></div>
          {rows.length > 0 && (
            <div className="flex flex-wrap gap-1.5 mt-1.5">
              <span className={"tag " + TONE["지급"]}>지급 {cnt("지급")}</span>
              <span className={"tag " + (cnt("미지급") ? TONE["미지급"] : "text-inkDim")}>미지급 {cnt("미지급")}{unpaidSum ? ` · 약 ${won(unpaidSum)}원` : ""}</span>
              {cnt("예정") > 0 && <span className="tag">예정 {cnt("예정")}</span>}
            </div>
          )}
        </div>
        {canManage && <button className="btn-ghost text-xs" onClick={() => setOpen(true)}>{items.length ? "목록 관리" : "+ 고정지출 등록"}</button>}
      </div>

      {rows.length === 0 ? (
        <div className="text-sm text-inkDim">
          매달 나가는 지출(한전, 수도, 승강기, 위탁관리, 청소, 인터넷 등)을 등록하면, 통장 출금과 맞춰 지급·미지급을 자동으로 보여줍니다.
        </div>
      ) : (
        <div className="divide-y" style={{ borderColor: "rgb(var(--border))" }}>
          {rows.map(({ item, txns: list, paid, status }) => (
            <div key={item.id} className="py-2.5 flex items-center gap-3">
              <div className="flex-1 min-w-0">
                <div className="font-semibold text-sm truncate">
                  {item.name} <span className="text-xs text-inkDim font-normal">{periodLabel(item, month)}{item.pay_day ? ` · 매월 ${item.pay_day}일경` : ""}</span>
                </div>
                <div className="text-xs text-inkDim truncate">
                  {list.length
                    ? list.map((t) => `${md(t.txn_date)} ${t.description || ""}`).join(", ")
                    : item.keyword ? `출금 내용에 "${item.keyword}"` : ""}
                </div>
              </div>
              <div className="text-right shrink-0">
                <div className="text-sm font-semibold">{paid ? `${won(paid)}원` : item.amount ? <span className="text-inkDim">예상 {won(item.amount)}원</span> : ""}</div>
                {paid > 0 && item.amount && paid !== Number(item.amount) && (
                  <div className="text-[11px] text-inkDim">예상 {won(item.amount)}원과 다름</div>
                )}
              </div>
              <span className={"tag shrink-0 " + TONE[status]}>{status}</span>
            </div>
          ))}
        </div>
      )}

      {open && <RecurringEditor buildingId={buildingId} items={items} txns={txns} accounts={accounts} onClose={() => setOpen(false)} />}
    </div>
  );
}

const blank = () => ({ _new: Math.random().toString(36).slice(2), name: "", keyword: "", category: "기타", account_code: "", amount: "", period: "전월", pay_day: "", active: true });

function RecurringEditor({ buildingId, items, txns, accounts, onClose }) {
  const router = useRouter();
  const [list, setList] = useState(() => items.map((i) => ({ ...i, amount: i.amount ?? "", pay_day: i.pay_day ?? "" })));
  const [removed, setRemoved] = useState([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const leaves = leafAccounts(accounts);
  const candidates = recurringCandidates(list.map((i) => ({ ...i, id: i.id || i._new })), txns).slice(0, 12);

  const set = (k, field, v) => setList((l) => l.map((i) => ((i.id || i._new) === k ? { ...i, [field]: v } : i)));
  const add = (c) => setList((l) => [...l, { ...blank(), ...(c ? { name: c.name, keyword: c.name, amount: c.amount ?? "", pay_day: c.pay_day || "" } : {}) }]);
  const remove = (i) => {
    if (i.id) setRemoved((r) => [...r, i.id]);
    setList((l) => l.filter((x) => x !== i));
  };

  async function save() {
    const bad = list.find((i) => !i.name.trim());
    if (bad) { setErr("항목 이름을 모두 적어주세요."); return; }
    setBusy(true); setErr("");
    const supabase = createClient();
    const row = (i, idx) => ({
      building_id: buildingId, name: i.name.trim(), keyword: (i.keyword || "").trim(), category: i.category || "기타",
      account_code: i.account_code || "", amount: i.amount === "" ? null : Number(String(i.amount).replace(/[^\d]/g, "")) || null,
      period: i.period || "전월", pay_day: i.pay_day === "" ? null : Math.min(31, Math.max(1, Number(i.pay_day) || 1)),
      active: i.active !== false, sort: idx,
    });
    if (removed.length) {
      const { error } = await supabase.from("building_recurring_expenses").delete().in("id", removed);
      if (error) { setErr(error.message); setBusy(false); return; }
    }
    for (const [idx, i] of list.entries()) {
      const q = i.id
        ? supabase.from("building_recurring_expenses").update(row(i, idx)).eq("id", i.id)
        : supabase.from("building_recurring_expenses").insert(row(i, idx));
      const { error } = await q;
      if (error) { setErr(error.message); setBusy(false); return; }
    }
    setBusy(false);
    onClose();
    router.refresh();
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-end sm:items-center justify-center sm:p-4 z-50" onClick={() => !busy && onClose()}>
      <div className="bg-surface w-full sm:max-w-3xl max-h-[92vh] overflow-y-auto p-5 rounded-t-3xl sm:rounded-3xl" onClick={(e) => e.stopPropagation()}>
        <div className="font-bold text-lg mb-1">고정지출 목록</div>
        <div className="text-xs text-inkDim mb-4 leading-relaxed">
          <b className="text-ink">출금 내용</b>에는 통장에 찍히는 글자를 적어주세요 (예: 한국전력, 한전). 여러 개는 쉼표로 구분합니다.
          <b className="text-ink"> 귀속</b>은 10월에 내는 9월 사용분이면 &lsquo;전월&rsquo;입니다.
        </div>

        <div className="space-y-3">
          {list.map((i) => {
            const k = i.id || i._new;
            return (
              <div key={k} className={"rounded-2xl bg-surface2 p-3 " + (i.active === false ? "opacity-60" : "")}>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                  <Field label="항목 이름"><input value={i.name} placeholder="전기료" onChange={(e) => set(k, "name", e.target.value)} /></Field>
                  <Field label="출금 내용"><input value={i.keyword} placeholder="한국전력, 한전" onChange={(e) => set(k, "keyword", e.target.value)} /></Field>
                  <Field label="분류">
                    <select value={i.category} onChange={(e) => set(k, "category", e.target.value)}>
                      {EXPENSE_CATEGORIES.map((c) => <option key={c}>{c}</option>)}
                    </select>
                  </Field>
                  {leaves.length > 0 ? (
                    <Field label="계정과목">
                      <select value={i.account_code || ""} onChange={(e) => set(k, "account_code", e.target.value)}>
                        <option value="">선택</option>
                        {leaves.map((a) => <option key={a.code} value={a.code}>{a.code} {a.name}</option>)}
                      </select>
                    </Field>
                  ) : <div />}
                  <Field label="예상 금액 (매달 다르면 비움)">
                    <input inputMode="numeric" value={i.amount === "" || i.amount == null ? "" : won(Number(String(i.amount).replace(/[^\d]/g, "")))}
                      onChange={(e) => set(k, "amount", e.target.value.replace(/[^\d]/g, ""))} />
                  </Field>
                  <Field label="귀속">
                    <select value={i.period} onChange={(e) => set(k, "period", e.target.value)}>
                      <option value="전월">전월분</option>
                      <option value="당월">당월분</option>
                    </select>
                  </Field>
                  <Field label="보통 나가는 날">
                    <input inputMode="numeric" value={i.pay_day} placeholder="예: 25" onChange={(e) => set(k, "pay_day", e.target.value.replace(/[^\d]/g, "").slice(0, 2))} />
                  </Field>
                  <div className="flex items-end gap-3 pb-1">
                    <label className="flex items-center gap-1.5 text-xs">
                      <input type="checkbox" checked={i.active !== false} onChange={(e) => set(k, "active", e.target.checked)} /> 사용
                    </label>
                    <button className="text-xs text-warn underline ml-auto" onClick={() => remove(i)}>삭제</button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
        <button className="btn-ghost text-xs mt-3" onClick={() => add()}>+ 항목 추가</button>

        {candidates.length > 0 && (
          <div className="mt-5">
            <div className="text-sm font-semibold mb-1">통장에서 찾은 반복 출금</div>
            <div className="text-xs text-inkDim mb-2">여러 달에 걸쳐 같은 곳으로 나간 출금입니다. 눌러서 바로 추가하세요.</div>
            <div className="flex flex-wrap gap-1.5">
              {candidates.map((c) => (
                <button key={c.name} className="tag py-1 px-3 bg-surface hover:border-accent" onClick={() => add(c)}>
                  + {c.name} <span className="text-inkDim">{c.months}개월 · {c.amount ? `${won(c.amount)}원` : `평균 ${won(c.avg)}원`}</span>
                </button>
              ))}
            </div>
          </div>
        )}

        {err && <div className="text-sm text-warn mt-3">{err}</div>}
        <div className="flex gap-2 justify-end mt-5">
          <button className="btn-ghost" disabled={busy} onClick={onClose}>닫기</button>
          <button className="btn" disabled={busy} onClick={save}>{busy ? "저장 중…" : "저장"}</button>
        </div>
      </div>
    </div>
  );
}

function Field({ label, children }) {
  return (
    <label className="block">
      <span className="block text-[11px] text-inkDim mb-0.5">{label}</span>
      {children}
    </label>
  );
}
