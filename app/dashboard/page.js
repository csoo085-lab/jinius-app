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

function thisMonth() {
  return new Date().toISOString().slice(0, 7);
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
  let feeSummary = null;
  if (canManage) {
    const { data: inspData } = await supabase
      .from("building_institutions")
      .select("id, next_inspection_date, buildings(name), institutions(name, category)")
      .not("next_inspection_date", "is", null)
      .order("next_inspection_date", { ascending: true })
      .limit(30);
    inspections = (inspData || []).filter((r) => daysUntil(r.next_inspection_date) <= 30);

    const month = thisMonth();
    const { data: invoiceRows } = await supabase
      .from("fee_invoices")
      .select("building_id, total, paid, buildings(name)")
      .eq("month", month);

    if (invoiceRows && invoiceRows.length > 0) {
      const byBuilding = {};
      invoiceRows.forEach((r) => {
        const key = r.building_id;
        if (!byBuilding[key]) {
          byBuilding[key] = { name: r.buildings?.name || "-", count: 0, paidCount: 0, total: 0, paidTotal: 0 };
        }
        byBuilding[key].count += 1;
        byBuilding[key].total += r.total || 0;
        if (r.paid) {
          byBuilding[key].paidCount += 1;
          byBuilding[key].paidTotal += r.total || 0;
        }
      });
      const rows = Object.values(byBuilding).sort((a, b) => a.name.localeCompare(b.name, "ko"));
      const grandTotal = rows.reduce((s, r) => s + r.total, 0);
      const grandPaid = rows.reduce((s, r) => s + r.paidTotal, 0);
      const grandCount = rows.reduce((s, r) => s + r.count, 0);
      const grandPaidCount = rows.reduce((s, r) => s + r.paidCount, 0);
      feeSummary = { month, rows, grandTotal, grandPaid, grandCount, grandPaidCount };
    }
  }

  const won = (n) => (n || 0).toLocaleString() + "원";

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
        <div className="card mb-4">
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

      {canManage && (
        <div className="card">
          <div className="flex items-center justify-between flex-wrap gap-2 mb-3">
            <div className="font-semibold text-sm">{feeSummary?.month || thisMonth()} 관리비 수납 현황 (전체 건물)</div>
            {feeSummary && (
              <div className="text-xs text-inkDim">
                수납 <span className="font-semibold text-ink">
                  {feeSummary.grandPaidCount}/{feeSummary.grandCount}세대
                  ({feeSummary.grandCount ? Math.round((feeSummary.grandPaidCount / feeSummary.grandCount) * 100) : 0}%)
                </span>
                {" · "}수납액 <span className="font-semibold text-ink">{won(feeSummary.grandPaid)}</span> / 총 {won(feeSummary.grandTotal)}
              </div>
            )}
          </div>
          {!feeSummary ? (
            <div className="text-sm text-inkDim">이번 달 생성된 관리비 고지서가 없습니다.</div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-inkDim border-b border-borderBright">
                  <th className="py-2">건물</th>
                  <th className="py-2">수납 세대</th>
                  <th className="py-2">수납률</th>
                  <th className="py-2">수납액</th>
                  <th className="py-2">총 부과액</th>
                </tr>
              </thead>
              <tbody>
                {feeSummary.rows.map((r) => (
                  <tr key={r.name} className="border-b border-border">
                    <td className="py-2">{r.name}</td>
                    <td className="py-2 font-mono text-xs">{r.paidCount}/{r.count}</td>
                    <td className="py-2 font-mono text-xs">{r.count ? Math.round((r.paidCount / r.count) * 100) : 0}%</td>
                    <td className="py-2 font-mono">{won(r.paidTotal)}</td>
                    <td className="py-2 font-mono text-inkDim">{won(r.total)}</td>
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
