import { createClient } from "@/lib/supabaseServer";
import { getCurrentUser } from "@/lib/session";
import ExpensesManager from "@/components/ExpensesManager";

// 한국 시간 기준 "YYYY-MM"
function thisMonthKST() {
  return new Date().toLocaleDateString("sv-SE", { timeZone: "Asia/Seoul" }).slice(0, 7);
}

function monthRange(month) {
  const [y, m] = month.split("-").map(Number);
  const start = `${y}-${String(m).padStart(2, "0")}-01`;
  const next = m === 12 ? `${y + 1}-01-01` : `${y}-${String(m + 1).padStart(2, "0")}-01`;
  return { start, next };
}

export default async function ExpensesPage({ searchParams }) {
  const supabase = createClient();
  const { user, role } = await getCurrentUser();
  const canManage = role === "관리자" || role === "담당자";

  const { data: buildings } = await supabase.from("buildings").select("id, name").order("created_at", { ascending: true });
  if (!buildings || buildings.length === 0) {
    return (
      <div>
        <h1 className="font-display font-bold text-xl mb-5">지출내역</h1>
        <div className="card text-sm text-inkDim">등록된 건물이 없습니다.</div>
      </div>
    );
  }

  let buildingId;
  if (!canManage) {
    const { data: myProfile } = await supabase.from("profiles").select("building_id").eq("id", user.id).single();
    buildingId = myProfile?.building_id || null;
    if (!buildingId) {
      return (
        <div>
          <h1 className="font-display font-bold text-xl mb-5">지출내역</h1>
          <div className="card text-sm text-inkDim">배정된 건물 정보가 없습니다. 관리사무소에 문의해주세요.</div>
        </div>
      );
    }
  } else {
    buildingId = searchParams?.building || buildings[0].id;
  }

  const month = /^\d{4}-\d{2}$/.test(searchParams?.month || "") ? searchParams.month : thisMonthKST();
  const { start, next } = monthRange(month);

  const { data: expenses, error } = await supabase
    .from("building_expenses")
    .select("*")
    .eq("building_id", buildingId)
    .gte("expense_date", start)
    .lt("expense_date", next)
    .order("expense_date", { ascending: false })
    .order("created_at", { ascending: false });

  const ids = (expenses || []).map((e) => e.id);
  const { data: receipts } = ids.length
    ? await supabase.from("expense_receipts").select("*").in("expense_id", ids).order("created_at", { ascending: true })
    : { data: [] };

  const receiptsByExpense = {};
  (receipts || []).forEach((r) => {
    (receiptsByExpense[r.expense_id] = receiptsByExpense[r.expense_id] || []).push(r);
  });

  return (
    <ExpensesManager
      buildingName={buildings.find((b) => b.id === buildingId)?.name || ""}
      buildingId={buildingId}
      month={month}
      expenses={expenses || []}
      receiptsByExpense={receiptsByExpense}
      canManage={canManage}
      setupNeeded={!!error}
    />
  );
}
