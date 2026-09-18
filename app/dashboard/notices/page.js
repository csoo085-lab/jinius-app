import { createClient } from "@/lib/supabaseServer";
import { getCurrentUser } from "@/lib/session";
import NoticesBoard from "@/components/NoticesBoard";

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
  const buildingId = searchParams?.building || buildings[0].id;
  const building = buildings.find((b) => b.id === buildingId);

  const { data: notices } = await supabase
    .from("notices")
    .select("*")
    .eq("building_id", buildingId)
    .order("created_at", { ascending: false });

  return (
    <div>
      <h1 className="font-display font-bold text-xl mb-5">공지사항 · {building?.name}</h1>
      <NoticesBoard notices={notices || []} role={role} myName={displayName} buildingId={buildingId} />
    </div>
  );
}
