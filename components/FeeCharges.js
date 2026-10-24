"use client";

// 관리비 부과 내역 → 미수관리비 · 호실별 미납
// - 회계프로그램 "세대별 관리비 조정집계표" 엑셀을 올리면 항목별로 부과를 장부에 잡음
// - 호실이 지정된(또는 입금자명에 호수가 있는) 입금과 맞춰 호실별 미납을 계산
import { useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabaseClient";
import { parseFeeSheet } from "@/lib/feeSheetParser";
import { leafAccounts, suggestFeeItemAccount, openingModeOf } from "@/lib/accounts";

const won = (n) => Math.round(Number(n) || 0).toLocaleString("ko-KR");
const lastDay = (month) => { const [y, m] = month.split("-").map(Number); return `${month}-${String(new Date(y, m, 0).getDate()).padStart(2, "0")}`; };
const normHo = (s) => String(s ?? "").replace(/\s/g, "").replace(/호$/, "").replace(/^0+/, "");

// 입금 → 호실 (지정된 호실 우선, 없으면 입금자명의 "○○○호")
export function depositHo(t, unitsById) {
  const u = t.unit_id && unitsById[t.unit_id];
  if (u) return normHo(String(u.ho).match(/\d{3,4}(?:-\d+)?/)?.[0] || u.ho);
  const m = [...String(t.description || "").matchAll(/(\d{3,4}(?:-\d+)?)\s*호/g)].map((x) => normHo(x[1]));
  return m.length === 1 ? m[0] : "";
}

// 고친 엑셀 검사: 세대별 당월소계와 항목 합이 10원 넘게 다르면 (항목만 고치고 소계를 안 고친 경우 등)
export function checkSheet(parsed) {
  return (parsed?.units || []).map((u) => {
    const sum = Object.values(u.values || {}).reduce((s, v) => s + (Number(v) || 0), 0);
    return { ho: u.ho, charge: Number(u.charge) || 0, sum, diff: (Number(u.charge) || 0) - sum };
  }).filter((x) => Math.abs(x.diff) >= 10);
}

// 이전에 올린 같은 달 부과와 비교: 바뀐 세대·항목
export function diffCharge(prev, parsed) {
  if (!prev) return [];
  const before = Object.fromEntries((prev.units || []).map((u) => [String(u.ho), u]));
  const after = Object.fromEntries((parsed.units || []).map((u) => [String(u.ho), u]));
  const hos = [...new Set([...Object.keys(before), ...Object.keys(after)])].sort((a, b) => a.localeCompare(b, "ko", { numeric: true }));
  const out = [];
  hos.forEach((ho) => {
    const b = before[ho], a = after[ho];
    if (!b) { out.push({ ho, item: "세대 추가", before: 0, after: Number(a.charge) || 0 }); return; }
    if (!a) { out.push({ ho, item: "세대 빠짐", before: Number(b.charge) || 0, after: 0 }); return; }
    // 예전에 저장된 부과에 항목 금액이 없으면 소계만 비교
    const items = Object.keys(b.values || {}).length ? [...new Set([...Object.keys(b.values || {}), ...Object.keys(a.values || {})])] : [];
    items.forEach((it) => {
      const x = Number(b.values?.[it]) || 0, y = Number(a.values?.[it]) || 0;
      if (x !== y) out.push({ ho, item: it, before: x, after: y });
    });
    if ((Number(b.charge) || 0) !== (Number(a.charge) || 0)) out.push({ ho, item: "당월소계", before: Number(b.charge) || 0, after: Number(a.charge) || 0 });
  });
  return out;
}

// 호실별 미납 = 기초 미납 + 부과 누계 − 입금 누계 (보려는 달 말일까지)
export function unpaidByUnit({ charges, deposits, units, upto, opening = null }) {
  const list = [...charges].filter((c) => c.month <= upto && (!opening?.date || c.charge_date >= opening.date))
    .sort((a, b) => a.month.localeCompare(b.month));
  if (!list.length) return { rows: [], unmatched: [], first: null };
  const first = list[0];
  const endDate = lastDay(upto);
  const unitsById = Object.fromEntries((units || []).map((u) => [u.id, u]));
  const rows = {};
  const row = (ho) => (rows[ho] = rows[ho] || { ho, opening: 0, charged: 0, paid: 0, sheetUnpaid: 0 });
  // 이전 미납: 회계 시작 설정이 있으면 그걸 따름 (따로 관리·장부 포함 모두 호실별 미납에는 넣음)
  const useOpening = opening?.arrearsMode ? opening.arrearsMode !== "none" : !!Number(first.opening_unpaid);
  (first.units || []).forEach((u) => { if (useOpening) row(u.ho).opening += Number(u.unpaid) || 0; });
  list.forEach((c) => (c.units || []).forEach((u) => {
    const r = row(u.ho);
    r.charged += (Number(u.charge) || 0) + (c.late_fee_charged ? Number(u.unpaidLate) || 0 : 0);
  }));
  const last = list[list.length - 1];
  (last.units || []).forEach((u) => { row(u.ho).sheetUnpaid = Number(u.unpaid) || 0; });
  const unmatched = [];
  (deposits || []).filter((t) => t.direction === "입금" && t.txn_date > first.charge_date && t.txn_date <= endDate && !/이자|결산/.test(`${t.txn_type} ${t.description}`))
    .forEach((t) => {
      const ho = depositHo(t, unitsById);
      if (ho && rows[ho]) rows[ho].paid += Number(t.amount) || 0;
      else unmatched.push(t);
    });
  // 입금은 이전 미납부터 갚은 것으로 봄 → 이전 미납 남은 금액 / 관리단 부과분 미납으로 나눔
  const out = Object.values(rows).map((r) => {
    const balance = r.opening + r.charged - r.paid;
    const oldLeft = Math.max(0, r.opening - r.paid);
    return { ...r, balance, oldLeft, newLeft: balance - oldLeft };
  });
  return { rows: out, unmatched, first, last };
}

export default function FeeCharges({ buildingId, month, charges, deposits, units, accounts, itemAccounts = {}, canManage, ready = true, opening = null }) {
  const router = useRouter();
  const fileRef = useRef(null);
  const [preview, setPreview] = useState(null);
  const [showUnits, setShowUnits] = useState(false);
  const [busy, setBusy] = useState("");
  const [openingEdit, setOpeningEdit] = useState(null);
  const [revView, setRevView] = useState(null);
  const current = charges.find((c) => c.month === month);
  const recent = [...charges].sort((a, b) => b.month.localeCompare(a.month)).slice(0, 4);
  const unpaid = useMemo(() => unpaidByUnit({ charges, deposits, units, upto: month, opening }), [charges, deposits, units, month, opening]);
  const totalUnpaid = unpaid.rows.reduce((s, r) => s + Math.max(0, r.balance), 0);
  const unpaidCount = unpaid.rows.filter((r) => r.balance > 0).length;

  if (!ready) {
    return canManage ? <div className="card mb-4 text-sm">관리비 부과·미납 기능을 쓰려면 Supabase에서 <strong>fee_charges.sql</strong>을 한 번 실행해야 합니다.</div> : null;
  }

  async function onFile(file) {
    if (!file) return;
    setBusy("reading");
    try {
      const p = await parseFeeSheet(file);
      const m = p.month || month;
      const isFirst = !charges.some((c) => c.month < m);
      setPreview({
        file: file.name, parsed: p, month: m, chargeDate: lastDay(m),
        lateFee: true, openingMode: opening?.arrearsMode || (isFirst && p.totals.unpaid > 0 ? "memo" : "none"), buildingMode: opening?.arrearsMode || "",
        oldCode: accounts.find((a) => a.is_leaf && a.name === "가수금")?.code || "",
        codes: Object.fromEntries(p.items.map((i) => [i.name, itemAccounts[i.name] || suggestFeeItemAccount(accounts, i.name)])),
        exists: charges.some((c) => c.month === m),
      });
    } catch (e) { alert(e.message); }
    setBusy("");
  }

  async function save() {
    const { parsed, month: m, chargeDate, lateFee, openingMode, oldCode, codes, file, reason } = preview;
    const prev = charges.find((c) => c.month === m);
    const changes = diffCharge(prev, parsed);
    if (prev && changes.length && !String(reason || "").trim()) { alert("바뀐 내용이 있어요. 수정 사유를 적어주세요."); return; }
    setBusy("saving");
    const supabase = createClient();
    const row = {
      building_id: buildingId, month: m, charge_date: chargeDate, source: "엑셀", source_file: file,
      items: parsed.items.map((i) => ({ ...i, account_code: codes[i.name] || "" })),
      units: parsed.units.map((u) => ({ ho: u.ho, charge: u.charge, unpaid: u.unpaid, unpaidLate: u.unpaidLate, area: u.area, values: u.values })),
      totals: { ...parsed.totals, openingMode, oldArrearsCode: oldCode || "" }, late_fee_charged: lateFee,
      opening_unpaid: openingMode !== "none" ? parsed.totals.unpaid : 0,
    };
    if (prev && changes.length) {
      row.revisions = [...(prev.revisions || []), {
        at: new Date().toISOString(), file, reason: String(reason).trim(), changes: changes.slice(0, 300),
        totalBefore: Number(prev.totals?.charge) || 0, totalAfter: parsed.totals.charge,
      }];
    }
    let { error } = await supabase.from("fee_charges").upsert(row, { onConflict: "building_id,month" });
    if (error && /revisions/.test(error.message)) {
      // 수정 기록 칸이 아직 없으면 (fee_revisions.sql 실행 전) 기록 없이 저장
      delete row.revisions;
      ({ error } = await supabase.from("fee_charges").upsert(row, { onConflict: "building_id,month" }));
      if (!error) alert("저장했지만 수정 기록은 남기지 못했어요. Supabase에서 fee_revisions.sql을 실행해주세요.");
    }
    if (!error && accounts.length) {
      await supabase.from("buildings").update({ fee_item_accounts: { ...itemAccounts, ...codes } }).eq("id", buildingId);
    }
    setBusy("");
    if (error) { alert("저장 실패: " + error.message); return; }
    setPreview(null);
    router.refresh();
  }

  async function remove(c) {
    if (!confirm(`${Number(c.month.slice(5))}월분 부과 내역을 삭제할까요? 장부에서도 빠집니다.`)) return;
    const { error } = await createClient().from("fee_charges").delete().eq("id", c.id);
    if (error) { alert(error.message); return; }
    router.refresh();
  }

  return (
    <div className="card mb-4">
      <div className="flex items-start justify-between gap-2 mb-3">
        <div>
          <div className="font-semibold">관리비 부과 · 미납</div>
          <div className="text-xs text-inkDim mt-0.5">부과 내역을 올리면 미수관리비로 잡히고, 입금과 맞춰 호실별 미납이 계산됩니다.</div>
        </div>
        {canManage && (
          <>
            <button className="btn-ghost text-xs shrink-0" disabled={!!busy} onClick={() => fileRef.current?.click()}>
              {busy === "reading" ? "읽는 중…" : "부과 내역 올리기"}
            </button>
            <input ref={fileRef} type="file" accept=".xls,.xlsx" className="hidden" onChange={(e) => { onFile(e.target.files?.[0]); e.target.value = ""; }} />
          </>
        )}
      </div>

      {charges.length === 0 ? (
        <div className="text-sm text-inkDim">아직 올린 부과 내역이 없습니다. 회계프로그램의 <b>세대별 관리비 조정집계표</b> 엑셀을 올려주세요.</div>
      ) : (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mb-3">
            {recent.map((c) => (
              <div key={c.id} className={"rounded-xl p-3 " + (c.month === month ? "bg-accent/10" : "bg-surface2")}>
                <div className="text-xs text-inkDim">{c.month.slice(0, 4)}년 {Number(c.month.slice(5))}월분 · {c.source}</div>
                <div className="font-bold">{won(c.totals?.charge)}원</div>
                <div className="text-[11px] text-inkDim">{(c.units || []).length}세대 · 장부일 {c.charge_date.slice(5).replace("-", "/")}</div>
                {Number(c.totals?.unpaid) > 0 && c === charges[0] && !opening?.arrearsMode && (
                  <div className="text-[11px] text-inkDim">
                    이전 미납 {won(c.totals.unpaid)} · {({ memo: "따로 관리", books: "장부 포함", none: "관리 안 함" })[openingModeOf(c)]}
                    {canManage && <button className="underline ml-1" onClick={() => setOpeningEdit(c)}>바꾸기</button>}
                  </div>
                )}
                {(c.revisions || []).length > 0 && (
                  <button className="text-[11px] text-accent underline mr-2" onClick={() => setRevView(c)}>수정 {c.revisions.length}회</button>
                )}
                {canManage && <button className="text-[11px] text-inkDim underline" onClick={() => remove(c)}>삭제</button>}
              </div>
            ))}
          </div>
          <button onClick={() => setShowUnits(true)} className={"w-full rounded-xl p-3 text-left flex items-center gap-3 " + (unpaidCount ? "bg-warn/10" : "bg-ok/10")}>
            <span className="flex-1 text-sm">
              {Number(month.slice(5))}월 말 기준 미납 <b className={unpaidCount ? "text-warn" : "text-ok"}>{unpaidCount}세대 · {won(totalUnpaid)}원</b>
              {unpaid.unmatched.length > 0 && <span className="text-xs text-inkDim"> · 호실 미지정 입금 {unpaid.unmatched.length}건</span>}
            </span>
            <span className="text-xs text-accent underline shrink-0">호실별 보기</span>
          </button>
          {!current && <div className="text-xs text-inkDim mt-2">{Number(month.slice(5))}월분 부과 내역은 아직 없습니다.</div>}
        </>
      )}

      {preview && (
        <Preview preview={preview} setPreview={setPreview} accounts={accounts} charges={charges} busy={busy === "saving"} onSave={save} />
      )}
      {showUnits && <UnitUnpaid data={unpaid} month={month} onClose={() => setShowUnits(false)} />}
      {revView && <Revisions charge={revView} onClose={() => setRevView(null)} />}
      {openingEdit && <OpeningEditor charge={openingEdit} accounts={accounts} onClose={() => setOpeningEdit(null)} />}
    </div>
  );
}

function Preview({ preview, setPreview, accounts, charges = [], busy, onSave }) {
  const { parsed: p } = preview;
  const prev = charges.find((c) => c.month === preview.month);
  const changes = diffCharge(prev, p);
  const issues = checkSheet(p);
  const leaves = leafAccounts(accounts);
  const set = (k, v) => setPreview({ ...preview, [k]: v });
  return (
    <div className="fixed inset-0 bg-black/50 flex items-end sm:items-center justify-center sm:p-4 z-50" onClick={() => !busy && setPreview(null)}>
      <div className="bg-surface w-full sm:max-w-lg max-h-[92vh] overflow-y-auto p-5 rounded-t-3xl sm:rounded-3xl" onClick={(e) => e.stopPropagation()}>
        <div className="font-bold text-lg">관리비 부과 내역 올리기</div>
        <div className="text-xs text-inkDim mb-3 break-all">{preview.file}{p.buildingName ? ` · ${p.buildingName}` : ""}</div>
        <div className="grid grid-cols-2 gap-2 mb-3">
          <label className="block"><span className="block text-[11px] text-inkDim mb-0.5">부과년월</span>
            <input type="month" value={preview.month} onChange={(e) => set("month", e.target.value)} /></label>
          <label className="block"><span className="block text-[11px] text-inkDim mb-0.5">장부에 잡는 날</span>
            <input type="date" value={preview.chargeDate} onChange={(e) => set("chargeDate", e.target.value)} /></label>
        </div>
        {issues.length > 0 && (
          <div className="rounded-xl bg-warn/10 p-3 mb-3 text-xs">
            <div className="font-semibold text-warn mb-1">⚠ 확인이 필요한 세대 {issues.length}곳 — 당월소계와 항목 합이 다릅니다</div>
            <div className="max-h-28 overflow-y-auto space-y-0.5">
              {issues.map((x) => <div key={x.ho}>{x.ho}호 · 당월소계 {won(x.charge)} / 항목 합 {won(x.sum)} ({x.diff > 0 ? "+" : ""}{won(x.diff)})</div>)}
            </div>
            <div className="text-inkDim mt-1">엑셀에서 항목 금액만 고치고 소계를 안 고쳤는지 확인해주세요. 그대로 저장하면 차이는 끝수 조정으로 잡힙니다.</div>
          </div>
        )}
        {prev && (
          <div className="rounded-xl border p-3 mb-3 text-xs" style={{ borderColor: "rgb(var(--border))" }}>
            <div className="font-semibold text-sm mb-1">
              이미 올린 {Number(preview.month.slice(5))}월분과 비교 · {changes.length ? `${new Set(changes.map((c) => c.ho)).size}세대 ${changes.length}곳 바뀜` : "바뀐 곳 없음"}
            </div>
            {changes.length > 0 && (
              <>
                <div className="text-inkDim mb-1">부과 합계 {won(prev.totals?.charge)} → <b className="text-ink">{won(p.totals.charge)}</b>원 ({p.totals.charge - (Number(prev.totals?.charge) || 0) >= 0 ? "+" : ""}{won(p.totals.charge - (Number(prev.totals?.charge) || 0))})</div>
                <div className="max-h-40 overflow-y-auto space-y-0.5">
                  {changes.map((c, i) => (
                    <div key={i} className="flex gap-2">
                      <span className="w-14 font-semibold">{c.ho}호</span><span className="flex-1 truncate">{c.item}</span>
                      <span className="text-inkDim">{won(c.before)} →</span><span className={"w-20 text-right font-semibold " + (c.after > c.before ? "text-warn" : "text-accent")}>{won(c.after)}</span>
                    </div>
                  ))}
                </div>
                <label className="block mt-2">
                  <span className="block text-[11px] text-inkDim mb-0.5">수정 사유 (기록에 남습니다)</span>
                  <input value={preview.reason || ""} placeholder="예: 101호 수도 검침 오류 정정" onChange={(e) => set("reason", e.target.value)} />
                </label>
              </>
            )}
          </div>
        )}

        <div className="rounded-xl bg-surface2 p-3 mb-3 text-sm grid grid-cols-2 gap-y-1">
          <span className="text-inkDim">세대</span><span className="text-right">{p.totals.units}세대</span>
          <span className="text-inkDim">당월 부과 합계</span><span className="text-right font-bold">{won(p.totals.charge)}원</span>
          <span className="text-inkDim">항목 합계</span><span className="text-right">{won(p.totals.items)}원</span>
          <span className="text-inkDim">끝수 조정</span><span className="text-right">{won(p.totals.rounding)}원</span>
          <span className="text-inkDim">이전 미납 (엑셀)</span><span className="text-right">{won(p.totals.unpaid)}원</span>
        </div>

        <div className="text-sm font-semibold mb-1">항목별 {leaves.length ? "계정" : "금액"}</div>
        <div className="space-y-1 mb-3">
          {p.items.map((i) => (
            <div key={i.name} className="flex items-center gap-2 text-sm">
              <span className="flex-1 truncate">{i.name}</span>
              <span className="w-28 text-right">{won(i.total)}</span>
              {leaves.length > 0 && (
                <select className="w-44 text-xs py-1" value={preview.codes[i.name] || ""} onChange={(e) => set("codes", { ...preview.codes, [i.name]: e.target.value })}>
                  <option value="">선택</option>
                  {leaves.map((a) => <option key={a.code} value={a.code}>{a.code} {a.name}</option>)}
                </select>
              )}
            </div>
          ))}
        </div>

        {p.totals.unpaidLate > 0 && (
          <label className="flex items-start gap-2 text-sm mb-2">
            <input type="checkbox" checked={preview.lateFee} onChange={(e) => set("lateFee", e.target.checked)} />
            <span>미납 연체료 {won(p.totals.unpaidLate)}원을 이번 달 부과에 포함 <span className="text-xs text-inkDim">(연체료수입)</span></span>
          </label>
        )}
        {p.totals.unpaid > 0 && preview.buildingMode && (
          <div className="rounded-xl bg-surface2 p-3 mb-2 text-xs text-inkDim">
            이전 미납 {won(p.totals.unpaid)}원은 <b className="text-ink">회계 시작 설정</b>에 따라 처리됩니다 ({({ memo: "따로 관리", books: "장부 포함", none: "관리 안 함" })[preview.buildingMode]}).
          </div>
        )}
        {p.totals.unpaid > 0 && !preview.buildingMode && (
          <div className="rounded-xl border p-3 mb-2 text-sm" style={{ borderColor: "rgb(var(--border))" }}>
            <div className="font-semibold mb-1">이전 미납 {won(p.totals.unpaid)}원</div>
            <OpeningChoice value={preview.openingMode} onChange={(v) => set("openingMode", v)} />
            {preview.openingMode === "memo" && leaves.length > 0 && (
              <label className="flex items-center gap-2 mt-2 text-xs">
                <span className="shrink-0 text-inkDim">이전 미납이 입금되면</span>
                <select className="text-xs py-1" value={preview.oldCode} onChange={(e) => set("oldCode", e.target.value)}>
                  <option value="">선택</option>
                  {leaves.map((a) => <option key={a.code} value={a.code}>{a.code} {a.name}</option>)}
                </select>
              </label>
            )}
          </div>
        )}

        <div className="flex gap-2 justify-end mt-4">
          <button className="btn-ghost" disabled={busy} onClick={() => setPreview(null)}>취소</button>
          <button className="btn" disabled={busy} onClick={onSave}>{busy ? "저장 중…" : "저장"}</button>
        </div>
      </div>
    </div>
  );
}

const OPENING = [
  ["memo", "따로 관리 (관리단 장부는 0에서 시작)", "호실별 미납에만 넣고 장부에는 넣지 않습니다. 이전 미납이 입금되면 미수관리비가 아니라 따로 정한 계정(가수금)으로 잡힙니다."],
  ["books", "장부에 기초 미수관리비로 넣기", "관리단이 이전 미납까지 넘겨받아 장부에 함께 잡을 때"],
  ["none", "넣지 않기", "이전 미납을 앱에서 관리하지 않을 때"],
];
function OpeningChoice({ value, onChange }) {
  return (
    <div className="space-y-1.5">
      {OPENING.map(([k, label, help]) => (
        <label key={k} className="flex items-start gap-2 cursor-pointer">
          <input type="radio" className="mt-1" checked={value === k} onChange={() => onChange(k)} />
          <span>{label}<span className="block text-xs text-inkDim">{help}</span></span>
        </label>
      ))}
    </div>
  );
}

function UnitUnpaid({ data, month, onClose }) {
  const [onlyUnpaid, setOnlyUnpaid] = useState(true);
  const rows = data.rows.filter((r) => !onlyUnpaid || r.balance > 0)
    .sort((a, b) => b.balance - a.balance || a.ho.localeCompare(b.ho, "ko", { numeric: true }));
  const sum = (k) => rows.reduce((s, r) => s + r[k], 0);
  return (
    <div className="fixed inset-0 bg-black/50 flex items-end sm:items-center justify-center sm:p-4 z-50" onClick={onClose}>
      <div className="bg-surface w-full sm:max-w-2xl max-h-[92vh] overflow-y-auto p-5 rounded-t-3xl sm:rounded-3xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-1">
          <div className="font-bold text-lg">호실별 미납 · {month.slice(0, 4)}년 {Number(month.slice(5))}월 말</div>
          <label className="text-xs flex items-center gap-1"><input type="checkbox" checked={onlyUnpaid} onChange={(e) => setOnlyUnpaid(e.target.checked)} /> 미납만</label>
        </div>
        <div className="text-xs text-inkDim mb-3">
          미납 = 이전 미납 + 부과 − 입금. 입금은 이전 미납부터 갚은 것으로 보고, "이전분"은 그중 아직 남은 이전 관리 기간 미납입니다. 입금은 거래내역에서 호실을 지정했거나 입금자명에 호수가 적힌 것만 셉니다.
          엑셀 미납은 가장 최근 올린 부과 파일의 미납관리비입니다 (대조용).
        </div>
        <table className="w-full text-sm">
          <thead><tr className="border-b text-left"><th>호실</th><th className="text-right">기초 미납</th><th className="text-right">부과</th><th className="text-right">입금</th><th className="text-right">미납</th><th className="text-right">이전분</th><th className="text-right hidden sm:table-cell">엑셀 미납</th></tr></thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.ho} className="border-b">
                <td className="font-semibold">{r.ho}호</td>
                <td className="text-right text-inkDim">{r.opening ? won(r.opening) : ""}</td>
                <td className="text-right">{won(r.charged)}</td>
                <td className="text-right text-accent">{r.paid ? won(r.paid) : ""}</td>
                <td className={"text-right font-bold " + (r.balance > 0 ? "text-warn" : r.balance < 0 ? "text-accent" : "")}>{won(r.balance)}</td>
                <td className="text-right text-inkDim">{r.oldLeft ? won(r.oldLeft) : ""}</td>
                <td className="text-right text-inkDim hidden sm:table-cell">{r.sheetUnpaid ? won(r.sheetUnpaid) : ""}</td>
              </tr>
            ))}
            <tr className="font-bold"><td>합계</td><td className="text-right">{won(sum("opening"))}</td><td className="text-right">{won(sum("charged"))}</td><td className="text-right">{won(sum("paid"))}</td><td className="text-right">{won(sum("balance"))}</td><td className="text-right">{won(sum("oldLeft"))}</td><td className="hidden sm:table-cell" /></tr>
          </tbody>
        </table>
        {data.unmatched.length > 0 && (
          <div className="mt-4">
            <div className="text-sm font-semibold mb-1">호실을 모르는 입금 {data.unmatched.length}건 · {won(data.unmatched.reduce((s, t) => s + Number(t.amount), 0))}원</div>
            <div className="text-xs text-inkDim mb-1">통장·지출 → 거래내역에서 호실을 지정하면 미납에 반영됩니다.</div>
            <div className="text-xs space-y-0.5 max-h-40 overflow-y-auto">
              {data.unmatched.map((t) => <div key={t.id}>{t.txn_date.slice(5).replace("-", "/")} · {t.description || t.txn_type} · {won(t.amount)}원</div>)}
            </div>
          </div>
        )}
        <div className="flex justify-end mt-4"><button className="btn-ghost" onClick={onClose}>닫기</button></div>
      </div>
    </div>
  );
}

