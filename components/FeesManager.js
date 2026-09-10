"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabaseClient";

export default function FeesManager({ buildings, building, buildingId, month, role, feeItems, invoices, meterReadings }) {
  const supabase = createClient();
  const router = useRouter();
  const readOnly = role === "고객";
  const [newItem, setNewItem] = useState("");
  const [unitText, setUnitText] = useState("");
  const [values, setValues] = useState({});
  const [prevUnpaid, setPrevUnpaid] = useState(0);
  const [previewRow, setPreviewRow] = useState(null);

  function goto(b, m) {
    router.push(`/dashboard/fees?building=${b}&month=${m}`);
  }

  async function addFeeItem() {
    if (!newItem.trim()) return;
    const { error } = await supabase.from("fee_items").insert({ building_id: buildingId, name: newItem.trim() });
    if (error) { alert("추가 실패: " + error.message); return; }
    setNewItem("");
    router.refresh();
  }

  async function removeFeeItem(id) {
    if (!confirm("이 항목을 삭제할까요?")) return;
    await supabase.from("fee_items").delete().eq("id", id);
    router.refresh();
  }

  async function addInvoiceRow() {
    if (!unitText.trim()) { alert("호실을 입력해주세요."); return; }
    const itemsTotal = feeItems.reduce((sum, it) => sum + (Number(values[it.name]) || 0), 0);
    const lateFee = Math.round((Number(prevUnpaid) || 0) * ((building?.late_fee_rate || 0) / 100));
    const total = itemsTotal + (Number(prevUnpaid) || 0) + lateFee;
    const { error } = await supabase.from("fee_invoices").insert({
      building_id: buildingId, month, unit_text: unitText.trim(), values,
      items_total: itemsTotal, prev_unpaid: Number(prevUnpaid) || 0, late_fee: lateFee, total,
    });
    if (error) { alert("등록 실패: " + error.message); return; }
    setUnitText(""); setValues({}); setPrevUnpaid(0);
    router.refresh();
  }

  async function removeInvoice(id) {
    if (!confirm("삭제할까요?")) return;
    await supabase.from("fee_invoices").delete().eq("id", id);
    router.refresh();
  }

  function findMeterUsage(unitTextValue, utility) {
    // unit_text 형식: "동 호" (예: "101동 101호") — 검침 dong/ho와 매칭
    const row = meterReadings.find((r) => `${r.dong} ${r.ho}`.trim() === unitTextValue && r.utility === utility);
    if (!row) return null;
    const rawUsage = Math.max(0, row.curr_reading - row.prev_reading);
    const adjustment = row.adjustment || 0;
    return { prev: row.prev_reading, curr: row.curr_reading, usage: rawUsage + adjustment, adjustment };
  }

  function handlePrint() {
    window.print();
  }

  const won = (n) => (n || 0).toLocaleString() + "원";

  return (
    <div>
      <div className="flex items-center justify-between mb-5 print:hidden">
        <h1 className="font-display font-bold text-xl">관리비 고지서</h1>
        <button className="btn" onClick={handlePrint}>전체 인쇄 / PDF 저장</button>
      </div>

      <div className="card mb-4 print:hidden">
        <div className="grid grid-cols-2 gap-3">
          <select value={buildingId} onChange={(e) => goto(e.target.value, month)}>
            {buildings.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
          </select>
          <input type="month" value={month} onChange={(e) => goto(buildingId, e.target.value)} />
        </div>
      </div>

      {!readOnly && (
        <div className="card mb-4 print:hidden">
          <div className="font-semibold text-sm mb-3">관리비 항목</div>
          <div className="flex flex-wrap gap-2 mb-3">
            {feeItems.map((it) => (
              <span key={it.id} className="tag border-borderBright text-ink">
                {it.name} <button onClick={() => removeFeeItem(it.id)} className="text-inkDim ml-1">×</button>
              </span>
            ))}
            {feeItems.length === 0 && <span className="text-xs text-inkDim">등록된 항목이 없습니다.</span>}
          </div>
          <div className="flex gap-2">
            <input placeholder="항목명 (예: 일반관리비)" value={newItem} onChange={(e) => setNewItem(e.target.value)} />
            <button className="btn shrink-0" onClick={addFeeItem}>추가</button>
          </div>
        </div>
      )}

      {!readOnly && feeItems.length > 0 && (
        <div className="card mb-4 print:hidden">
          <div className="font-semibold text-sm mb-3">호실 데이터 추가</div>
          <input placeholder="동/호수 (예: 101동 101호)" value={unitText} onChange={(e) => setUnitText(e.target.value)} className="mb-3" />
          <div className="grid grid-cols-2 gap-3 mb-3">
            {feeItems.map((it) => (
              <input key={it.id} type="number" placeholder={it.name}
                value={values[it.name] || ""}
                onChange={(e) => setValues({ ...values, [it.name]: e.target.value })} />
            ))}
          </div>
          <label className="text-xs text-inkDim font-medium">이전 미납금
            <input type="number" value={prevUnpaid} onChange={(e) => setPrevUnpaid(e.target.value)} className="mb-3" />
          </label>
          <button className="btn" onClick={addInvoiceRow}>추가</button>
        </div>
      )}

      <div className="card print:hidden">
        <div className="font-semibold text-sm mb-3">{month} 호실별 관리비 ({invoices.length})</div>
        {invoices.length === 0 ? (
          <p className="text-sm text-inkDim">등록된 데이터가 없습니다.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-inkDim border-b border-borderBright">
                  <th className="py-2">호실</th>
                  {feeItems.map((it) => <th key={it.id} className="py-2">{it.name}</th>)}
                  <th className="py-2">미납금</th><th className="py-2">연체료</th><th className="py-2">합계</th>
                  <th className="py-2"></th>
                </tr>
              </thead>
              <tbody>
                {invoices.map((row) => (
                  <tr key={row.id} className="border-b border-border">
                    <td className="py-2">{row.unit_text}</td>
                    {feeItems.map((it) => <td key={it.id} className="py-2 font-mono">{won(row.values?.[it.name])}</td>)}
                    <td className="py-2 font-mono text-inkDim">{won(row.prev_unpaid)}</td>
                    <td className="py-2 font-mono text-inkDim">{won(row.late_fee)}</td>
                    <td className="py-2 font-mono font-semibold">{won(row.total)}</td>
                    <td className="py-2 text-right">
                      <button onClick={() => setPreviewRow(row)} className="text-accent text-xs font-medium mr-3">미리보기</button>
                      {!readOnly && (
                        <button onClick={() => removeInvoice(row.id)} className="text-danger text-xs font-medium">삭제</button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* 인쇄용 고지서 (화면에는 숨김, 인쇄 시에만 표시) — 미리보기 중이면 해당 1건만, 아니면 전체 */}
      <div className="hidden print:block">
        {(previewRow ? [previewRow] : invoices).map((row) => (
          <div key={row.id} className="break-after-page pt-6">
            <InvoiceDocument
              row={row}
              building={building}
              month={month}
              feeItems={feeItems}
              elec={findMeterUsage(row.unit_text, "전기")}
              water={findMeterUsage(row.unit_text, "수도")}
              won={won}
            />
          </div>
        ))}
      </div>

      {/* 화면 미리보기 모달 (인쇄 시에는 숨김) */}
      {previewRow && (
        <div className="print:hidden fixed inset-0 bg-black/50 flex items-start justify-center p-4 z-50 overflow-y-auto" onClick={() => setPreviewRow(null)}>
          <div className="bg-white rounded-xl max-w-2xl w-full p-8 my-8" onClick={(e) => e.stopPropagation()}>
            <div className="flex justify-end gap-2 mb-4">
              <button className="btn-ghost" onClick={() => setPreviewRow(null)}>닫기</button>
              <button className="btn" onClick={handlePrint}>인쇄 / PDF 저장</button>
            </div>
            <InvoiceDocument
              row={previewRow}
              building={building}
              month={month}
              feeItems={feeItems}
              elec={findMeterUsage(previewRow.unit_text, "전기")}
              water={findMeterUsage(previewRow.unit_text, "수도")}
              won={won}
            />
          </div>
        </div>
      )}
    </div>
  );
}

function InvoiceDocument({ row, building, month, feeItems, elec, water, won }) {
  return (
    <>
      <div className="flex justify-between items-end border-b-2 border-black pb-3 mb-4">
        <div>
          <div className="font-display font-bold">{building?.name} {building?.company_name ? `· ${building.company_name}` : ""}</div>
          <div className="text-sm">호실: {row.unit_text}</div>
        </div>
        <div className="text-right">
          <div className="font-display font-bold text-xl">관리비 고지서</div>
          <div className="font-mono text-sm">{month}분</div>
        </div>
      </div>
      {building?.due_date_text && <div className="text-xs mb-3">◎ 납부마감: {building.due_date_text}</div>}
      <div className="grid grid-cols-2 gap-6 mb-4">
        <table className="w-full text-sm border-collapse">
          <thead><tr><th className="text-left border-b py-1">비용항목</th><th className="text-right border-b py-1">금액</th></tr></thead>
          <tbody>
            {feeItems.map((it) => (
              <tr key={it.id}><td className="py-1">{it.name}</td><td className="text-right py-1">{won(row.values?.[it.name])}</td></tr>
            ))}
          </tbody>
          <tfoot><tr className="font-semibold border-t-2 border-black"><td className="py-1">항목 합계</td><td className="text-right py-1">{won(row.items_total)}</td></tr></tfoot>
        </table>
        <table className="w-full text-sm border-collapse">
          <thead><tr><th className="text-left border-b py-1">검침정보</th><th className="text-right border-b py-1">사용량</th></tr></thead>
          <tbody>
            {elec && <tr><td className="py-1">전기 (전월 {elec.prev} → 당월 {elec.curr}{elec.adjustment ? `, 보정 ${elec.adjustment > 0 ? "+" : ""}${elec.adjustment}` : ""})</td><td className="text-right py-1">{elec.usage} kWh</td></tr>}
            {water && <tr><td className="py-1">수도 (전월 {water.prev} → 당월 {water.curr}{water.adjustment ? `, 보정 ${water.adjustment > 0 ? "+" : ""}${water.adjustment}` : ""})</td><td className="text-right py-1">{water.usage} ㎥</td></tr>}
            {!elec && !water && <tr><td colSpan={2} className="py-1 text-inkDim">검침 데이터 없음</td></tr>}
          </tbody>
        </table>
      </div>
      <table className="w-full text-sm max-w-xs ml-auto mb-4">
        <tbody>
          <tr><td className="py-1">관 리 비</td><td className="text-right py-1">{won(row.items_total)}</td></tr>
          {row.prev_unpaid > 0 && <tr><td className="py-1">이전 미납금</td><td className="text-right py-1">{won(row.prev_unpaid)}</td></tr>}
          {row.late_fee > 0 && <tr><td className="py-1">연체료</td><td className="text-right py-1">{won(row.late_fee)}</td></tr>}
          <tr className="font-bold text-lg border-t-2 border-black"><td className="py-1">합 계</td><td className="text-right py-1">{won(row.total)}</td></tr>
        </tbody>
      </table>
      <div className="text-xs text-right">
        납부계좌: {building?.bank_name ? `${building.bank_name} ${building.bank_account || ""} (${building.account_holder || ""})` : "계좌정보 미등록"}
        {building?.company_phone && ` · 문의 ${building.company_phone}`}
      </div>
    </>
  );
}
