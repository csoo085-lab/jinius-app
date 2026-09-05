import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabaseServer";
import InspectionsManager from "@/components/InspectionsManager";

export default async function InspectionsPage({ searchParams }) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const { data: me } = await supabase.from("profiles").select("role").eq("id", user.id).single();
  if (!["관리자", "담당자"].includes(me?.role)) redirect("/dashboard");

  const { data: buildings } = await supabase.from("buildings").select("*").order("created_at", { ascending: true });
  if (!buildings || buildings.length === 0) {
    return (
      <div>
        <h1 className="font-display font-bold text-xl mb-5">시설점검 관리</h1>
        <div className="card text-sm text-inkDim">건물을 먼저 등록해주세요.</div>
      </div>
    );
  }
  const buildingId = searchParams?.building || buildings[0].id;

  const { data: items } = await supabase.from("facility_items").select("*").eq("building_id", buildingId).order("category");
  const itemIds = (items || []).map((i) => i.id);
  const { data: logs } = itemIds.length
    ? await supabase.from("inspection_logs").select("*").in("item_id", itemIds).order("log_date", { ascending: false })
    : { data: [] };

  const logsByItem = {};
  (logs || []).forEach((l) => {
    logsByItem[l.item_id] = logsByItem[l.item_id] || [];
    logsByItem[l.item_id].push(l);
  });

  return (
    <InspectionsManager buildings={buildings} buildingId={buildingId} items={items || []} logsByItem={logsByItem} />
  );
}