// 처음 올린 달의 이전 미납 처리 방식 바꾸기
function OpeningEditor({ charge, accounts, onClose }) {
  const router = useRouter();
  const leaves = leafAccounts(accounts);
  const [mode, setMode] = useState(openingModeOf(charge) === "none" && Number(charge.totals?.unpaid) ? "memo" : openingModeOf(charge));
  const [oldCode, setOldCode] = useState(charge.totals?.oldArrearsCode || leaves.find((a) => a.name === "가수금")?.code || "");
  const [busy, setBusy] = useState(false);
  async function save() {
    setBusy(true);
    const { error } = await createClient().from("fee_charges").update({
      opening_unpaid: mode === "none" ? 0 : Number(charge.totals?.unpaid) || 0,
      totals: { ...(charge.totals || {}), openingMode: mode, oldArrearsCode: oldCode },
    }).eq("id", charge.id);
    setBusy(false);
    if (error) { alert(error.message); return; }
    onClose();
    router.refresh();
  }
  return (
    <div className="fixed inset-0 bg-black/50 flex items-end sm:items-center justify-center sm:p-4 z-50" onClick={() => !busy && onClose()}>
      <div className="bg-surface w-full sm:max-w-md p-5 rounded-t-3xl sm:rounded-3xl text-sm" onClick={(e) => e.stopPropagation()}>
        <div className="font-bold text-lg mb-1">이전 미납 처리</div>
        <div className="text-xs text-inkDim mb-3">{Number(charge.month.slice(5))}월분 부과 파일의 이전 미납 {won(charge.totals?.unpaid)}원</div>
        <OpeningChoice value={mode} onChange={setMode} />
        {mode === "memo" && leaves.length > 0 && (
          <label className="flex items-center gap-2 mt-3 text-xs">
            <span className="shrink-0 text-inkDim">이전 미납이 입금되면</span>
            <select className="text-xs py-1" value={oldCode} onChange={(e) => setOldCode(e.target.value)}>
              <option value="">선택</option>
              {leaves.map((a) => <option key={a.code} value={a.code}>{a.code} {a.name}</option>)}
            </select>
          </label>
        )}
        <div className="flex gap-2 justify-end mt-4">
          <button className="btn-ghost" disabled={busy} onClick={onClose}>닫기</button>
          <button className="btn" disabled={busy} onClick={save}>{busy ? "저장 중…" : "저장"}</button>
        </div>
      </div>
    </div>
  );
}

