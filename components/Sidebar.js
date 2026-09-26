"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabaseClient";
import { NAV_GROUPS, BUILDING_SUB_ITEMS } from "@/lib/permissions";

function formatDateTime(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}.${pad(d.getMonth() + 1)}.${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function formatElapsed(ms) {
  const totalSec = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  if (h > 0) return `${h}시간 ${m}분 ${s}초`;
  if (m > 0) return `${m}분 ${s}초`;
  return `${s}초`;
}

export default function Sidebar({ role, displayName, loginAt, buildings }) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const router = useRouter();
  const supabase = createClient();
  const [now, setNow] = useState(() => Date.now());
  // null = URL 기준으로 자동 펼침, "" = 사용자가 전부 접음, 그 외 = 사용자가 지정한 건물 ID
  const [manualExpanded, setManualExpanded] = useState(null);
  // 모바일 화면에서 메뉴(사이드바)를 펼쳤는지 여부
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    setMobileOpen(false);
  }, [pathname, searchParams]);

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  async function handleLogout() {
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  }

  const currentBuildingId = searchParams.get("building");
  const isOnBuildingSubpage = BUILDING_SUB_ITEMS.some((i) => i.hrefBase === pathname);
  const autoExpanded = isOnBuildingSubpage ? currentBuildingId : null;
  const expandedBuildingId = manualExpanded !== null ? manualExpanded : autoExpanded;

  function toggleBuilding(id) {
    setManualExpanded(expandedBuildingId === id ? "" : id);
  }

  const buildingSubItemsForRole = BUILDING_SUB_ITEMS.filter((i) => i.roles.includes(role));
  const showBuildingTree = buildingSubItemsForRole.length > 0 && (buildings || []).length > 0;

  const loginTime = loginAt ? new Date(loginAt).getTime() : null;

  return (
    <>
      {/* 모바일 전용 상단 바 (햄버거 버튼) */}
      <div className="md:hidden fixed top-0 inset-x-0 h-14 bg-surface border-b border-border z-40 flex items-center gap-3 px-4 print:hidden">
        <button
          type="button"
          onClick={() => setMobileOpen((v) => !v)}
          aria-label="메뉴 열기/닫기"
          className="w-9 h-9 -ml-1 flex items-center justify-center rounded-lg hover:bg-surface2 shrink-0"
        >
          <svg viewBox="0 0 24 24" className="w-6 h-6" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <line x1="3" y1="6" x2="21" y2="6" />
            <line x1="3" y1="12" x2="21" y2="12" />
            <line x1="3" y1="18" x2="21" y2="18" />
          </svg>
        </button>
        <img src="/jinius_logo.png" alt="지니어스 JINIUS" className="h-6 w-auto" />
      </div>

      {/* 모바일에서 메뉴가 펼쳐졌을 때 배경 어둡게 처리 (클릭하면 닫힘) */}
      {mobileOpen && (
        <div
          className="md:hidden fixed inset-0 bg-black/40 z-40"
          onClick={() => setMobileOpen(false)}
        />
      )}

      <aside
        className={
          "fixed md:static inset-y-0 left-0 z-50 w-64 md:w-56 shrink-0 bg-surface border-r border-border flex flex-col p-4 print:hidden overflow-y-auto transition-transform duration-200 ease-in-out md:translate-x-0 " +
          (mobileOpen ? "translate-x-0" : "-translate-x-full")
        }
      >
      <img src="/jinius_logo.png" alt="지니어스 JINIUS" className="w-32 h-auto mb-4 hidden md:block" />
      <div className="text-xs text-inkDim mb-4">
        {displayName} · <span className="text-accent font-semibold">{role}</span>
      </div>
      <nav className="flex flex-col gap-1 flex-1">
        {NAV_GROUPS.map((group, gi) => {
          const groupItems = group.items.filter((n) => n.roles.includes(role));
          if (groupItems.length === 0) return null;
          return (
            <div key={gi} className={gi > 0 ? "mt-3" : ""}>
              {group.label && (
                <div className="px-3 mb-1 text-[10px] font-semibold text-inkDim/70 tracking-wide">
                  {group.label}
                </div>
              )}
              <div className="flex flex-col gap-1">
                {groupItems.map((item) => (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={
                      "px-3 py-2 rounded-lg text-sm font-medium " +
                      (pathname === item.href ? "bg-surface2 text-ink" : "text-inkDim hover:bg-surface2")
                    }
                  >
                    {item.label}
                  </Link>
                ))}
              </div>
            </div>
          );
        })}

        {showBuildingTree && (
          <div className="mt-3">
            <div className="px-3 mb-1 text-[10px] font-semibold text-inkDim/70 tracking-wide">건물별 업무</div>
            <div className="flex flex-col gap-1">
              {buildings.map((b) => {
                const isExpanded = expandedBuildingId === b.id;
                return (
                  <div key={b.id}>
                    <button
                      onClick={() => toggleBuilding(b.id)}
                      className="w-full flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium text-inkDim hover:bg-surface2 text-left"
                    >
                      <span className="text-[10px] shrink-0">{isExpanded ? "▾" : "▸"}</span>
                      <span className="truncate">{b.name}</span>
                    </button>
                    {isExpanded && (
                      <div className="flex flex-col gap-0.5 ml-4 border-l border-border pl-2 mb-1">
                        {buildingSubItemsForRole.map((item) => {
                          const href = `${item.hrefBase}?building=${b.id}`;
                          const active = pathname === item.hrefBase && currentBuildingId === b.id;
                          return (
                            <Link
                              key={item.hrefBase}
                              href={href}
                              onClick={() => setManualExpanded(b.id)}
                              className={
                                "px-3 py-1.5 rounded-lg text-xs font-medium " +
                                (active ? "bg-surface2 text-ink" : "text-inkDim hover:bg-surface2")
                              }
                            >
                              {item.label}
                            </Link>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </nav>
      {loginTime && (
        <div className="text-[11px] text-inkDim mt-4 leading-relaxed">
          <div>접속일시: {formatDateTime(loginAt)}</div>
          <div>경과시간: {formatElapsed(now - loginTime)}</div>
        </div>
      )}
      <a
        href="https://blog.naver.com/jinius_estate"
        target="_blank"
        rel="noopener noreferrer"
        className="flex items-center gap-2 text-sm text-inkDim hover:text-accent mt-3 pt-3 border-t border-border"
      >
        <span className="w-5 h-5 rounded shrink-0 flex items-center justify-center" style={{ backgroundColor: "#03C75A" }}>
          <svg viewBox="0 0 24 24" className="w-3 h-3" fill="#fff" xmlns="http://www.w3.org/2000/svg">
            <path d="M16.273 12.845 7.376 0H0v24h7.726V11.156L16.624 24H24V0h-7.727v12.845Z" />
          </svg>
        </span>
        지니어스 블로그
      </a>
      <button onClick={handleLogout} className="text-sm text-inkDim hover:text-danger text-left mt-2">
        로그아웃
      </button>
      </aside>
    </>
  );
}
