"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabaseClient";

const ALLOCATION_OPTIONS = ["정액제", "면적비례", "세대균등", "전기사용량비례", "수도사용량비례"];
// 정액제: 세대당 금액을 그대로 입력 (입력값 = 1세대 부담액, 총액이 아님)
// 나머지: 이번 달 총액을 입력하면 기준(면적/세대수/사용량)에 따라 자동 배분
function isFixedPerUnit(item) {
  return item.allocation === "정액제";
}

function lastDayOfMonth(month) {
  const [y, m] = month.split("-").map(Number);
  return new Date(y, m, 0).getDate();
}

function monthLabel(month) {
  const [y, m] = month.split("-").map(Number);
  return `${y}년 ${m}월분`;
}

function todayLabel() {
  const d = new Date();
  return `${d.getFullYear()}년 ${String(d.getMonth() + 1).padStart(2, "0")}월 ${String(d.getDate()).padStart(2, "0")}일`;
}

export default function FeesManager({
  buildings, building, buildingId, month, role,
  feeItems, invoices, meterReadings, units, itemAmounts, prevItemAmounts,
}) {
  const supabase = createClient();
  const router = useRouter();
  const readOnly = role === "고객";
  const [newItem, setNewItem] = useState("");
  const [newAllocation, setNewAllocation] = useState("면적비례");
  const [unitText, setUnitText] = useState("");
  const [values, setValues] = useState({});
  const [prevUnpaid, setPrevUnpaid] = useState(0);
  const [previewRow, setPreviewRow] = useState(null);
  const [previewMode, setPreviewMode] = useState("receipt"); // "receipt" | "full"
  const [amountInputs, setAmountInputs] = useState(() => {
    const init = {};
    feeItems.forEach((it) => {
      const found = itemAmounts.find((a) => a.fee_item_id === it.id);
      init[it.id] = found ? found.amount : "";
    });
    return init;
  });
  const [generating, setGenerating] = useState(false);
  const [feePeriod, setFeePeriod] = useState(`${month}-01 ~ ${month}-${String(lastDayOfMonth(month)).padStart(2, "0")}`);
  const [elecPeriod, setElecPeriod] = useState("");
  const [waterPeriod, setWaterPeriod] = useState("");

  function goto(b, m) {
    router.push(`/dashboard/fees?building=${b}&month=${m}`);
  }

  async function addFeeItem() {
    if (!newItem.trim()) return;
    const { error } = await supabase.from("fee_items").insert({
      building_id: buildingId, name: newItem.trim(), allocation: newAllocation,
    });
    if (error) { alert("추가 실패: " + error.message); return; }
    setNewItem("");
    router.refresh();
  }

  async function removeFeeItem(id) {
    if (!confirm("이 항목을 삭제할까요? (매월 입력한 금액도 함께 삭제됩니다)")) return;
    await supabase.from("fee_items").delete().eq("id", id);
    router.refresh();
  }

  function loadPrevAmounts() {
    const next = { ...amountInputs };
    feeItems.forEach((it) => {
      const found = prevItemAmounts.find((a) => a.fee_item_id === it.id);
      if (found) next[it.id] = found.amount;
    });
    setAmountInputs(next);
  }

  async function saveAmounts() {
    const rows = feeItems.map((it) => ({
      building_id: buildingId, fee_item_id: it.id, month,
      amount: Number(amountInputs[it.id]) || 0,
    }));
    if (rows.length === 0) return;
    const { error } = await supabase.from("fee_item_amounts")
      .upsert(rows, { onConflict: "building_id,fee_item_id,month" });
    if (error) { alert("저장 실패: " + error.message); return; }
    alert("이번 달 항목 총액이 저장되었습니다.");
    router.refresh();
  }

  function usageOf(dong, ho, utility) {
    const row = meterReadings.find((r) => r.dong === dong && r.ho === ho && r.utility === utility);
    if (!row) return 0;
    return Math.max(0, (row.curr_reading || 0) - (row.prev_reading || 0)) + (row.adjustment || 0);
  }

  // 부과면적: 건물 정보에 등록된 총 부과면적이 있으면 그 값을, 없으면 세대 면적 합계를 사용
  function computeBases() {
    const sumUnitArea = units.reduce((s, u) => s + (Number(u.area) || 0), 0);
    const totalArea = Number(building?.total_area) > 0 ? Number(building.total_area) : sumUnitArea;
    const unitCount = units.length;
    const totalElec = units.reduce((s, u) => s + usageOf(u.dong, u.ho, "전기"), 0);
    const totalWater = units.reduce((s, u) => s + usageOf(u.dong, u.ho, "수도"), 0);
    return { totalArea, unitCount, totalElec, totalWater };
  }

  function shareOf(unit, item, amount, bases) {
    if (!amount) return 0;
    if (item.allocation === "정액제") {
      return Math.round(amount); // 입력값 자체가 1세대 부담액
    }
    if (item.allocation === "면적비례") {
      if (!bases.totalArea) return 0;
      return Math.round(amount * ((Number(unit.area) || 0) / bases.totalArea));
    }
    if (item.allocation === "세대균등") {
      if (!bases.unitCount) return 0;
      return Math.round(amount / bases.unitCount);
    }
    if (item.allocation === "전기사용량비례") {
      if (!bases.totalElec) return 0;
      return Math.round(amount * (usageOf(unit.dong, unit.ho, "전기") / bases.totalElec));
    }
    if (item.allocation === "수도사용량비례") {
      if (!bases.totalWater) return 0;
      return Math.round(amount * (usageOf(unit.dong, unit.ho, "수도") / bases.totalWater));
    }
    return 0;
  }

  // 항목별 산출근거 문구 자동 생성 (표지 뒤 산출근거 페이지에 사용)
  function basisText(item, amount, bases) {
    const won = (n) => Math.round(n).toLocaleString();
    if (item.allocation === "정액제") {
      return `세대당 ${won(amount)}원 정액 × ${bases.unitCount}세대 = 총 ${won(amount * bases.unitCount)}원`;
    }
    if (item.allocation === "면적비례") {
      if (!bases.totalArea) return "부과면적 정보 없음";
      const unitPrice = amount / bases.totalArea;
      return `${won(amount)}원(금액) ÷ ${bases.totalArea.toLocaleString()}㎡(부과면적) = ${unitPrice.toFixed(2)}원/㎡(면적단가)`;
    }
    if (item.allocation === "세대균등") {
      if (!bases.unitCount) return "세대 정보 없음";
      return `${won(amount)}원(금액) ÷ ${bases.unitCount}세대 = ${won(amount / bases.unitCount)}원/세대`;
    }
    if (item.allocation === "전기사용량비례") {
      if (!bases.totalElec) return "전기 검침 정보 없음";
      return `${won(amount)}원(금액) ÷ ${bases.totalElec.toLocaleString()}kWh(총 사용량) = ${(amount / bases.totalElec).toFixed(2)}원/kWh(단가)`;
    }
    if (item.allocation === "수도사용량비례") {
      if (!bases.totalWater) return "수도 검침 정보 없음";
      return `${won(amount)}원(금액) ÷ ${bases.totalWater.toLocaleString()}㎥(총 사용량) = ${(amount / bases.totalWater).toFixed(2)}원/㎥(단가)`;
    }
    return "";
  }

  async function autoGenerate() {
    if (units.length === 0) { alert("먼저 '세대(호실) 설정'에서 세대를 등록해주세요."); return; }
    if (feeItems.length === 0) { alert("먼저 관리비 항목을 등록해주세요."); return; }
    const missingArea = units.some((u) => !u.area);
    if (feeItems.some((it) => it.allocation === "면적비례") && missingArea && !building?.total_area) {
      if (!confirm("면적이 입력되지 않은 세대가 있습니다. 해당 세대는 면적비례 항목이 0원으로 계산됩니다. 계속할까요?")) return;
    }
    if (!confirm(`${month} ${building?.name} 전체 세대(${units.length}세대)의 고지서를 자동 생성합니다.\n기존에 저장된 이번 달 고지서는 덮어써집니다. 계속할까요?`)) return;

    setGenerating(true);
    const bases = computeBases();
    const prevUnpaidMap = {};
    invoices.forEach((inv) => { prevUnpaidMap[inv.unit_text] = inv.prev_unpaid || 0; });

    const rows = units.map((u) => {
      const unitTextValue = `${u.dong} ${u.ho}`.trim();
      const rowValues = {};
      let itemsTotal = 0;
      feeItems.forEach((it) => {
        const amt = Number(amountInputs[it.id]) || 0;
        const share = shareOf(u, it, amt, bases);
        rowValues[it.name] = share;
        itemsTotal += share;
      });
      const prevUnpaidValue = prevUnpaidMap[unitTextValue] || 0;
      const lateFee = Math.round(prevUnpaidValue * ((building?.late_fee_rate || 0) / 100));
      const total = itemsTotal + prevUnpaidValue + lateFee;
      return {
        building_id: buildingId, month, unit_text: unitTextValue, values: rowValues,
        items_total: itemsTotal, prev_unpaid: prevUnpaidValue, late_fee: lateFee, total,
      };
    });

    const { error: delErr } = await supabase.from("fee_invoices").delete().eq("building_id", buildingId).eq("month", month);
    if (delErr) { setGenerating(false); alert("초기화 실패: " + delErr.message); return; }
    const { error: insErr } = await supabase.from("fee_invoices").insert(rows);
    setGenerating(false);
    if (insErr) { alert("생성 실패: " + insErr.message); return; }
    alert(`${rows.length}세대 고지서가 생성되었습니다.`);
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
  const bases = computeBases();
  const vehicleCount = units.filter((u) => (u.vehicle || "").trim()).length;

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
          <div className="font-semibold text-sm mb-3">관리비 항목 (배분 방식 설정)</div>
          <div className="flex flex-col gap-2 mb-3">
            {feeItems.map((it) => (
              <span key={it.id} className="tag border-borderBright text-ink flex items-center justify-between">
                {it.name} <span className="text-xs text-inkDim mx-2">({it.allocation})</span>
                <button onClick={() => removeFeeItem(it.id)} className="text-inkDim ml-1">×</button>
              </span>
            ))}
            {feeItems.length === 0 && <span className="text-xs text-inkDim">등록된 항목이 없습니다.</span>}
          </div>
          <div className="flex flex-wrap gap-2">
            <input placeholder="항목명 (예: 일반관리비)" value={newItem} onChange={(e) => setNewItem(e.target.value)} className="flex-1 min-w-[160px]" />
            <select value={newAllocation} onChange={(e) => setNewAllocation(e.target.value)} className="w-36 shrink-0">
              {ALLOCATION_OPTIONS.map((o) => <option key={o}>{o}</option>)}
            </select>
            <button className="btn shrink-0" onClick={addFeeItem}>추가</button>
          </div>
        </div>
      )}

      {!readOnly && feeItems.length > 0 && (
        <div className="card mb-4 print:hidden">
          <div className="flex items-center justify-between mb-3">
            <div className="font-semibold text-sm">{month} 항목별 금액 입력</div>
            <button className="btn-ghost text-xs" onClick={loadPrevAmounts}>전월 값 불러오기</button>
          </div>
          <div className="grid grid-cols-2 gap-3 mb-3">
            {feeItems.map((it) => (
              <label key={it.id} className="text-xs text-inkDim font-medium">
                {it.name} <span className="text-inkDim">({it.allocation})</span>
                <input type="number" placeholder={isFixedPerUnit(it) ? "세대당 금액" : "이번 달 총액"}
                  value={amountInputs[it.id] ?? ""}
                  onChange={(e) => setAmountInputs({ ...amountInputs, [it.id]: e.target.value })} />
              </label>
            ))}
          </div>
          <div className="grid grid-cols-3 gap-3 mb-3">
            <label className="text-xs text-inkDim font-medium">관리비 부과기간
              <input value={feePeriod} onChange={(e) => setFeePeriod(e.target.value)} placeholder="7월 01일 ~ 7월 31일" />
            </label>
            <label className="text-xs text-inkDim font-medium">전기 부과기간
              <input value={elecPeriod} onChange={(e) => setElecPeriod(e.target.value)} placeholder="7월 11일 ~ 8월 10일" />
            </label>
            <label className="text-xs text-inkDim font-medium">수도 부과기간
              <input value={waterPeriod} onChange={(e) => setWaterPeriod(e.target.value)} placeholder="7월 01일 ~ 7월 29일" />
            </label>
          </div>
          <div className="flex gap-2">
            <button className="btn-ghost" onClick={saveAmounts}>총액 저장</button>
            <button className="btn" disabled={generating} onClick={autoGenerate}>
              {generating ? "생성 중..." : "전체 세대 자동 생성"}
            </button>
          </div>
          <p className="text-xs text-inkDim mt-2">
            면적비례·세대균등 항목은 세대 면적·세대 수 기준으로, 사용량비례 항목은 이번 달 검침 데이터 기준으로 자동 배분됩니다. 부과기간 문구는 인쇄 시 표지·내역서에 반영됩니다.
          </p>
        </div>
      )}

      {!readOnly && feeItems.length > 0 && (
        <details className="card mb-4 print:hidden">
          <summary className="font-semibold text-sm cursor-pointer">개별 세대 수동 추가 (예외 세대용)</summary>
          <div className="mt-3">
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
        </details>
      )}

      <div className="card print:hidden">
        <div className="font-semibold text-sm mb-3">{month} 호실별 관리비 ({invoices.length})</div>
        {invoices.length === 0 ? (
          <p className="text-sm text-inkDim">등록된 데이터가 없습니다. 위에서 항목별 총액을 입력하고 '전체 세대 자동 생성'을 눌러주세요.</p>
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
                      <button onClick={() => { setPreviewRow(row); setPreviewMode("receipt"); }} className="text-accent text-xs font-medium mr-3">미리보기</button>
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
        {invoices.length > 0 && (
          <div className="mt-3 print:hidden">
            <button className="btn-ghost text-xs" onClick={() => { setPreviewRow(invoices[0]); setPreviewMode("full"); }}>
              표지·내역서·산출근거·차량현황까지 전체 미리보기
            </button>
          </div>
        )}
      </div>

      {/* 인쇄용 — 세대별 표지+영수증(2부) 전체 세트, 마지막에 건물 공통 산출근거/차량현황 1부 */}
      <div className="hidden print:block">
        {(previewRow ? [previewRow] : invoices).map((row) => (
          <FullInvoiceSet
            key={row.id}
            row={row}
            building={building}
            month={month}
            feeItems={feeItems}
            elec={findMeterUsage(row.unit_text, "전기")}
            water={findMeterUsage(row.unit_text, "수도")}
            won={won}
            feePeriod={feePeriod}
            elecPeriod={elecPeriod}
            waterPeriod={waterPeriod}
          />
        ))}
        {!previewRow || previewMode === "full" ? (
          <div className="break-after-page pt-6">
            <SummaryPage building={building} month={month} feeItems={feeItems} amountInputs={amountInputs} prevItemAmounts={prevItemAmounts} bases={bases} basisText={basisText} won={won} />
          </div>
        ) : null}
        {!previewRow || previewMode === "full" ? (
          <div className="pt-6">
            <VehicleTable units={units} building={building} month={month} vehicleCount={vehicleCount} />
          </div>
        ) : null}
      </div>

      {/* 화면 미리보기 모달 */}
      {previewRow && (
        <div className="print:hidden fixed inset-0 bg-black/50 flex items-start justify-center p-4 z-50 overflow-y-auto" onClick={() => setPreviewRow(null)}>
          <div className="bg-white rounded-xl max-w-2xl w-full p-8 my-8" onClick={(e) => e.stopPropagation()}>
            <div className="flex justify-end gap-2 mb-4">
              <button className="btn-ghost text-xs" onClick={() => setPreviewMode(previewMode === "full" ? "receipt" : "full")}>
                {previewMode === "full" ? "영수증만 보기" : "전체(표지·산출근거·차량현황) 보기"}
              </button>
              <button className="btn-ghost" onClick={() => setPreviewRow(null)}>닫기</button>
              <button className="btn" onClick={handlePrint}>인쇄 / PDF 저장</button>
            </div>
            {previewMode === "full" ? (
              <FullInvoiceSet
                row={previewRow} building={building} month={month} feeItems={feeItems}
                elec={findMeterUsage(previewRow.unit_text, "전기")}
                water={findMeterUsage(previewRow.unit_text, "수도")}
                won={won} feePeriod={feePeriod} elecPeriod={elecPeriod} waterPeriod={waterPeriod}
                screen
              />
            ) : (
              <ReceiptDocument
                row={previewRow} building={building} month={month} feeItems={feeItems}
                elec={findMeterUsage(previewRow.unit_text, "전기")}
                water={findMeterUsage(previewRow.unit_text, "수도")}
                won={won}
              />
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ───────────────────────── 표지 (COVER) ─────────────────────────
function CoverPage({ row, building, month }) {
  return (
    <div className="break-after-page">
      <div className="border-4 rounded-2xl p-10 min-h-[900px] flex flex-col" style={{ borderColor: "#2563eb" }}>
        <div className="flex justify-between items-start mb-16">
          <div className="text-2xl font-bold">{row.unit_text}</div>
          <div className="text-xs text-right text-inkDim">✉ 에너지 사용을 줄입시다!</div>
        </div>
        <div className="flex-1 flex flex-col items-center justify-center text-center">
          <div className="rounded-full px-5 py-2 mb-6" style={{ background: "#eef2ff", color: "#2563eb" }}>
            <span className="font-semibold">{monthLabel(month)}</span>
          </div>
          <div className="text-4xl font-display font-bold mb-6" style={{ color: "#2563eb" }}>관리비 부과명세서</div>
          <div className="border rounded-lg px-6 py-3 text-sm text-inkDim">
            이번달 <span className="font-semibold text-ink">관리비 부과명세서</span> 는 다음과 같습니다.
          </div>
        </div>
        <div className="text-center text-sm text-inkDim leading-6">
          <div className="font-semibold text-ink">{building?.name}</div>
          {building?.company_phone && <div>(☎ {building.company_phone})</div>}
          {building?.company_name && <div>{building.company_name}</div>}
        </div>
      </div>
    </div>
  );
}

// ───────────────────── 관리비 부과 내역서 (건물 공통 안내) ─────────────────────
function DetailPage({ row, building, month, feePeriod, elecPeriod, waterPeriod }) {
  return (
    <div className="break-after-page pt-6 text-sm">
      <div className="text-right font-semibold mb-2">{building?.company_name} 문의전화 : {building?.company_phone}</div>
      <div className="text-center font-display font-bold text-lg mb-4">{monthLabel(month)} 관리비 부과 내역서</div>
      <div className="space-y-1 mb-4">
        <div>◎ 납부마감일 : {building?.due_date_text || "매월 말일"}</div>
        <div>◎ 관리비부과기간</div>
        <div className="pl-4">- 관리비({month.slice(5)}월분) : {feePeriod}</div>
        {elecPeriod && <div className="pl-4">- 전 기({month.slice(5)}월분) : {elecPeriod}</div>}
        {waterPeriod && <div className="pl-4">- 수 도({month.slice(5)}월분) : {waterPeriod}</div>}
      </div>
      <table className="w-full border-collapse border text-center mb-4">
        <thead>
          <tr className="bg-gray-50">
            <th className="border py-2">은 행</th><th className="border py-2">계 좌 번 호</th><th className="border py-2">예 금 주</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td className="border py-2">{building?.bank_name || "-"}</td>
            <td className="border py-2">{building?.bank_account || "-"}</td>
            <td className="border py-2">{building?.account_holder || "-"}</td>
          </tr>
        </tbody>
      </table>
      <div>◎ 관리비 입금시 호수(ex:{row.unit_text})를 기재하여 주시기 바랍니다.</div>
      <div>◎ 관리비 연체시 연체료({building?.late_fee_rate || 0}%)가 부과됨을 알려드립니다.</div>
    </div>
  );
}

// ───────────────────────── 영수증(절취선 포함) ─────────────────────────
function ReceiptDocument({ row, building, month, feeItems, elec, water, won }) {
  return (
    <div className="text-sm">
      <div className="text-center text-xs text-inkDim mb-2">✂ ------------------------------ 절 취 선 ------------------------------</div>
      <div className="flex justify-between items-end border-b-2 border-black pb-2 mb-3">
        <div className="font-display font-bold">{monthLabel(month)} 관리비납입고지서 및 영수증(입주민용)</div>
        <div className="font-semibold">{row.unit_text} 귀하</div>
      </div>
      <div className="grid grid-cols-2 gap-4 mb-3">
        <table className="w-full border-collapse text-xs">
          <tbody>
            {feeItems.map((it) => (
              <tr key={it.id}><td className="border px-2 py-1">{it.name}</td><td className="border px-2 py-1 text-right">{won(row.values?.[it.name])}</td></tr>
            ))}
          </tbody>
        </table>
        <div className="text-xs">
          <table className="w-full border-collapse mb-2">
            <thead><tr className="bg-gray-50"><th className="border px-2 py-1">부과내역</th><th className="border px-2 py-1">부과금액</th></tr></thead>
            <tbody>
              <tr><td className="border px-2 py-1">관 리 비</td><td className="border px-2 py-1 text-right">{won(row.items_total)}</td></tr>
              <tr><td className="border px-2 py-1">미 납 금</td><td className="border px-2 py-1 text-right">{won(row.prev_unpaid)}</td></tr>
              <tr className="font-bold"><td className="border px-2 py-1">합 계</td><td className="border px-2 py-1 text-right">{won(row.total)}</td></tr>
            </tbody>
          </table>
          {(elec || water) && (
            <table className="w-full border-collapse">
              <thead><tr className="bg-gray-50"><th className="border px-2 py-1">용도</th><th className="border px-2 py-1">전월</th><th className="border px-2 py-1">당월</th><th className="border px-2 py-1">사용량</th></tr></thead>
              <tbody>
                {elec && <tr><td className="border px-2 py-1">전기</td><td className="border px-2 py-1 text-right">{elec.prev}</td><td className="border px-2 py-1 text-right">{elec.curr}</td><td className="border px-2 py-1 text-right">{elec.usage}</td></tr>}
                {water && <tr><td className="border px-2 py-1">수도</td><td className="border px-2 py-1 text-right">{water.prev}</td><td className="border px-2 py-1 text-right">{water.curr}</td><td className="border px-2 py-1 text-right">{water.usage}</td></tr>}
              </tbody>
            </table>
          )}
        </div>
      </div>
      <table className="w-full border-collapse text-xs mb-2">
        <thead><tr className="bg-gray-50"><th className="border px-2 py-1">은행명</th><th className="border px-2 py-1">계좌번호</th><th className="border px-2 py-1">예금주</th></tr></thead>
        <tbody><tr>
          <td className="border px-2 py-1 text-center">{building?.bank_name || "-"}</td>
          <td className="border px-2 py-1 text-center">{building?.bank_account || "-"}</td>
          <td className="border px-2 py-1 text-center">{building?.account_holder || "-"}</td>
        </tr></tbody>
      </table>
      <div className="text-xs">위의 금액을 납부하시기 바랍니다.</div>
      <div className="text-xs text-right">{todayLabel()} · {building?.company_name} · 문의전화 : {building?.company_phone}</div>
    </div>
  );
}

// ───────────────────── 관리비 부과총괄표 + 항목별 산출근거 ─────────────────────
function SummaryPage({ building, month, feeItems, amountInputs, prevItemAmounts, bases, basisText, won }) {
  // 정액제 항목은 입력값이 세대당 금액이므로, 총괄표에는 세대당 금액 × 세대수를 총액으로 표시
  function displayAmount(it, raw) {
    return isFixedPerUnit(it) ? raw * bases.unitCount : raw;
  }
  const total = feeItems.reduce((s, it) => s + displayAmount(it, Number(amountInputs[it.id]) || 0), 0);
  const prevTotal = feeItems.reduce((s, it) => {
    const found = prevItemAmounts.find((a) => a.fee_item_id === it.id);
    return s + displayAmount(it, found ? found.amount : 0);
  }, 0);
  return (
    <div className="break-after-page text-sm">
      <div className="text-center font-display font-bold text-lg mb-1">⊙ 관 리 비 부 과 총 괄 표 ⊙</div>
      <div className="text-center text-xs text-inkDim mb-4">{monthLabel(month)} · {building?.name}</div>
      <table className="w-full border-collapse mb-6 text-xs">
        <thead>
          <tr className="bg-gray-50">
            <th className="border px-2 py-1">항목</th><th className="border px-2 py-1">이번달 금액</th>
            <th className="border px-2 py-1">전월 부과금액</th><th className="border px-2 py-1">차액</th>
          </tr>
        </thead>
        <tbody>
          {feeItems.map((it) => {
            const amt = displayAmount(it, Number(amountInputs[it.id]) || 0);
            const found = prevItemAmounts.find((a) => a.fee_item_id === it.id);
            const prevAmt = displayAmount(it, found ? found.amount : 0);
            return (
              <tr key={it.id}>
                <td className="border px-2 py-1">{it.name}</td>
                <td className="border px-2 py-1 text-right">{won(amt)}</td>
                <td className="border px-2 py-1 text-right">{won(prevAmt)}</td>
                <td className="border px-2 py-1 text-right">{won(amt - prevAmt)}</td>
              </tr>
            );
          })}
          <tr className="font-bold bg-gray-50">
            <td className="border px-2 py-1">합 계</td>
            <td className="border px-2 py-1 text-right">{won(total)}</td>
            <td className="border px-2 py-1 text-right">{won(prevTotal)}</td>
            <td className="border px-2 py-1 text-right">{won(total - prevTotal)}</td>
          </tr>
        </tbody>
      </table>

      <div className="text-center font-display font-bold text-lg mb-4">⊙ 항 목 별 관 리 비 산 출 내 역 ⊙</div>
      {feeItems.map((it, idx) => {
        const amt = Number(amountInputs[it.id]) || 0;
        return (
          <div key={it.id} className="mb-4">
            <div className="font-semibold mb-1">{idx + 1}. {it.name} ({it.allocation})</div>
            <div className="text-xs pl-4">◈ 산출근거 : {basisText(it, amt, bases)}</div>
          </div>
        );
      })}
    </div>
  );
}

// ───────────────────────── 차량보유현황 ─────────────────────────
function VehicleTable({ units, building, month, vehicleCount }) {
  return (
    <div className="text-sm">
      <div className="text-center font-display font-bold text-lg mb-1">⊙ 입 주 민 차 량 보 유 현 황 ⊙</div>
      <div className="text-center text-xs text-inkDim mb-4">{monthLabel(month)} · {building?.name}</div>
      <table className="w-full border-collapse text-xs mb-2">
        <thead>
          <tr className="bg-gray-50"><th className="border px-2 py-1">동</th><th className="border px-2 py-1">호</th><th className="border px-2 py-1">차량보유수</th></tr>
        </thead>
        <tbody>
          {units.map((u) => (
            <tr key={u.id}>
              <td className="border px-2 py-1 text-center">{u.dong}</td>
              <td className="border px-2 py-1 text-center">{u.ho}</td>
              <td className="border px-2 py-1 text-center">{(u.vehicle || "").trim() ? 1 : 0}</td>
            </tr>
          ))}
          <tr className="font-bold bg-gray-50">
            <td className="border px-2 py-1 text-center" colSpan={2}>TOTAL</td>
            <td className="border px-2 py-1 text-center">{vehicleCount}</td>
          </tr>
        </tbody>
      </table>
      <div className="text-xs text-inkDim">
        ◈ 차량등록증 미부착차량은 강력스티커 부착 및 주차비(1개월분) 부과<br />
        ◈ 입주민의 안전하고 편안한 주차환경 조성을 위하여 협조 부탁드립니다.
      </div>
    </div>
  );
}

// ───────────────────── 세대 1건 전체 세트 (표지+내역서+영수증 2부) ─────────────────────
function FullInvoiceSet({ row, building, month, feeItems, elec, water, won, feePeriod, elecPeriod, waterPeriod, screen }) {
  const wrap = (children) => screen ? <div className="space-y-8">{children}</div> : <>{children}</>;
  return wrap(
    <>
      {!screen && <CoverPage row={row} building={building} month={month} />}
      {!screen && <DetailPage row={row} building={building} month={month} feePeriod={feePeriod} elecPeriod={elecPeriod} waterPeriod={waterPeriod} />}
      <div className={screen ? "" : "break-after-page pt-6"}>
        <ReceiptDocument row={row} building={building} month={month} feeItems={feeItems} elec={elec} water={water} won={won} />
      </div>
      {!screen && (
        <div className="pt-6">
          <ReceiptDocument row={row} building={building} month={month} feeItems={feeItems} elec={elec} water={water} won={won} />
        </div>
      )}
    </>
  );
}
