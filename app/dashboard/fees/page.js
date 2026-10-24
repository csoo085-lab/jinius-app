import Link from "next/link";
import { createClient } from "@/lib/supabaseServer";
import { getCurrentUser } from "@/lib/session";
import FeesManager from "@/components/FeesManager";
import BillingManager from "@/components/BillingManager";

function thisMonth() {
  return new Date().toISOString().slice(0, 7);
}

function prevMonthOf(month) {
  const [y, m] = month.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 2, 1)); // m은 1~12, Date month는 0~11이므로 -2
  return d.toISOString().slice(0, 7);
}

// 한국 시간 기준 지난달 (10월에 작업하는 고지서 = 9월분)
function lastMonthKST() {
  const today = new Date().toLocaleDateString("sv-SE", { timeZone: "Asia/Seoul" }).slice(0, 7);
  return prevMonthOf(today);
}

export default async function FeesPage({ searchParams }) {
  const supabase = createClient();
  const { role } = await getCurrentUser();
  const canManage = role === "관리자" || role === "담당자";

  const { data: buildings } = await supabase.from("buildings").select("*").order("created_at", { ascending: true });
  if (!buildings || buildings.length === 0) {
    return (
      <div>
        <h1 className="font-display font-bold text-xl mb-5">관리비 고지서</h1>
        <div className="card text-sm text-inkDim">등록된 건물이 없습니다.</div>
      </div>
    );
  }
  const buildingId = searchParams?.building || buildings[0].id;
  const building = buildings.find((b) => b.id === buildingId) || buildings[0];

  // ---------- 관리자·담당자: 고지서 작업 (전기·수도 계산 → 세대별 고지서) ----------
  if (canManage && searchParams?.view !== "old") {
    const month = /^\d{4}-\d{2}$/.test(searchParams?.month || "") ? searchParams.month : lastMonthKST();
    const prev = prevMonthOf(month);
    const { data: units } = await supabase.from("units").select("*").eq("building_id", building.id);
    const sorted = (units || []).sort((a, b) =>
      (a.dong || "").localeCompare(b.dong || "", "ko", { numeric: true })
      || (parseInt(String(a.ho).replace(/[^0-9]/g, ""), 10) || 0) - (parseInt(String(b.ho).replace(/[^0-9]/g, ""), 10) || 0));
    const { data: runs, error } = await supabase.from("bill_runs").select("*")
      .eq("building_id", building.id).in("month", [month, prev]);
    const run = (runs || []).find((r) => r.month === month) || null;
    const prevRun = (runs || []).find((r) => r.month === prev) || null;

    // 지난달 고지(발행일) 이후 호실이 지정된 입금 → 미납 자동 계산
    let deposits = [];
    if (prevRun) {
      const since = prevRun.inputs?.issue || `${month}-01`;
      const { data: dep } = await supabase.from("bank_transactions").select("unit_id, amount, txn_date")
        .eq("building_id", building.id).eq("direction", "입금").not("unit_id", "is", null).gte("txn_date", since);
      deposits = dep || [];
    }

    return (
      <div>
        <BillingManager
          key={`${building.id}-${month}-${run?.updated_at || "new"}`}
          building={building}
          units={sorted}
          run={run}
          prevRun={prevRun}
          deposits={deposits}
          month={month}
          setupNeeded={!!error || !("billing_settings" in building)}
        />
        <div className="text-right mt-2 print:hidden">
          <Link href={`/dashboard/fees?building=${building.id}&view=old`} className="text-xs text-inkDim underline">이전 방식 고지서 화면</Link>
        </div>
      </div>
    );
  }

  // ---------- 이전 방식 (구분소유자·고객 화면 포함) ----------
  const month = searchParams?.month || thisMonth();
  const [
    { data: feeItems },
    { data: invoices },
    { data: meterReadings },
    { data: units },
    { data: itemAmounts },
    { data: prevItemAmounts },
  ] = await Promise.all([
    supabase.from("fee_items").select("*").eq("building_id", buildingId).order("created_at"),
    supabase.from("fee_invoices").select("*").eq("building_id", buildingId).eq("month", month),
    supabase.from("meter_readings").select("*").eq("building_id", buildingId).eq("month", month),
    supabase.from("units").select("*").eq("building_id", buildingId).order("dong").order("ho"),
    supabase.from("fee_item_amounts").select("*").eq("building_id", buildingId).eq("month", month),
    supabase.from("fee_item_amounts").select("*").eq("building_id", buildingId).eq("month", prevMonthOf(month)),
  ]);

  return (
    <div>
      {canManage && (
        <div className="text-right mb-2 print:hidden">
          <Link href={`/dashboard/fees?building=${building.id}`} className="text-xs text-accent underline">← 새 고지서 작업 화면</Link>
        </div>
      )}
      <FeesManager
        buildings={buildings}
        building={building}
        buildingId={buildingId}
        month={month}
        role={role}
        feeItems={feeItems || []}
        invoices={invoices || []}
        meterReadings={meterReadings || []}
        units={units || []}
        itemAmounts={itemAmounts || []}
        prevItemAmounts={prevItemAmounts || []}
      />
    </div>
  );
}
