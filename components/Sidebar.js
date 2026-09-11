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
  const canManageBuildings = BUILDING_SUB_ITEMS.find((i) => i.hrefBase === "/dashboard/buildings")?.roles.includes(role);

  const loginTime = loginAt ? new Date(loginAt).getTime() : null;

  return (
    <aside className="w-56 shrink-0 bg-surface border-r border-border flex flex-col p-4 print:hidden overflow-y-auto">
      <div className="font-display font-bold text-base mb-1">지니어스</div>
      <div className="font-mono text-[10px] text-inkDim mb-4">JINIUS</div>
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

        {(buildings || []).length === 0 && canManageBuildings && (
          <Link
            href="/dashboard/buildings"
            className={
              "px-3 py-2 mt-3 rounded-lg text-sm font-medium " +
              (pathname === "/dashboard/buildings" ? "bg-surface2 text-ink" : "text-inkDim hover:bg-surface2")
            }
          >
            건물 정보 (건물 등록)
          </Link>
        )}

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
      <button onClick={handleLogout} className="text-sm text-inkDim hover:text-danger text-left mt-2">
        로그아웃
      </button>
    </aside>
  );
}
