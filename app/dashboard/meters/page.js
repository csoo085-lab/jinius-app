import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabaseServer";
import MetersManager from "@/components/MetersManager";

function thisMonth() {
  return new Date().toISOString().slice(0, 7);
}

export default async function MetersPage({ searchParams }) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const { data: me } = await supabase.from("profiles").select("role").eq("id", user.id).single();
  if (!["관리자", "담당자"].includes(me?.role)) redirect("/dashboard");

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

  const { data: readings } = await supabase
    .from("meter_readings")
    .select("*")
    .eq("building_id", buildingId)
    .eq("month", month)
    .eq("utility", utility)
    .order("dong")
    .order("ho");

  return <MetersManager buildings={buildings} buildingId={buildingId} month={month} utility={utility} readings={readings || []} />;
}
