// 시설 상세 정보 보기 — 항목을 묶음별 카드로 정리하고, 만료일은 D-day 배지로 강조

// 분류별 묶음 (여기에 없는 항목은 '기타 정보'로 모임)
const SPEC_GROUPS = {
  "엘리베이터": [
    { title: "기본 정보", keys: ["승강기번호", "종류", "제조사", "모델명", "정원(인승)", "적재하중", "정격속도", "운행구간", "운행층수", "설치일", "상태"] },
    { title: "검사", keys: ["최종검사일", "검사유효기간", "정기검사주기", "검사기관", "최근 검사결과"] },
    { title: "유지관리 · 안전", keys: ["유지보수업체", "유지보수업체 연락처", "자체점검업체", "최근 자체점검일", "최근 자체점검결과", "안전관리자", "안전관리자 선임일", "안전관리자 교육 유효기간"] },
    { title: "보험", keys: ["보험사", "보험상품", "보험 보장기간"] },
  ],
};

// 만료일로 보고 D-day를 계산할 항목 (항목명에 이 단어가 들어가면 해당)
const EXPIRY_WORDS = ["유효기간", "보장기간", "만료", "계약만료"];

// "2026-09-05 ~ 2027-09-04" → 마지막 날짜(만료일) 2027-09-04
function lastDate(value) {
  const matches = String(value || "").match(/\d{4}[-.]\d{1,2}[-.]\d{1,2}/g);
  if (!matches) return null;
  const [y, m, d] = matches[matches.length - 1].split(/[-.]/).map(Number);
  const date = new Date(y, m - 1, d);
  return isNaN(date) ? null : date;
}

function daysLeft(date) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Math.round((date - today) / 86400000);
}

function shortLabel(key) {
  return key.replace("안전관리자 교육 유효기간", "안전관리자 교육").replace("보험 보장기간", "보험").replace("검사유효기간", "승강기 검사");
}

export function ExpiryBadges({ specs }) {
  const items = (specs || [])
    .filter((s) => EXPIRY_WORDS.some((w) => s.key.includes(w)))
    .map((s) => ({ key: s.key, date: lastDate(s.value) }))
    .filter((x) => x.date)
    .map((x) => ({ ...x, days: daysLeft(x.date) }))
    .sort((a, b) => a.days - b.days);
  if (items.length === 0) return null;
  return (
    <div className="flex flex-wrap gap-1.5">
      {items.map((x) => {
        const tone = x.days < 0
          ? "bg-danger/10 text-danger border-danger/30"
          : x.days <= 30
            ? "bg-warn/10 text-warn border-warn/30"
            : "bg-ok/10 text-ok border-ok/30";
        const label = x.days < 0 ? `만료 D+${Math.abs(x.days)}` : x.days === 0 ? "오늘 만료" : `D-${x.days}`;
        return (
          <span key={x.key} className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-[11px] font-semibold ${tone}`}>
            {shortLabel(x.key)} <span className="font-mono">{label}</span>
          </span>
        );
      })}
    </div>
  );
}

// 날짜(2026-09-05)가 중간에서 줄바꿈되지 않도록 묶어서 표시
function NoBreakDates({ text }) {
  const parts = String(text).split(/(\d{4}[-.]\d{1,2}[-.]\d{1,2})/);
  return parts.map((p, i) => (i % 2 ? <span key={i} className="whitespace-nowrap">{p}</span> : p));
}

function SpecTile({ label, value }) {
  const empty = !String(value || "").trim();
  return (
    <div className="min-w-0">
      <div className="text-[11px] text-inkDim leading-tight">{label}</div>
      <div className={"text-sm leading-snug break-words " + (empty ? "text-inkDim/50" : "text-ink font-medium")}>
        {empty ? "—" : <NoBreakDates text={value} />}
      </div>
    </div>
  );
}

export default function FacilitySpecView({ category, specs }) {
  const list = (specs || []).filter((s) => s.key?.trim());
  if (list.length === 0) return null;

  const groupsDef = SPEC_GROUPS[category];
  let groups;
  if (groupsDef) {
    const used = new Set();
    groups = groupsDef.map((g) => {
      const items = g.keys.map((k) => list.find((s) => s.key === k)).filter(Boolean);
      items.forEach((s) => used.add(s.key));
      return { title: g.title, items };
    });
    const rest = list.filter((s) => !used.has(s.key));
    if (rest.length) groups.push({ title: "기타 정보", items: rest });
    groups = groups.filter((g) => g.items.length > 0);
  } else {
    groups = [{ title: null, items: list }];
  }

  // 첫 묶음(기본 정보)은 넓게, 나머지는 나란히
  return (
    <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3 mt-3">
      {groups.map((g, gi) => {
        const wide = gi === 0 || groups.length === 1;
        return (
          <section
            key={g.title || gi}
            className={"rounded-lg bg-surface border border-border p-3 break-inside-avoid " + (wide ? "md:col-span-2 xl:col-span-3" : "")}
          >
            {g.title && (
              <div className="text-[11px] font-semibold tracking-wide text-accent mb-2">{g.title}</div>
            )}
            <div className={"grid gap-x-4 gap-y-2.5 " + (wide ? "grid-cols-2 sm:grid-cols-3 lg:grid-cols-4" : "grid-cols-2")}>
              {g.items.map((s) => <SpecTile key={s.key} label={s.key} value={s.value} />)}
            </div>
          </section>
        );
      })}
    </div>
  );
}
