import { createClient } from "@/lib/supabaseServer";
import { getCurrentUser } from "@/lib/session";
import NoticesBoard from "@/components/NoticesBoard";
import FlyersGallery from "@/components/FlyersGallery";
import UtilityUsageChart from "@/components/UtilityUsageChart";

function thisMonth() {
  return new Date().toISOString().slice(0, 7);
}

function last12Months(base) {
  const [y, m] = base.split("-").map(Number);
  const list = [];
  let year = y, mon = m;
  for (let i = 0; i < 12; i++) {
    list.unshift(`${year}-${String(mon).padStart(2, "0")}`);
    mon -= 1;
    if (mon === 0) { mon = 12; year -= 1; }
  }
  return list;
}

export default async function NoticesPage({ searchParams }) {
  const supabase = createClient();
  const { role, displayName } = await getCurrentUser();

  const { data: buildings } = await supabase.from("buildings").select("*").order("created_at", { ascending: true });
  if (!buildings || buildings.length === 0) {
    return (
      <div>
        <h1 className="font-display font-bold text-xl mb-5">공지사항</h1>
        <div className="card text-sm text-inkDim">등록된 건물이 없습니다.</div>
      </div>
    );
  }

  let buildingId;
  if (role === "고객" || role === "구분소유자") {
    const { data: { user } } = await supabase.auth.getUser();
    const { data: myProfile } = await supabase.from("profiles").select("building_id").eq("id", user.id).single();
    buildingId = myProfile?.building_id || null;
    if (!buildingId) {
      return (
        <div>
          <h1 className="font-display font-bold text-xl mb-5">공지사항</h1>
          <div className="card text-sm text-inkDim">배정된 건물 정보가 없습니다. 관리사무소에 문의해주세요.</div>
        </div>
      );
    }
  } else {
    buildingId = searchParams?.building || buildings[0].id;
  }

  const months = last12Months(thisMonth());

  const [{ data: notices }, { data: flyers }, { data: meterRows }, { data: feeItems }] = await Promise.all([
    supabase.from("notices").select("*").or(`building_id.eq.${buildingId},building_id.is.null`).order("created_at", { ascending: false }),
    supabase.from("building_flyers").select("*").eq("building_id", buildingId).order("created_at", { ascending: false }),
    supabase.from("meter_readings").select("month, utility, prev_reading, curr_reading").eq("building_id", buildingId).in("month", months),
    supabase.from("fee_items").select("id, allocation").eq("building_id", buildingId).in("allocation", ["전기사용량비례", "수도사용량비례"]),
  ]);

  const elecItemIds = (feeItems || []).filter((i) => i.allocation === "전기사용량비례").map((i) => i.id);
  const waterItemIds = (feeItems || []).filter((i) => i.allocation === "수도사용량비례").map((i) => i.id);
  const allItemIds = [...elecItemIds, ...waterItemIds];

  const { data: amountRows } = allItemIds.length
    ? await supabase.from("fee_item_amounts").select("month, amount, fee_item_id").eq("building_id", buildingId).in("fee_item_id", allItemIds).in("month", months)
    : { data: [] };

  const chartData = months.map((m) => {
    const usageFor = (utility) =>
      (meterRows || [])
        .filter((r) => r.month === m && r.utility === utility)
        .reduce((sum, r) => sum + Math.max(0, (r.curr_reading || 0) - (r.prev_reading || 0)), 0);
    const amountFor = (ids) =>
      (amountRows || [])
        .filter((r) => r.month === m && ids.includes(r.fee_item_id))
        .reduce((sum, r) => sum + (r.amount || 0), 0);
    return {
      month: m.slice(5),
      전기사용량: usageFor("전기"),
      전기고지서금액: amountFor(elecItemIds),
      수도사용량: usageFor("수도"),
      수도고지서금액: amountFor(waterItemIds),
    };
  });

  return (
    <div>
      <h1 className="font-display font-bold text-xl mb-5">공지사항</h1>
      <NoticesBoard notices={notices || []} role={role} myName={displayName} buildingId={buildingId} />
      <FlyersGallery flyers={flyers || []} role={role} buildingId={buildingId} />
      <UtilityUsageChart data={chartData} />
    </div>
  );
}
