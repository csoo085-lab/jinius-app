import { createClient } from "@/lib/supabaseServer";
import { getCurrentUser } from "@/lib/session";
import MeetingMinutesManager from "@/components/MeetingMinutesManager";

export default async function MeetingMinutesPage({ searchParams }) {
  const supabase = createClient();
  const { role } = await getCurrentUser();
  const canManage = role === "관리자" || role === "담당자";

  const { data: buildings } = await supabase.from("buildings").select("*").order("created_at", { ascending: true });
  if (!buildings || buildings.length === 0) {
    return (
      <div>
        <h1 className="font-display font-bold text-xl mb-5">회의록</h1>
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
          <h1 className="font-display font-bold text-xl mb-5">회의록</h1>
          <div className="card text-sm text-inkDim">배정된 건물 정보가 없습니다. 관리사무소에 문의해주세요.</div>
        </div>
      );
    }
  } else {
    buildingId = searchParams?.building || buildings[0].id;
  }

  const { data: minutes } = await supabase
    .from("meeting_minutes")
    .select("*, meeting_minute_files(*)")
    .eq("building_id", buildingId)
    .order("meeting_date", { ascending: false })
    .order("created_at", { ascending: false });

  return <MeetingMinutesManager initialMinutes={minutes || []} buildingId={buildingId} canManage={canManage} />;
}