// 부과 수정 기록
function Revisions({ charge, onClose }) {
  return (
    <div className="fixed inset-0 bg-black/50 flex items-end sm:items-center justify-center sm:p-4 z-50" onClick={onClose}>
      <div className="bg-surface w-full sm:max-w-lg max-h-[92vh] overflow-y-auto p-5 rounded-t-3xl sm:rounded-3xl text-sm" onClick={(e) => e.stopPropagation()}>
        <div className="font-bold text-lg mb-3">{charge.month.slice(0, 4)}년 {Number(charge.month.slice(5))}월분 부과 수정 기록</div>
        {[...(charge.revisions || [])].reverse().map((r, i) => (
          <div key={i} className="rounded-xl bg-surface2 p-3 mb-2">
            <div className="flex justify-between text-xs text-inkDim">
              <span>{new Date(r.at).toLocaleString("ko-KR", { timeZone: "Asia/Seoul" })}</span>
              <span>{won(r.totalBefore)} → {won(r.totalAfter)}원</span>
            </div>
            <div className="font-semibold mt-1">{r.reason}</div>
            <div className="text-xs mt-1 space-y-0.5">
              {(r.changes || []).map((c, k) => <div key={k}>{c.ho}호 · {c.item}: {won(c.before)} → {won(c.after)}</div>)}
            </div>
            {r.file && <div className="text-[11px] text-inkDim mt-1 break-all">{r.file}</div>}
          </div>
        ))}
        <div className="flex justify-end mt-2"><button className="btn-ghost" onClick={onClose}>닫기</button></div>
      </div>
    </div>
  );
}
