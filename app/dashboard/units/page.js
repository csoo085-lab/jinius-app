import { createClient } from "@/lib/supabaseServer";
import UnitsManager from "@/components/UnitsManager";

export default async function UnitsPage({ searchParams }) {
  const supabase = createClient();
  const { data: buildings } = await supabase.from("buildings").select("*").order("created_at", { ascending: true });
  const buildingId = searchParams?.building || buildings?.[0]?.id || "";
  const { data: units } = buildingId
    ? await supabase.from("units").select("*").eq("building_id", buildingId).order("dong").order("ho")
    : { data: [] };

  if (!buildings || buildings.length === 0) {
    return (
      <div>
        <h1 className="font-display font-bold text-xl mb-5">세대(호실) 설정</h1>
        <div className="card text-sm text-inkDim">건물을 먼저 등록해주세요. (건물 설정 메뉴)</div>
      </div>
    );
  }

  return <UnitsManager buildings={buildings} initialBuildingId={buildingId} units={units || []} />;
}
