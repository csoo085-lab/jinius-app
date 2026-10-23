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
      <div className="print:hidden">
      <div className="flex items-end justify-between gap-3 mb-5">
        {embedded ? (
          <div className="font-semibold text-sm text-inkDim">지출 등록·영수증</div>
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
            <div className="mt-1 text-xs">오른쪽 위 [+ 지출 등록]을 눌러 추가하세요.</div>
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

      </div>

      {/* 출력용 (화면에는 보이지 않음) */}
      {printUrls && (
        <PrintSheet
          buildingName={buildingName}
          month={month}
          expenses={expenses}
          receiptsByExpense={receiptsByExpense}
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
          canManage={canManage}
          onClose={() => setEditing(null)}
          onSaved={() => { setEditing(null); router.refresh(); }}
        />
      )}
    </div>
  );
}

const isImage = (name) => /\.(jpe?g|png|gif|webp|bmp|heic)$/i.test(name || "");

function PrintSheet({ buildingName, month, expenses, receiptsByExpense, byCategory, total, urls }) {
  const [y, m] = month.split("-");
  const rows = [...expenses].sort((a, b) =>
    a.expense_date === b.expense_date ? (a.created_at || "").localeCompare(b.created_at || "") : a.expense_date.localeCompare(b.expense_date));
  const withReceipts = rows.map((e, i) => ({ e, no: i + 1, rcs: receiptsByExpense[e.id] || [] })).filter((x) => x.rcs.length);
  const today = new Date().toLocaleDateString("sv-SE", { timeZone: "Asia/Seoul" }).replaceAll("-", ". ");
  const cell = "border border-black/40 px-2 py-1.5";

  return (
    <div id="expense-print" className="hidden print:block text-black text-[11pt]">
      <div className="text-center mb-5">
        <div className="text-[18pt] font-bold">{buildingName} 지출내역서</div>
        <div className="mt-1">{y}년 {Number(m)}월 (1일 ~ 말일)</div>
      </div>

      <table className="w-full border-collapse text-[10pt]">
        <thead>
          <tr className="bg-black/5">
            <th className={cell + " w-8"}>No</th>
            <th className={cell + " w-14"}>날짜</th>
            <th className={cell}>내용</th>
            <th className={cell + " w-20"}>분류</th>
            <th className={cell + " w-24"}>거래처</th>
            <th className={cell + " w-14"}>결제</th>
            <th className={cell + " w-20 text-right"}>금액(원)</th>
            <th className={cell + " w-10"}>증빙</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((e, i) => {
            const rc = (receiptsByExpense[e.id] || []).length;
            return (
              <tr key={e.id} className="break-inside-avoid">
                <td className={cell + " text-center"}>{i + 1}</td>
                <td className={cell + " text-center"}>{e.expense_date.slice(5).replace("-", "/")}</td>
                <td className={cell}>{e.description || "-"}</td>
                <td className={cell}>{e.category}</td>
                <td className={cell}>{e.vendor || "-"}</td>
                <td className={cell + " text-center"}>{e.payment_method || "-"}</td>
                <td className={cell + " text-right"}>{won(e.amount)}</td>
                <td className={cell + " text-center"}>{rc ? `${rc}장` : "없음"}</td>
              </tr>
            );
          })}
          <tr className="font-bold">
            <td className={cell + " text-center"} colSpan={6}>합 계</td>
            <td className={cell + " text-right"}>{won(total)}</td>
            <td className={cell}></td>
          </tr>
        </tbody>
      </table>

      <div className="mt-5 break-inside-avoid">
        <div className="font-bold mb-1.5">분류별 소계</div>
        <table className="border-collapse text-[10pt]">
          <tbody>
            {byCategory.map(([c, v]) => (
              <tr key={c}>
                <td className={cell + " w-40"}>{c}</td>
                <td className={cell + " w-32 text-right"}>{won(v)}원</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="mt-8 text-right text-[10pt]">
        <div>출력일: {today}</div>
        <div className="mt-1 font-semibold">지니어스 관리사무소 (문의 1551-9976)</div>
      </div>

      {/* 영수증 첨부 — 다음 장부터 */}
      {withReceipts.length > 0 && (
        <div className="break-before-page">
          <div className="text-[14pt] font-bold mb-4">증빙 첨부 ({y}년 {Number(m)}월)</div>
          {withReceipts.map(({ e, no, rcs }) => (
            <div key={e.id} className="mb-6">
              <div className="font-bold border-b border-black/40 pb-1 mb-2 break-after-avoid">
                No.{no} · {e.expense_date.slice(5).replace("-", "/")} · {e.description || e.category} · {won(e.amount)}원
              </div>
              <div className="flex flex-wrap gap-3">
                {rcs.map((r) =>
                  isImage(r.file_name) && urls[r.storage_path] ? (
                    <img key={r.id} src={urls[r.storage_path]} alt={r.file_name}
                      className="break-inside-avoid max-h-[115mm] max-w-full object-contain border border-black/20" />
                  ) : (
                    <div key={r.id} className="text-[10pt] border border-black/30 px-3 py-2">
                      📄 {r.file_name} (사진이 아닌 파일 — 앱에서 확인)
                    </div>
                  )
                )}
              </div>
            </div>
          ))}
        </div>
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

  // PC: 파일을 창 위로 끌어다 놓으면 증빙으로 추가
  const [dragOver, setDragOver] = useState(false);
  const dropProps = readOnly ? {} : {
    onDragOver: (e) => { e.preventDefault(); if (!dragOver) setDragOver(true); },
    onDragLeave: (e) => { if (!e.currentTarget.contains(e.relatedTarget)) setDragOver(false); },
    onDrop: (e) => {
      e.preventDefault();
      setDragOver(false);
      const dropped = Array.from(e.dataTransfer?.files || []);
      if (dropped.length) setNewFiles((prev) => [...prev, ...dropped]);
    },
  };

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
    <div className="fixed inset-0 bg-black/50 flex items-end sm:items-center justify-center sm:p-4 z-50" onClick={onClose}
      onDragOver={(e) => e.preventDefault()} onDrop={(e) => e.preventDefault()}>
      <div className="relative bg-surface w-full sm:max-w-md max-h-[92vh] overflow-y-auto p-5 rounded-t-3xl sm:rounded-3xl" onClick={(e) => e.stopPropagation()} {...dropProps}>
        {dragOver && (
          <div className="pointer-events-none absolute inset-2 z-10 rounded-2xl border-2 border-dashed border-accent bg-accent/10 flex items-center justify-center">
            <div className="bg-surface rounded-xl px-4 py-3 text-sm font-semibold text-accent shadow">여기에 놓으면 증빙으로 추가돼요</div>
          </div>
        )}
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
            {!readOnly && <div className="hidden md:block text-[11px] text-inkDim -mt-1 mb-1.5">PC에서는 파일(사진·PDF·엑셀)을 이 창에 끌어다 놓아도 돼요.</div>}
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
                    <input type="file" accept="image/*,application/pdf,.xls,.xlsx,.xlsm,.csv,.hwp,.hwpx,.doc,.docx" multiple className="hidden" onChange={addFiles} />
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
