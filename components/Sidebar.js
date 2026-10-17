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
  return `${d.getMonth() + 1}.${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function formatElapsed(ms) {
  const totalMin = Math.max(0, Math.floor(ms / 60000));
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  if (h > 0) return `${h}시간 ${m}분`;
  return `${m}분`;
}

// 메뉴 아이콘 (선 아이콘)
const ICON_PATHS = {
  home: "M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z",
  building: "M4 21V5a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v16M16 9h2a2 2 0 0 1 2 2v10M8 7h4M8 11h4M8 15h4M2 21h20",
  briefcase: "M3 8a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2zM9 6V4h6v2M3 13h18",
  bell: "M6 8a6 6 0 1 1 12 0c0 7 3 8 3 8H3s3-1 3-8M10 20a2 2 0 0 0 4 0",
  wrench: "M14.7 6.3a4 4 0 0 0-5.4 5.2L3 17.8V21h3.2l6.3-6.3a4 4 0 0 0 5.2-5.4l-2.6 2.6-2.5-.6-.6-2.5z",
  receipt: "M6 2h12v20l-3-2-3 2-3-2-3 2zM9 7h6M9 11h6M9 15h4",
  book: "M4 4.5A2.5 2.5 0 0 1 6.5 2H20v17H6.5A2.5 2.5 0 0 0 4 21.5zM4 21.5A2.5 2.5 0 0 1 6.5 19H20v3H6.5",
  users: "M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8M22 21v-2a4 4 0 0 0-3-3.9M16 3.1a4 4 0 0 1 0 7.8",
  wallet: "M3 7a2 2 0 0 1 2-2h14v4M3 7v10a2 2 0 0 0 2 2h16V9H5a2 2 0 0 1-2-2M17 14h.01",
  grid: "M3 3h7v7H3zM14 3h7v7h-7zM3 14h7v7H3zM14 14h7v7h-7z",
  layers: "m12 2 10 5-10 5L2 7zM2 12l10 5 10-5M2 17l10 5 10-5",
  clipboard: "M9 3h6v3H9zM8 5H6a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2M9 13l2 2 4-4",
  gauge: "M12 14l4-4M3.3 17a9 9 0 1 1 17.4 0",
  minutes: "M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8zM14 2v6h6M8 13h8M8 17h5",
  card: "M2 7a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2zM2 10h20M6 15h4",
  menu: "M4 6h16M4 12h16M4 18h16",
  chevron: "m9 6 6 6-6 6",
  logout: "M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9",
};

const HREF_ICON = {
  "/dashboard": "home",
  "/dashboard/buildings": "building",
  "/dashboard/institutions": "briefcase",
  "/dashboard/notices": "bell",
  "/dashboard/complaints": "wrench",
  "/dashboard/fees": "receipt",
  "/dashboard/meeting-minutes": "minutes",
  "/dashboard/bank-statements": "wallet",
  "/dashboard/regulations": "book",
  "/dashboard/users": "users",
  "/dashboard/units": "grid",
  "/dashboard/facilities": "layers",
  "/dashboard/inspections": "clipboard",
  "/dashboard/meters": "gauge",
  "/dashboard/expenses": "card",
};

function Icon({ name, className = "w-5 h-5" }) {
  const d = ICON_PATHS[name];
  if (!d) return null;
  return (
    <svg viewBox="0 0 24 24" className={className + " shrink-0"} fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={d} />
    </svg>
  );
}

// 건물 이름 첫 글자 동그라미 (건물마다 색이 다르게)
const CHIP_COLORS = ["#3182F6", "#03B26C", "#F58B00", "#8B5CF6", "#F04452", "#0EA5E9", "#D946EF", "#14B8A6"];
function BuildingChip({ name, index }) {
  return (
    <span
      className="w-6 h-6 rounded-lg shrink-0 flex items-center justify-center text-[11px] font-bold text-white"
      style={{ backgroundColor: CHIP_COLORS[index % CHIP_COLORS.length] }}
    >
      {(name || "?").slice(0, 1)}
    </span>
  );
}

export default function Sidebar({ role, displayName, loginAt, buildings }) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const router = useRouter();
  const supabase = createClient();
  const [now, setNow] = useState(() => Date.now());
  // null = URL 기준으로 자동 펼침, "" = 사용자가 전부 접음, 그 외 = 사용자가 지정한 건물 ID
  const [manualExpanded, setManualExpanded] = useState(null);
  // 모바일 화면에서 전체 메뉴를 펼쳤는지 여부
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    setMobileOpen(false);
  }, [pathname, searchParams]);

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 30000);
    return () => clearInterval(timer);
  }, []);

  async function handleLogout() {
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  }

  const currentBuildingId = searchParams.get("building");
  const isOnBuildingSubpage = BUILDING_SUB_ITEMS.some((i) => i.hrefBase === pathname);
  const autoExpanded = isOnBuildingSubpage ? currentBuildingId || buildings?.[0]?.id : null;
  const expandedBuildingId = manualExpanded !== null ? manualExpanded : autoExpanded;

  function toggleBuilding(id) {
    setManualExpanded(expandedBuildingId === id ? "" : id);
  }

  const buildingSubItemsForRole = BUILDING_SUB_ITEMS.filter((i) => i.roles.includes(role));
  const showBuildingTree = buildingSubItemsForRole.length > 0 && (buildings || []).length > 0;
  const isManager = role === "관리자" || role === "담당자";

  // 모바일 하단 탭: 관리자·담당자는 현재(또는 첫 번째) 건물 기준으로 바로가기
  const tabBuildingId = currentBuildingId || buildings?.[0]?.id;
  const currentBuilding = (buildings || []).find((b) => b.id === (isOnBuildingSubpage ? tabBuildingId : null));
  const bottomTabs = isManager && tabBuildingId
    ? [
        { href: "/dashboard", label: "홈", icon: "home" },
        { href: `/dashboard/facilities?building=${tabBuildingId}`, base: "/dashboard/facilities", label: "시설", icon: "layers" },
        { href: `/dashboard/complaints?building=${tabBuildingId}`, base: "/dashboard/complaints", label: "민원", icon: "wrench" },
        { href: `/dashboard/fees?building=${tabBuildingId}`, base: "/dashboard/fees", label: "관리비", icon: "receipt" },
      ]
    : [
        { href: "/dashboard", label: "홈", icon: "home" },
        { href: "/dashboard/notices", label: "공지", icon: "bell" },
        { href: "/dashboard/complaints", label: "민원", icon: "wrench" },
        { href: "/dashboard/fees", label: "관리비", icon: "receipt" },
      ];

  const loginTime = loginAt ? new Date(loginAt).getTime() : null;
  const initial = (displayName || "?").slice(0, 1);

  const navLinkClass = (active) =>
    "flex items-center gap-3 px-3 py-2.5 rounded-xl text-[15px] transition-colors " +
    (active ? "bg-accent/10 text-accent font-semibold" : "text-ink/80 font-medium hover:bg-surface2");

  return (
    <>
      {/* 모바일 상단 바 */}
      <header className="md:hidden fixed top-0 inset-x-0 h-14 bg-surface/90 backdrop-blur-md border-b border-border z-40 flex items-center justify-between px-4 print:hidden">
        <Link href="/dashboard" className="flex items-center">
          <img src="/jinius_logo.png" alt="지니어스 JINIUS" className="h-6 w-auto" />
        </Link>
        {currentBuilding && (
          <span className="text-sm font-semibold text-ink truncate max-w-[55%]">{currentBuilding.name}</span>
        )}
      </header>

      {/* 모바일 하단 탭 바 */}
      <nav
        className="md:hidden fixed bottom-0 inset-x-0 z-40 bg-surface/95 backdrop-blur-md border-t border-border grid grid-cols-5 print:hidden"
        style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
      >
        {bottomTabs.map((t) => {
          const base = t.base || t.href;
          const active = pathname === base;
          return (
            <Link key={t.label} href={t.href} className={"flex flex-col items-center justify-center gap-0.5 h-16 text-[11px] font-medium " + (active ? "text-accent" : "text-inkDim")}>
              <Icon name={t.icon} className="w-6 h-6" />
              {t.label}
            </Link>
          );
        })}
        <button
          type="button"
          onClick={() => setMobileOpen(true)}
          className={"flex flex-col items-center justify-center gap-0.5 h-16 text-[11px] font-medium " + (mobileOpen ? "text-accent" : "text-inkDim")}
        >
          <Icon name="menu" className="w-6 h-6" />
          전체
        </button>
      </nav>

      {/* 모바일에서 전체 메뉴가 열렸을 때 뒤 배경 */}
      {mobileOpen && (
        <div className="md:hidden fixed inset-0 bg-black/40 z-40" onClick={() => setMobileOpen(false)} />
      )}

      {/* 사이드 메뉴 (PC는 항상, 모바일은 '전체' 눌렀을 때) */}
      <aside
        className={
          "fixed md:sticky md:top-0 inset-y-0 left-0 z-50 w-[82%] max-w-xs md:w-64 md:h-screen shrink-0 bg-surface md:border-r border-border flex flex-col print:hidden overflow-y-auto transition-transform duration-200 ease-out md:translate-x-0 " +
          (mobileOpen ? "translate-x-0 shadow-2xl" : "-translate-x-full")
        }
      >
        <div className="px-5 pt-6 pb-4">
          <Link href="/dashboard" className="block mb-5">
            <img src="/jinius_logo.png" alt="지니어스 JINIUS" className="w-32 h-auto" />
          </Link>
          <div className="flex items-center gap-3 rounded-2xl bg-surface2 px-3 py-2.5">
            <span className="w-9 h-9 rounded-full bg-accent text-white font-bold flex items-center justify-center shrink-0">{initial}</span>
            <div className="min-w-0">
              <div className="text-sm font-semibold truncate">{displayName}</div>
              <div className="text-xs text-accent font-medium">{role}</div>
            </div>
          </div>
        </div>

        <nav className="flex flex-col gap-0.5 flex-1 px-3 pb-4">
          {NAV_GROUPS.map((group, gi) => {
            const groupItems = group.items.filter((n) => n.roles.includes(role));
            if (groupItems.length === 0) return null;
            return (
              <div key={gi} className={gi > 0 ? "mt-4" : ""}>
                {group.label && <div className="px-3 mb-1.5 text-xs font-semibold text-inkDim">{group.label}</div>}
                <div className="flex flex-col gap-0.5">
                  {groupItems.map((item) => (
                    <Link key={item.href} href={item.href} onClick={() => setMobileOpen(false)} className={navLinkClass(pathname === item.href)}>
                      <Icon name={HREF_ICON[item.href]} />
                      <span className="truncate">{item.label}</span>
                    </Link>
                  ))}
                </div>
              </div>
            );
          })}

          {showBuildingTree && (
            <div className="mt-4">
              <div className="px-3 mb-1.5 text-xs font-semibold text-inkDim flex items-center justify-between">
                <span>건물별 업무</span>
                <span className="text-inkDim/70 font-medium">{buildings.length}</span>
              </div>
              <div className="flex flex-col gap-0.5">
                {buildings.map((b, bi) => {
                  const isExpanded = expandedBuildingId === b.id;
                  const isCurrent = isOnBuildingSubpage && (currentBuildingId || buildings[0]?.id) === b.id;
                  return (
                    <div key={b.id}>
                      <button
                        onClick={() => toggleBuilding(b.id)}
                        className={
                          "w-full flex items-center gap-3 px-3 py-2 rounded-xl text-[15px] text-left transition-colors hover:bg-surface2 " +
                          (isCurrent ? "font-semibold text-ink" : "font-medium text-ink/80")
                        }
                      >
                        <BuildingChip name={b.name} index={bi} />
                        <span className="truncate flex-1">{b.name}</span>
                        <Icon name="chevron" className={"w-4 h-4 text-inkDim transition-transform " + (isExpanded ? "rotate-90" : "")} />
                      </button>
                      {isExpanded && (
                        <div className="flex flex-col gap-0.5 ml-6 pl-3 border-l-2 border-border my-1">
                          {buildingSubItemsForRole.map((item) => {
                            const href = `${item.hrefBase}?building=${b.id}`;
                            const active = pathname === item.hrefBase && (currentBuildingId || buildings[0]?.id) === b.id;
                            return (
                              <Link
                                key={item.hrefBase}
                                href={href}
                                onClick={() => { setManualExpanded(b.id); setMobileOpen(false); }}
                                className={
                                  "flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm transition-colors " +
                                  (active ? "bg-accent/10 text-accent font-semibold" : "text-inkDim font-medium hover:bg-surface2 hover:text-ink")
                                }
                              >
                                <Icon name={HREF_ICON[item.hrefBase]} className="w-4 h-4" />
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

        <div className="px-3 pb-5 pt-3 border-t border-border flex flex-col gap-0.5">
          <a
            href="https://blog.naver.com/jinius_estate"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium text-ink/80 hover:bg-surface2"
          >
            <span className="w-5 h-5 rounded-md shrink-0 flex items-center justify-center" style={{ backgroundColor: "#03C75A" }}>
              <svg viewBox="0 0 24 24" className="w-3 h-3" fill="#fff" xmlns="http://www.w3.org/2000/svg">
                <path d="M16.273 12.845 7.376 0H0v24h7.726V11.156L16.624 24H24V0h-7.727v12.845Z" />
              </svg>
            </span>
            지니어스 블로그
          </a>
          <button onClick={handleLogout} className="flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium text-ink/80 hover:bg-surface2 hover:text-danger text-left">
            <Icon name="logout" />
            로그아웃
          </button>
          {loginTime && (
            <div className="px-3 pt-2 text-[11px] text-inkDim">
              {formatDateTime(loginAt)} 접속 · {formatElapsed(now - loginTime)} 경과
            </div>
          )}
        </div>
      </aside>
    </>
  );
}
