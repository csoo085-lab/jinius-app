import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabaseServer";
import FacilitiesManager from "@/components/FacilitiesManager";

const CATEGORIES = ["전기", "소방", "엘리베이터", "기계식주차", "인터넷", "펌프실", "비상발전기실", "급수·배수", "기계·냉난방", "청소", "기타"];

export default async function FacilitiesPage({ searchParams }) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const { data: me } = await supabase.from("profiles").select("role").eq("id", user.id).single();
  if (!["관리자", "담당자"].includes(me?.role)) redirect("/dashboard");

  const { data: buildings } = await supabase.from("buildings").select("*").order("created_at", { ascending: true });
  if (!buildings || buildings.length === 0) {
    return (
      <div>
        <h1 className="font-display font-bold text-xl mb-5">시설현황</h1>
        <div className="card text-sm text-inkDim">건물을 먼저 등록해주세요.</div>
      </div>
    );
  }
  const buildingId = searchParams?.building || buildings[0].id;

  const { data: items } = await supabase.from("facility_items").select("*").eq("building_id", buildingId);
  const itemIds = (items || []).map((i) => i.id);
  const { data: logs } = itemIds.length
    ? await supabase.from("inspection_logs").select("*").in("item_id", itemIds).order("log_date", { ascending: false })
    : { data: [] };
  const { data: documents } = itemIds.length
    ? await supabase.from("documents").select("*").in("item_id", itemIds)
    : { data: [] };

  const groups = CATEGORIES.map((cat) => ({
    category: cat,
    items: (items || []).filter((i) => (i.category || "기타") === cat),
  })).filter((g) => g.items.length > 0);

  const lastLogByItem = {};
  (logs || []).forEach((l) => {
    if (!lastLogByItem[l.item_id]) lastLogByItem[l.item_id] = l;
  });
  const docCountByItem = {};
  (documents || []).forEach((d) => {
    docCountByItem[d.item_id] = (docCountByItem[d.item_id] || 0) + 1;
  });

  return (
    <FacilitiesManager
      buildings={buildings}
      buildingId={buildingId}
      groups={groups}
      lastLogByItem={lastLogByItem}
      docCountByItem={docCountByItem}
    />
  );
}
