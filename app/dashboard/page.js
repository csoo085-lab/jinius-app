import { createClient } from "@/lib/supabaseServer";
import { getCurrentUser } from "@/lib/session";

async function count(supabase, table) {
  const { count } = await supabase.from(table).select("*", { count: "exact", head: true });
  return count || 0;
}

function daysUntil(dateStr) {
  if (!dateStr) return null;
  const d = new Date(dateStr + "T00:00:00");
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Math.round((d - today) / 86400000);
}

function DdayBadge({ days }) {
  if (days === null) return null;
  const overdue = days < 0;
  const soon = days <= 30;
  const cls = overdue ? "bg-danger/10 text-danger" : soon ? "bg-warn/10 text-warn" : "bg-surface2 text-inkDim";
  const label = overdue ? `기한초과 D+${Math.abs(days)}` : `D-${days}`;
  return <span className={`tag ${cls}`}>{label}</span>;
}

export default async function DashboardPage() {
  const supabase = createClient();
  const { role } = await getCurrentUser();
  const canManage = role === "관리자" || role === "담당자";

  const [buildings, complaints, openComplaints, logs] = await Promise.all([
    count(supabase, "buildings"),
    count(supabase, "complaints"),
    supabase.from("complaints").select("*", { count: "exact", head: true }).neq("status", "완료").then((r) => r.count || 0),
    count(supabase, "inspection_logs"),
  ]);

  const stats = [
    { label: "등록된 건물", value: buildings },
    { label: "전체 민원·고장 신고", value: complaints },
    { label: "미해결 민원·고장", value: openComplaints },
    { label: "누적 점검 기록", value: logs },
  ];

  let inspections = [];
  if (canManage) {
    const { data } = await supabase
      .from("building_institutions")
      .select("id, next_inspection_date, buildings(name), institutions(name, category)")
      .not("next_inspection_date", "is", null)
      .order("next_inspection_date", { ascending: true })
      .limit(30);
    inspections = (data || []).filter((r) => daysUntil(r.next_inspection_date) <= 30);
  }

  return (
    <div>
      <h1 className="font-display font-bold text-xl mb-5">대시보드</h1>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
        {stats.map((s) => (
          <div key={s.label} className="card">
            <div className="font-display font-bold text-3xl">{s.value}</div>
            <div className="text-xs text-inkDim mt-1">{s.label}</div>
          </div>
        ))}
      </div>

      {canManage && (
        <div className="card">
          <div className="font-semibold text-sm mb-3">법정 점검 임박·기한초과 (30일 이내)</div>
          {inspections.length === 0 ? (
            <div className="text-sm text-inkDim">임박하거나 기한이 지난 점검이 없습니다.</div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-inkDim border-b border-borderBright">
                  <th className="py-2">건물</th>
                  <th className="py-2">기관·업체</th>
                  <th className="py-2">분류</th>
                  <th className="py-2">다음 점검일</th>
                  <th className="py-2"></th>
                </tr>
              </thead>
              <tbody>
                {inspections.map((r) => (
                  <tr key={r.id} className="border-b border-border">
                    <td className="py-2">{r.buildings?.name}</td>
                    <td className="py-2">{r.institutions?.name}</td>
                    <td className="py-2 text-inkDim">{r.institutions?.category || "-"}</td>
                    <td className="py-2 font-mono text-xs">{r.next_inspection_date}</td>
                    <td className="py-2 text-right"><DdayBadge days={daysUntil(r.next_inspection_date)} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}
    </div>
  );
}
