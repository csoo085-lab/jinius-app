"use client";

// 관리비 부과 내역 → 미수관리비 · 호실별 미납
// - 회계프로그램 "세대별 관리비 조정집계표" 엑셀을 올리면 항목별로 부과를 장부에 잡음
// - 호실이 지정된(또는 입금자명에 호수가 있는) 입금과 맞춰 호실별 미납을 계산
import { useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabaseClient";
import { parseFeeSheet } from "@/lib/feeSheetParser";
import { leafAccounts, suggestFeeItemAccount } from "@/lib/accounts";

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

// 호실별 미납 = 기초 미납 + 부과 누계 − 입금 누계 (보려는 달 말일까지)
export function unpaidByUnit({ charges, deposits, units, upto }) {
  const list = [...charges].filter((c) => c.month <= upto).sort((a, b) => a.month.localeCompare(b.month));
  if (!list.length) return { rows: [], unmatched: [], first: null };
  const first = list[0];
  const endDate = lastDay(upto);
  const unitsById = Object.fromEntries((units || []).map((u) => [u.id, u]));
  const rows = {};
  const row = (ho) => (rows[ho] = rows[ho] || { ho, opening: 0, charged: 0, paid: 0, sheetUnpaid: 0 });
  (first.units || []).forEach((u) => { if (first.opening_unpaid) row(u.ho).opening += Number(u.unpaid) || 0; });
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
  const out = Object.values(rows).map((r) => ({ ...r, balance: r.opening + r.charged - r.paid }));
  return { rows: out, unmatched, first, last };
}

export default function FeeCharges({ buildingId, month, charges, deposits, units, accounts, itemAccounts = {}, canManage, ready = true }) {
  const router = useRouter();
  const fileRef = useRef(null);
  const [preview, setPreview] = useState(null);
  const [showUnits, setShowUnits] = useState(false);
  const [busy, setBusy] = useState("");
  const current = charges.find((c) => c.month === month);
  const recent = [...charges].sort((a, b) => b.month.localeCompare(a.month)).slice(0, 4);
  const unpaid = useMemo(() => unpaidByUnit({ charges, deposits, units, upto: month }), [charges, deposits, units, month]);
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
        lateFee: true, opening: isFirst && p.totals.unpaid > 0,
        codes: Object.fromEntries(p.items.map((i) => [i.name, itemAccounts[i.name] || suggestFeeItemAccount(accounts, i.name)])),
        exists: charges.some((c) => c.month === m),
      });
    } catch (e) { alert(e.message); }
    setBusy("");
  }

  async function save() {
    const { parsed, month: m, chargeDate, lateFee, opening, codes, file } = preview;
    setBusy("saving");
    const supabase = createClient();
    const row = {
      building_id: buildingId, month: m, charge_date: chargeDate, source: "엑셀", source_file: file,
      items: parsed.items.map((i) => ({ ...i, account_code: codes[i.name] || "" })),
      units: parsed.units.map((u) => ({ ho: u.ho, charge: u.charge, unpaid: u.unpaid, unpaidLate: u.unpaidLate, area: u.area, values: u.values })),
      totals: parsed.totals, late_fee_charged: lateFee, opening_unpaid: opening ? parsed.totals.unpaid : 0,
    };
    const { error } = await supabase.from("fee_charges").upsert(row, { onConflict: "building_id,month" });
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
        <Preview preview={preview} setPreview={setPreview} accounts={accounts} busy={busy === "saving"} onSave={save} />
      )}
      {showUnits && <UnitUnpaid data={unpaid} month={month} onClose={() => setShowUnits(false)} />}
    </div>
  );
}

function Preview({ preview, setPreview, accounts, busy, onSave }) {
  const { parsed: p } = preview;
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
        {preview.exists && <div className="text-xs text-warn mb-2">이 달 부과 내역이 이미 있어요. 저장하면 새 파일로 바뀝니다.</div>}

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
        {p.totals.unpaid > 0 && (
          <label className="flex items-start gap-2 text-sm mb-2">
            <input type="checkbox" checked={preview.opening} onChange={(e) => set("opening", e.target.checked)} />
            <span>이전 미납 {won(p.totals.unpaid)}원을 <b>기초 미수관리비</b>로 잡기
              <span className="block text-xs text-inkDim">처음 올리는 달에만 체크하세요. 앱 시작 전부터 밀린 관리비를 장부와 호실별 미납에 넣습니다.</span></span>
          </label>
        )}

        <div className="flex gap-2 justify-end mt-4">
          <button className="btn-ghost" disabled={busy} onClick={() => setPreview(null)}>취소</button>
          <button className="btn" disabled={busy} onClick={onSave}>{busy ? "저장 중…" : "저장"}</button>
        </div>
      </div>
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
          미납 = 기초 미납 + 부과 − 입금. 입금은 거래내역에서 호실을 지정했거나 입금자명에 호수가 적힌 것만 셉니다.
          엑셀 미납은 가장 최근 올린 부과 파일의 미납관리비입니다 (대조용).
        </div>
        <table className="w-full text-sm">
          <thead><tr className="border-b text-left"><th>호실</th><th className="text-right">기초 미납</th><th className="text-right">부과</th><th className="text-right">입금</th><th className="text-right">미납</th><th className="text-right hidden sm:table-cell">엑셀 미납</th></tr></thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.ho} className="border-b">
                <td className="font-semibold">{r.ho}호</td>
                <td className="text-right text-inkDim">{r.opening ? won(r.opening) : ""}</td>
                <td className="text-right">{won(r.charged)}</td>
                <td className="text-right text-accent">{r.paid ? won(r.paid) : ""}</td>
                <td className={"text-right font-bold " + (r.balance > 0 ? "text-warn" : r.balance < 0 ? "text-accent" : "")}>{won(r.balance)}</td>
                <td className="text-right text-inkDim hidden sm:table-cell">{r.sheetUnpaid ? won(r.sheetUnpaid) : ""}</td>
              </tr>
            ))}
            <tr className="font-bold"><td>합계</td><td className="text-right">{won(sum("opening"))}</td><td className="text-right">{won(sum("charged"))}</td><td className="text-right">{won(sum("paid"))}</td><td className="text-right">{won(sum("balance"))}</td><td className="hidden sm:table-cell" /></tr>
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
