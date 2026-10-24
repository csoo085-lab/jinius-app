"use client";

// 적립금 이체 현황 (장기수선충당금 · 공유부지사용료 등)
// 부과할 때 부채(적립금)로 쌓인 금액 중, 전용 통장으로 아직 옮기지 못하고 관리비 통장에 남아 있는 금액을 보여줌
import { suggestFeeItemAccount } from "@/lib/accounts";

const won = (n) => Math.round(Number(n) || 0).toLocaleString("ko-KR");
const coreOf = (name) => String(name || "").replace(/\s/g, "").replace(/(충당금|충당부채|적립금|사용료|계좌|\(.*\))/g, "");

export default function ReserveStatus({ charges, deposits, accounts, bankMap = {}, month, opening }) {
  const byCode = Object.fromEntries((accounts || []).map((a) => [a.code, a]));
  const end = `${month}-31`;
  const list = (charges || []).filter((c) => c.month <= month && (!opening?.date || c.charge_date >= opening.date));
  if (!list.length || !accounts?.length) return null;

  // 부과 항목 중 수익이 아닌 계정(적립금·부채)으로 잡힌 것
  const reserves = {};
  list.forEach((c) => (c.items || []).forEach((it) => {
    const code = it.account_code && byCode[it.account_code] ? it.account_code : suggestFeeItemAccount(accounts, it.name);
    if (!code || code.startsWith("4")) return;
    const r = (reserves[code] = reserves[code] || { code, name: byCode[code]?.name || it.name, charged: 0 });
    r.charged += Number(it.total) || 0;
  }));
  const rows = Object.values(reserves).map((r) => {
    const core = coreOf(r.name);
    const labels = Object.entries(bankMap).filter(([, code]) => core && coreOf(byCode[code]?.name).includes(core)).map(([l]) => l);
    const moved = (deposits || [])
      .filter((t) => labels.includes(t.account_label) && t.direction === "입금" && t.txn_date <= end && !/이자|결산/.test(`${t.txn_type || ""} ${t.description || ""}`))
      .reduce((s, t) => s + (Number(t.amount) || 0), 0);
    return { ...r, labels, moved, left: r.charged - moved };
  });
  if (!rows.length) return null;

  return (
    <div className="card mb-4">
      <div className="font-semibold">적립금 이체 현황 <span className="text-sm text-inkDim font-normal">· {Number(month.slice(5))}월 말 기준</span></div>
      <div className="text-xs text-inkDim mt-0.5 mb-3">부과할 때 적립금으로 쌓인 금액 중, 전용 통장으로 아직 옮기지 않아 관리비 통장에 남아 있는 금액입니다.</div>
      <div className="space-y-2">
        {rows.map((r) => (
          <div key={r.code} className="rounded-xl bg-surface2 p-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
            <span className="font-semibold min-w-[8rem]">{r.name}</span>
            <span className="text-inkDim">부과 누계 <b className="text-ink">{won(r.charged)}</b></span>
            {r.labels.length ? (
              <>
                <span className="text-inkDim">{r.labels.join(", ")}(으)로 옮김 <b className="text-ink">{won(r.moved)}</b></span>
                <span className={"ml-auto font-bold " + (r.left > 0 ? "text-warn" : "text-ok")}>
                  {r.left > 0 ? `아직 안 옮김 ${won(r.left)}원` : r.left < 0 ? `더 옮김 ${won(-r.left)}원` : "모두 옮김 ✓"}
                </span>
              </>
            ) : (
              <span className="ml-auto text-inkDim">별도 통장 없음 · 관리비 통장에 보관 중 <b className="text-ink">{won(r.charged)}원</b></span>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
