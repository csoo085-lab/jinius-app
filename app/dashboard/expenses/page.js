import Link from "next/link";
import { createClient } from "@/lib/supabaseServer";
import { getCurrentUser } from "@/lib/session";
import ExpensesManager from "@/components/ExpensesManager";
import BankStatementsManager from "@/components/BankStatementsManager";

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

const TABS = [
  { key: "expenses", label: "지출" },
  { key: "files", label: "통장 파일" },
];

function Title({ buildingName }) {
  return (
    <div className="mb-4 print:hidden">
      {buildingName && <div className="text-sm text-inkDim font-medium truncate">{buildingName}</div>}
      <h1 className="font-display font-bold text-xl">통장·지출</h1>
    </div>
  );
}

// 통장내역 + 지출내역 통합 화면
export default async function MoneyPage({ searchParams }) {
  const supabase = createClient();
  const { user, role } = await getCurrentUser();
  const canManage = role === "관리자" || role === "담당자";

  const { data: buildings } = await supabase.from("buildings").select("id, name").order("created_at", { ascending: true });
  if (!buildings || buildings.length === 0) {
    return (
      <div>
        <Title />
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
          <Title />
          <div className="card text-sm text-inkDim">배정된 건물 정보가 없습니다. 관리사무소에 문의해주세요.</div>
        </div>
      );
    }
  } else {
    buildingId = searchParams?.building || buildings[0].id;
  }
  const buildingName = buildings.find((b) => b.id === buildingId)?.name || "";

  const tab = TABS.some((t) => t.key === searchParams?.tab) ? searchParams.tab : "expenses";
  const month = /^\d{4}-\d{2}$/.test(searchParams?.month || "") ? searchParams.month : thisMonthKST();

  // 탭 주소: 건물·월은 그대로 유지
  function tabHref(key) {
    const p = new URLSearchParams();
    if (canManage) p.set("building", buildingId);
    if (searchParams?.month) p.set("month", month);
    if (key !== "expenses") p.set("tab", key);
    const q = p.toString();
    return `/dashboard/expenses${q ? `?${q}` : ""}`;
  }

  let body;
  if (tab === "files") {
    const { data: statements } = await supabase
      .from("bank_statements")
      .select("*")
      .eq("building_id", buildingId)
      .order("period_start", { ascending: false });
    body = <BankStatementsManager initialStatements={statements || []} buildingId={buildingId} canManage={canManage} embedded />;
  } else {
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

    body = (
      <ExpensesManager
        buildingName={buildingName}
        buildingId={buildingId}
        month={month}
        expenses={expenses || []}
        receiptsByExpense={receiptsByExpense}
        canManage={canManage}
        setupNeeded={!!error}
        embedded
      />
    );
  }

  return (
    <div>
      <Title buildingName={buildingName} />

      {/* 탭 */}
      <div className="flex gap-1 p-1 rounded-xl bg-surface2 mb-5 w-full md:w-auto md:inline-flex print:hidden">
        {TABS.map((t) => (
          <Link
            key={t.key}
            href={tabHref(t.key)}
            className={
              "flex-1 md:flex-none text-center px-5 py-2 rounded-lg text-sm font-semibold transition " +
              (tab === t.key ? "bg-surface text-ink shadow-sm" : "text-inkDim hover:text-ink")
            }
          >
            {t.label}
          </Link>
        ))}
      </div>

      {body}
    </div>
  );
}
