import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabaseServer";
import { getCurrentUser } from "@/lib/session";
import MetersManager from "@/components/MetersManager";

function thisMonth() {
  return new Date().toISOString().slice(0, 7);
}

function prevMonths(monthStr, n) {
  const [y, m] = monthStr.split("-").map(Number);
  const list = [];
  let year = y, mon = m;
  for (let i = 0; i < n; i++) {
    mon -= 1;
    if (mon === 0) { mon = 12; year -= 1; }
    list.push(`${year}-${String(mon).padStart(2, "0")}`);
  }
  return list;
}

export default async function MetersPage({ searchParams }) {
  const supabase = createClient();
  const { role } = await getCurrentUser();
  if (!["관리자", "담당자"].includes(role)) redirect("/dashboard");

  const { data: buildings } = await supabase.from("buildings").select("*").order("created_at", { ascending: true });
  if (!buildings || buildings.length === 0) {
    return (
      <div>
        <h1 className="font-display font-bold text-xl mb-5">검침 관리</h1>
        <div className="card text-sm text-inkDim">등록된 건물이 없습니다.</div>
      </div>
    );
  }
  const buildingId = searchParams?.building || buildings[0].id;
  const month = searchParams?.month || thisMonth();
  const utility = searchParams?.utility || "전기";
  const prevMonthList = prevMonths(month, 3);

  const [{ data: readings }, { data: buildingReadingRows }, { data: histRows }] = await Promise.all([
    supabase.from("meter_readings").select("*")
      .eq("building_id", buildingId).eq("month", month).eq("utility", utility)
      .order("dong").order("ho"),
    supabase.from("building_meter_readings").select("*")
      .eq("building_id", buildingId).eq("month", month).eq("utility", utility).limit(1),
    supabase.from("meter_readings").select("dong, ho, prev_reading, curr_reading, month")
      .eq("building_id", buildingId).eq("utility", utility).in("month", prevMonthList),
  ]);
  const buildingReading = (buildingReadingRows || [])[0] || null;

  const avgByUnit = {};
  (histRows || []).forEach((r) => {
    const key = `${r.dong}||${r.ho}`;
    const usage = Math.max(0, (r.curr_reading || 0) - (r.prev_reading || 0));
    if (!avgByUnit[key]) avgByUnit[key] = { sum: 0, count: 0 };
    avgByUnit[key].sum += usage;
    avgByUnit[key].count += 1;
  });
  Object.keys(avgByUnit).forEach((key) => {
    avgByUnit[key].avg = avgByUnit[key].sum / avgByUnit[key].count;
  });

  return (
    <MetersManager
      buildings={buildings}
      buildingId={buildingId}
      month={month}
      utility={utility}
      readings={readings || []}
      buildingReading={buildingReading}
      avgByUnit={avgByUnit}
    />
  );
}
