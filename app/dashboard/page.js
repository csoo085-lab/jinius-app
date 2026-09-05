import { createClient } from "@/lib/supabaseServer";

async function count(supabase, table) {
  const { count } = await supabase.from(table).select("*", { count: "exact", head: true });
  return count || 0;
}

export default async function DashboardPage() {
  const supabase = createClient();
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

  return (
    <div>
      <h1 className="font-display font-bold text-xl mb-5">대시보드</h1>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {stats.map((s) => (
          <div key={s.label} className="card">
            <div className="font-display font-bold text-3xl">{s.value}</div>
            <div className="text-xs text-inkDim mt-1">{s.label}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
