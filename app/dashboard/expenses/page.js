import Link from "next/link";
import { createClient } from "@/lib/supabaseServer";
import { getCurrentUser } from "@/lib/session";
import ExpensesManager from "@/components/ExpensesManager";
import BankStatementsManager from "@/components/BankStatementsManager";
import BankTransactionsManager from "@/components/BankTransactionsManager";
import BookkeepingManager from "@/components/BookkeepingManager";

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
  { key: "books", label: "회계 장부" },
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

  // 지출 증빙에 연결할 회의록 목록 (관리자·담당자만)
  let minutes = [];
  if (canManage) {
    const { data: mm } = await supabase.from("meeting_minutes")
      .select("id, title, meeting_type, meeting_date, expense_related")
      .eq("building_id", buildingId).order("meeting_date", { ascending: false }).limit(200);
    if (mm) minutes = mm;
    else {
      // expense_related 칸을 아직 만들지 않은 경우
      const { data: mm2 } = await supabase.from("meeting_minutes")
        .select("id, title, meeting_type, meeting_date").eq("building_id", buildingId)
        .order("meeting_date", { ascending: false }).limit(200);
      minutes = (mm2 || []).map((m) => ({ ...m, expense_related: true }));
    }
  }

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

    // 호실 목록 · 입금자명 기억 · 고정지출 (fixed_expenses_units.sql 실행 전이면 빈 값)
    const { data: units } = await supabase.from("units").select("id, dong, ho").eq("building_id", buildingId);
    const { data: payers } = canManage
      ? await supabase.from("building_payer_units").select("payer, unit_id").eq("building_id", buildingId)
      : { data: [] };
    const { data: recurring, error: recErr } = await supabase.from("building_recurring_expenses").select("*")
      .eq("building_id", buildingId).order("sort", { ascending: true });

    body = (
      <BankTransactionsManager
        units={units || []}
        payerMap={Object.fromEntries((payers || []).map((p) => [p.payer, p.unit_id]))}
        recurring={recurring || []}
        unitsReady={!recErr}
        buildingId={buildingId}
        month={month}
        txns={txns || []}
        expenses={allExpenses}
        receiptsByExpense={receiptsByExpense}
        linkedExpenseIds={Array.from(new Set((linkedRows || []).map((r) => r.expense_id)))}
        thresholds={thresholds}
        minutes={minutes}
        canManage={canManage}
        setupNeeded={!!error}
      />
    );
  } else if (tab === "books") {
    // 회계 장부: 1월부터 이번 달까지 (누계·전월 이월 계산용)
    const yearStart = `${month.slice(0, 4)}-01-01`;
    const { next } = monthRange(month);
    const { data: cfg, error: cfgErr } = await supabase.from("buildings")
      .select("bookkeeping_enabled, bank_account_codes, cash_account_code, card_account_code").eq("id", buildingId).maybeSingle();
    const { data: accounts } = await supabase.from("building_accounts")
      .select("code, name, side, level, parent_code, is_leaf, sort").eq("building_id", buildingId).order("sort", { ascending: true });
    const { data: txns } = await supabase.from("bank_transactions").select("*")
      .eq("building_id", buildingId).gte("txn_date", yearStart).lt("txn_date", next).order("txn_at", { ascending: true });
    const { data: exps } = await supabase.from("building_expenses").select("*")
      .eq("building_id", buildingId).gte("expense_date", addDays(yearStart, -60)).lt("expense_date", next);
    // 출금에 연결된 지출 중 기간 밖의 것도 가져옴
    const known = new Set((exps || []).map((e) => e.id));
    const missing = Array.from(new Set((txns || []).map((t) => t.expense_id).filter((id) => id && !known.has(id))));
    const { data: extra } = missing.length ? await supabase.from("building_expenses").select("*").in("id", missing) : { data: [] };
    // 카드·현금 지출은 올해 것만 장부에 들어감
    const expenses = [...(exps || []), ...(extra || [])]
      .filter((e) => (e.payment_method !== "카드" && e.payment_method !== "현금") || e.expense_date >= yearStart);
    const { data: recurring, error: recErr } = await supabase.from("building_recurring_expenses").select("*")
      .eq("building_id", buildingId).order("sort", { ascending: true });

    // 관리비 부과 내역 (fee_charges.sql 실행 전이면 빈 값) + 미납 계산용 입금·호실
    const { data: charges, error: chErr } = await supabase.from("fee_charges").select("*")
      .eq("building_id", buildingId).lte("month", month).order("month", { ascending: true });
    const { data: fia } = await supabase.from("buildings").select("fee_item_accounts").eq("id", buildingId).maybeSingle();
    const { data: op, error: opErr } = await supabase.from("buildings").select("bookkeeping_opening").eq("id", buildingId).maybeSingle();
    const opening = op?.bookkeeping_opening?.date ? op.bookkeeping_opening : null;
    let deposits = [];
    if (charges?.length) {
      const { data: dep } = await supabase.from("bank_transactions")
        .select("id, txn_date, amount, direction, description, txn_type, unit_id")
        .eq("building_id", buildingId).eq("direction", "입금").gt("txn_date", charges[0].charge_date).lt("txn_date", next);
      deposits = dep || [];
    }
    const { data: unitRows } = await supabase.from("units").select("id, dong, ho").eq("building_id", buildingId);

    body = (
      <BookkeepingManager
        charges={charges || []}
        chargesReady={!chErr}
        deposits={deposits}
        units={unitRows || []}
        itemAccounts={fia?.fee_item_accounts || {}}
        opening={opening}
        openingReady={!opErr}
        recurring={recurring || []}
        recurringReady={!recErr}
        buildingId={buildingId}
        buildingName={buildingName}
        month={month}
        settings={{
          enabled: !!cfg?.bookkeeping_enabled,
          bankMap: cfg?.bank_account_codes || {},
          cashCode: cfg?.cash_account_code || "",
          cardCode: cfg?.card_account_code || "",
        }}
        accounts={accounts || []}
        txns={txns || []}
        expenses={expenses}
        canManage={canManage}
        setupNeeded={!!cfgErr}
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
        minutes={minutes}
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
