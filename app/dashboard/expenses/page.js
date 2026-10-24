import Link from "next/link";
import { createClient } from "@/lib/supabaseServer";
import { getCurrentUser } from "@/lib/session";
import ExpensesManager from "@/components/ExpensesManager";
import BankStatementsManager from "@/components/BankStatementsManager";
import BankTransactionsManager from "@/components/BankTransactionsManager";

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
  { key: "txns", label: "거래내역" },
  { key: "expenses", label: "지출" },
  { key: "files", label: "통장 파일" },
];
const DEFAULT_TAB = "txns";

// 날짜 문자열 더하기/빼기 (YYYY-MM-DD)
function addDays(iso, n) {
  const d = new Date(iso + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

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

  // 건물별 승인 금액 기준 (expense_procedure.sql 실행 전이면 기본값)
  const { data: bRow } = await supabase.from("buildings")
    .select("expense_approval_t1, expense_approval_t2").eq("id", buildingId).maybeSingle();
  const thresholds = {
    t1: Number(bRow?.expense_approval_t1) || 500000,
    t2: Number(bRow?.expense_approval_t2) || 3000000,
  };

  const tab = TABS.some((t) => t.key === searchParams?.tab) ? searchParams.tab : DEFAULT_TAB;
  const month = /^\d{4}-\d{2}$/.test(searchParams?.month || "") ? searchParams.month : thisMonthKST();

  // 탭 주소: 건물·월은 그대로 유지
  function tabHref(key) {
    const p = new URLSearchParams();
    if (canManage) p.set("building", buildingId);
    if (searchParams?.month) p.set("month", month);
    if (key !== DEFAULT_TAB) p.set("tab", key);
    const q = p.toString();
    return `/dashboard/expenses${q ? `?${q}` : ""}`;
  }

  let body;
  if (tab === "txns") {
    const { start, next } = monthRange(month);
    const { data: txns, error } = await supabase
      .from("bank_transactions")
      .select("*")
      .eq("building_id", buildingId)
      .gte("txn_date", start)
      .lt("txn_date", next)
      .order("txn_at", { ascending: true });

    // 연결 후보 지출: 이번 달 앞뒤 7일까지 + 이미 연결된 지출
    const { data: nearExpenses } = await supabase
      .from("building_expenses")
      .select("*")
      .eq("building_id", buildingId)
      .gte("expense_date", addDays(start, -7))
      .lt("expense_date", addDays(next, 7))
      .order("expense_date", { ascending: true });
    const linkedIds = Array.from(new Set((txns || []).map((t) => t.expense_id).filter(Boolean)));
    const known = new Set((nearExpenses || []).map((e) => e.id));
    const missing = linkedIds.filter((id) => !known.has(id));
    const { data: extra } = missing.length
      ? await supabase.from("building_expenses").select("*").in("id", missing)
      : { data: [] };
    const allExpenses = [...(nearExpenses || []), ...(extra || [])];

    // 다른 달 거래에 이미 연결된 지출은 자동 연결 후보에서 제외
    const expIds = allExpenses.map((e) => e.id);
    const { data: linkedRows } = expIds.length
      ? await supabase.from("bank_transactions").select("expense_id").in("expense_id", expIds)
      : { data: [] };

    const { data: receipts } = expIds.length
      ? await supabase.from("expense_receipts").select("*").in("expense_id", expIds).order("created_at", { ascending: true })
      : { data: [] };
    const receiptsByExpense = {};
    (receipts || []).forEach((r) => {
      (receiptsByExpense[r.expense_id] = receiptsByExpense[r.expense_id] || []).push(r);
    });

    body = (
      <BankTransactionsManager
        buildingId={buildingId}
        month={month}
        txns={txns || []}
        expenses={allExpenses}
        receiptsByExpense={receiptsByExpense}
        linkedExpenseIds={Array.from(new Set((linkedRows || []).map((r) => r.expense_id)))}
        thresholds={thresholds}
        canManage={canManage}
        setupNeeded={!!error}
      />
    );
  } else if (tab === "files") {
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

    // 이체상태: 통장 출금과 연결된 지출 (거래내역 기능이 없으면 빈 값)
    const { data: links } = ids.length
      ? await supabase.from("bank_transactions").select("expense_id, txn_date, account_label").in("expense_id", ids)
      : { data: [] };
    const txnByExpense = {};
    (links || []).forEach((t) => { txnByExpense[t.expense_id] = t; });

    body = (
      <ExpensesManager
        txnByExpense={txnByExpense}
        thresholds={thresholds}
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
