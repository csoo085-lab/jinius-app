import { createClient } from "@/lib/supabaseServer";
import FeesManager from "@/components/FeesManager";

function thisMonth() {
  return new Date().toISOString().slice(0, 7);
}

function prevMonthOf(month) {
  const [y, m] = month.split("-").map(Number);
  const d = new Date(y, m - 2, 1); // m은 1~12, JS Date month는 0~11이므로 -2
  return d.toISOString().slice(0, 7);
}

export default async function FeesPage({ searchParams }) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const { data: me } = await supabase.from("profiles").select("role").eq("id", user.id).single();
  const role = me?.role || "고객";

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
  const month = searchParams?.month || thisMonth();
  const building = buildings.find((b) => b.id === buildingId);

  const { data: feeItems } = await supabase.from("fee_items").select("*").eq("building_id", buildingId).order("created_at");
  const { data: invoices } = await supabase.from("fee_invoices").select("*").eq("building_id", buildingId).eq("month", month);
  const { data: meterReadings } = await supabase.from("meter_readings").select("*").eq("building_id", buildingId).eq("month", month);
  const { data: units } = await supabase.from("units").select("*").eq("building_id", buildingId).order("dong").order("ho");
  const { data: itemAmounts } = await supabase.from("fee_item_amounts").select("*").eq("building_id", buildingId).eq("month", month);
  const { data: prevItemAmounts } = await supabase.from("fee_item_amounts").select("*").eq("building_id", buildingId).eq("month", prevMonthOf(month));

  return (
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
  );
}
