"use client";

// 월 제목을 누르면 연도·월을 바로 고르는 작은 창 (예: 2026년 8월 → 2025년 9월로 한 번에 이동)
import { useEffect, useRef, useState } from "react";

const thisMonthKST = () => new Date().toLocaleDateString("sv-SE", { timeZone: "Asia/Seoul" }).slice(0, 7);

export default function MonthPick({ month, onChange, children }) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState(null); // 카드 밖으로 잘리지 않게 화면 기준 위치로 띄움
  const [year, setYear] = useState(Number(month.slice(0, 4)));
  const ref = useRef(null);

  useEffect(() => { setYear(Number(month.slice(0, 4))); }, [month, open]);
  useEffect(() => {
    if (!open) return;
    const close = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener("mousedown", close);
    document.addEventListener("touchstart", close);
    const off = () => setOpen(false);
    window.addEventListener("scroll", off, true);
    return () => {
      document.removeEventListener("mousedown", close); document.removeEventListener("touchstart", close);
      window.removeEventListener("scroll", off, true);
    };
  }, [open]);

  const pick = (m) => {
    setOpen(false);
    const next = `${year}-${String(m).padStart(2, "0")}`;
    if (next !== month) onChange(next);
  };
  const cur = thisMonthKST();
  const [sy, sm] = [Number(month.slice(0, 4)), Number(month.slice(5))];

  return (
    <div ref={ref} className="relative inline-block">
      <button type="button" onClick={(e) => {
        const r = e.currentTarget.getBoundingClientRect();
        const w = 256, left = Math.min(Math.max(8, r.left + r.width / 2 - w / 2), window.innerWidth - w - 8);
        setPos({ top: r.bottom + 8, left });
        setOpen(!open);
      }} className="rounded-lg px-2 py-1 hover:bg-surface2" title="눌러서 연도·월 선택">
        {children} <span className="text-inkDim text-xs">▾</span>
      </button>
      {open && (
        <div className="fixed z-50 w-64 rounded-2xl bg-surface p-3 shadow-xl border text-left"
          style={{ borderColor: "rgb(var(--border))", top: pos?.top ?? 80, left: pos?.left ?? 8 }}>
          <div className="flex items-center justify-between mb-2">
            <button type="button" className="btn-ghost text-xs" onClick={() => setYear(year - 1)}>‹</button>
            <div className="font-bold">{year}년</div>
            <button type="button" className="btn-ghost text-xs" onClick={() => setYear(year + 1)}>›</button>
          </div>
          <div className="grid grid-cols-4 gap-1.5">
            {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => {
              const sel = year === sy && m === sm;
              const isNow = `${year}-${String(m).padStart(2, "0")}` === cur;
              return (
                <button key={m} type="button" onClick={() => pick(m)}
                  className={"rounded-lg py-2 text-sm font-semibold " + (sel ? "bg-ink text-white" : isNow ? "bg-accent/10 text-accent" : "hover:bg-surface2")}>
                  {m}월
                </button>
              );
            })}
          </div>
          {month !== cur && (
            <button type="button" className="w-full mt-2 text-xs text-accent underline" onClick={() => { setOpen(false); onChange(cur); }}>
              이번 달로
            </button>
          )}
        </div>
      )}
    </div>
  );
}
