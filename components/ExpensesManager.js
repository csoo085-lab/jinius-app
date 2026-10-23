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

const won = (n) => (Number(n) || 0).toLocaleString("ko-KR");
const todayKST = () => new Date().toLocaleDateString("sv-SE", { timeZone: "Asia/Seoul" });

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

export default function ExpensesManager({ buildingName, buildingId, month, expenses, receiptsByExpense, canManage, setupNeeded, embedded = false }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [editing, setEditing] = useState(null); // null | "new" | expense
  const [filter, setFilter] = useState("전체");

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
  const noReceipt = expenses.filter((e) => !(receiptsByExpense[e.id] || []).length).length;

  const shown = filter === "전체" ? expenses : expenses.filter((e) => e.category === filter);
  const byDate = [];
  shown.forEach((e) => {
    const last = byDate[byDate.length - 1];
    if (last && last.date === e.expense_date) last.items.push(e);
    else byDate.push({ date: e.expense_date, items: [e] });
  });

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
      <div className="flex items-end justify-between gap-3 mb-5">
        {embedded ? (
          <div className="font-semibold text-sm text-inkDim">지출 등록·영수증</div>
        ) : (
          <div className="min-w-0">
            <div className="text-sm text-inkDim font-medium truncate">{buildingName}</div>
            <h1 className="font-display font-bold text-xl">지출내역</h1>
          </div>
        )}
        {canManage && (
          <button className="btn shrink-0" onClick={() => setEditing("new")}>+ 지출 등록</button>
        )}
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
        <div className="text-xs text-inkDim mt-1">
          {expenses.length}건
          {canManage && noReceipt > 0 && <span className="text-warn font-semibold"> · 증빙 미첨부 {noReceipt}건</span>}
        </div>

        {byCategory.length > 0 && (
          <>
            <div className="flex h-2.5 rounded-full overflow-hidden bg-surface2 mt-4">
              {byCategory.map(([c, v]) => (
                <div key={c} style={{ width: `${(v / total) * 100}%`, backgroundColor: CATEGORY_COLORS[c] || "#94A3B8" }} title={c} />
              ))}
            </div>
            <div className="flex flex-wrap gap-1.5 mt-3">
              <button onClick={() => setFilter("전체")}
                className={"tag py-1 px-3 " + (filter === "전체" ? "bg-ink text-white border-ink" : "bg-surface")}>전체</button>
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

      {/* 날짜별 목록 */}
      {shown.length === 0 ? (
        <div className="card text-sm text-inkDim text-center py-10">
          {expenses.length === 0 ? "이번 달 등록된 지출이 없습니다." : "선택한 분류의 지출이 없습니다."}
          {canManage && expenses.length === 0 && (
            <div className="mt-3"><button className="btn" onClick={() => setEditing("new")}>+ 지출 등록</button></div>
          )}
        </div>
      ) : (
        <div className="card p-0 sm:p-0 md:p-0 overflow-hidden">
          {byDate.map((g) => (
            <div key={g.date}>
              <div className="px-4 md:px-6 pt-4 pb-1 text-xs font-semibold text-inkDim flex justify-between">
                <span>{dateLabel(g.date)}</span>
                <span>{won(g.items.reduce((s, e) => s + (Number(e.amount) || 0), 0))}원</span>
              </div>
              {g.items.map((e) => {
                const rc = (receiptsByExpense[e.id] || []).length;
                return (
                  <button key={e.id} onClick={() => setEditing(e)}
                    className="w-full flex items-center gap-3 px-4 md:px-6 py-3 text-left hover:bg-surface2 transition-colors">
                    <span className="w-10 h-10 rounded-xl shrink-0 flex items-center justify-center text-white text-xs font-bold"
                      style={{ backgroundColor: CATEGORY_COLORS[e.category] || "#94A3B8" }}>
                      {(e.category || "기").slice(0, 2)}
                    </span>
                    <span className="flex-1 min-w-0">
                      <span className="block font-semibold text-[15px] truncate">{e.description || e.category}</span>
                      <span className="block text-xs text-inkDim truncate">
                        {[e.vendor, e.payment_method].filter(Boolean).join(" · ") || e.category}
                      </span>
                    </span>
                    <span className="text-right shrink-0">
                      <span className="block font-bold text-[15px]">{won(e.amount)}원</span>
                      <span className={"block text-[11px] " + (rc ? "text-ok" : "text-warn")}>
                        {rc ? `📎 증빙 ${rc}` : "증빙 없음"}
                      </span>
                    </span>
                  </button>
                );
              })}
            </div>
          ))}
        </div>
      )}

      {editing && (
        <ExpenseModal
          key={editing === "new" ? "new" : editing.id}
          buildingId={buildingId}
          expense={editing === "new" ? null : editing}
          receipts={editing === "new" ? [] : receiptsByExpense[editing.id] || []}
          canManage={canManage}
          onClose={() => setEditing(null)}
          onSaved={() => { setEditing(null); router.refresh(); }}
        />
      )}
    </div>
  );
}

function ExpenseModal({ buildingId, expense, receipts, canManage, onClose, onSaved }) {
  const supabase = createClient();
  const isEdit = !!expense;
  const readOnly = !canManage;
  const [date, setDate] = useState(expense?.expense_date || todayKST());
  const [amount, setAmount] = useState(expense ? String(expense.amount) : "");
  const [category, setCategory] = useState(expense?.category || EXPENSE_CATEGORIES[0]);
  const [description, setDescription] = useState(expense?.description || "");
  const [vendor, setVendor] = useState(expense?.vendor || "");
  const [payment, setPayment] = useState(expense?.payment_method || "계좌이체");
  const [memo, setMemo] = useState(expense?.memo || "");
  const [newFiles, setNewFiles] = useState([]); // 새로 추가할 사진/파일
  const [previews, setPreviews] = useState([]);
  const [existing, setExisting] = useState(receipts);
  const [urls, setUrls] = useState({}); // 기존 증빙 보기용 임시 링크
  const [saving, setSaving] = useState(false);
  const [viewer, setViewer] = useState(null);

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

  // 새로 고른 사진 미리보기
  useEffect(() => {
    const list = newFiles.map((f) => (f.type.startsWith("image/") ? URL.createObjectURL(f) : null));
    setPreviews(list);
    return () => list.forEach((u) => u && URL.revokeObjectURL(u));
  }, [newFiles]);

  function addFiles(e) {
    const picked = Array.from(e.target.files || []);
    e.target.value = "";
    setNewFiles((prev) => [...prev, ...picked]);
  }

  async function removeExisting(r) {
    if (!confirm("이 증빙을 삭제할까요?")) return;
    await supabase.storage.from("attachments").remove([r.storage_path]);
    const { error } = await supabase.from("expense_receipts").delete().eq("id", r.id);
    if (error) { alert("삭제 실패: " + error.message); return; }
    setExisting((prev) => prev.filter((x) => x.id !== r.id));
  }

  async function save() {
    const amt = Number(String(amount).replace(/[^\d]/g, ""));
    if (!amt) { alert("금액을 입력해주세요."); return; }
    if (!description.trim()) { alert("지출 내용을 입력해주세요."); return; }
    setSaving(true);
    const payload = {
      expense_date: date, amount: amt, category,
      description: description.trim(), vendor: vendor.trim(), payment_method: payment, memo: memo.trim(),
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
    for (const original of newFiles) {
      const { file, storageName, displayName, size } = await prepareUpload(original, { maxSide: DOC_MAX_SIDE });
      const path = `expenses/${buildingId}/${expenseId}/${storageName}`;
      const { error: upErr } = await supabase.storage.from("attachments").upload(path, file);
      if (upErr) { alert(`"${displayName}" 업로드 실패: ` + upErr.message); continue; }
      await supabase.from("expense_receipts").insert({
        expense_id: expenseId, building_id: buildingId, file_name: displayName, storage_path: path, size_bytes: size,
      });
    }
    setSaving(false);
    onSaved();
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

  const isImage = (name) => /\.(jpe?g|png|webp|heic|gif)$/i.test(name || "");

  return (
    <div className="fixed inset-0 bg-black/50 flex items-end sm:items-center justify-center sm:p-4 z-50" onClick={onClose}>
      <div className="bg-surface w-full sm:max-w-md max-h-[92vh] overflow-y-auto p-5 rounded-t-3xl sm:rounded-3xl" onClick={(e) => e.stopPropagation()}>
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

          <label className="block text-xs font-semibold text-inkDim">내용
            <input className="mt-1" placeholder="예: 3층 복도 전등 교체" disabled={readOnly}
              value={description} onChange={(e) => setDescription(e.target.value)} />
          </label>

          <div className="grid grid-cols-2 gap-2">
            <label className="block text-xs font-semibold text-inkDim">날짜
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

          {/* 증빙 */}
          <div>
            <div className="text-xs font-semibold text-inkDim mb-1.5">증빙 (영수증·세금계산서·이체확인증)</div>
            <div className="grid grid-cols-3 gap-2">
              {existing.map((r) => (
                <div key={r.id} className="relative aspect-square rounded-xl bg-surface2 overflow-hidden">
                  {isImage(r.file_name) && urls[r.id] ? (
                    <button type="button" className="w-full h-full" onClick={() => setViewer(urls[r.id])}>
                      <img src={urls[r.id]} alt={r.file_name} className="w-full h-full object-cover" />
                    </button>
                  ) : (
                    <a href={urls[r.id] || "#"} target="_blank" rel="noopener noreferrer"
                      className="w-full h-full flex flex-col items-center justify-center text-[11px] text-inkDim p-2 text-center">
                      <span className="text-2xl">📄</span>
                      <span className="truncate w-full">{r.file_name}</span>
                    </a>
                  )}
                  {!readOnly && (
                    <button type="button" onClick={() => removeExisting(r)}
                      className="absolute top-1 right-1 w-6 h-6 rounded-full bg-black/60 text-white text-xs">✕</button>
                  )}
                </div>
              ))}
              {newFiles.map((f, i) => (
                <div key={i} className="relative aspect-square rounded-xl bg-surface2 overflow-hidden ring-2 ring-accent/50">
                  {previews[i] ? (
                    <img src={previews[i]} alt={f.name} className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full flex flex-col items-center justify-center text-[11px] text-inkDim p-2 text-center">
                      <span className="text-2xl">📄</span><span className="truncate w-full">{f.name}</span>
                    </div>
                  )}
                  <button type="button" onClick={() => setNewFiles((prev) => prev.filter((_, j) => j !== i))}
                    className="absolute top-1 right-1 w-6 h-6 rounded-full bg-black/60 text-white text-xs">✕</button>
                </div>
              ))}
              {!readOnly && (
                <>
                  <label className="aspect-square rounded-xl border-2 border-dashed border-borderBright flex flex-col items-center justify-center gap-1 text-inkDim cursor-pointer hover:border-accent hover:text-accent">
                    <span className="text-2xl">📷</span>
                    <span className="text-[11px] font-semibold">사진 찍기</span>
                    <input type="file" accept="image/*" capture="environment" className="hidden" onChange={addFiles} />
                  </label>
                  <label className="aspect-square rounded-xl border-2 border-dashed border-borderBright flex flex-col items-center justify-center gap-1 text-inkDim cursor-pointer hover:border-accent hover:text-accent">
                    <span className="text-2xl">🖼️</span>
                    <span className="text-[11px] font-semibold">파일 선택</span>
                    <input type="file" accept="image/*,application/pdf" multiple className="hidden" onChange={addFiles} />
                  </label>
                </>
              )}
            </div>
            {readOnly && existing.length === 0 && <div className="text-xs text-inkDim">첨부된 증빙이 없습니다.</div>}
          </div>
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
