"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { createClient } from "@/lib/supabaseClient";
import { NAV_ITEMS } from "@/lib/permissions";

export default function Sidebar({ role, displayName }) {
  const pathname = usePathname();
  const router = useRouter();
  const supabase = createClient();

  async function handleLogout() {
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  }

  const items = NAV_ITEMS.filter((n) => n.roles.includes(role));

  return (
    <aside className="w-56 shrink-0 bg-surface border-r border-border flex flex-col p-4 print:hidden">
      <div className="font-display font-bold text-base mb-1">지니어스</div>
      <div className="font-mono text-[10px] text-inkDim mb-4">JINIUS</div>
      <div className="text-xs text-inkDim mb-4">
        {displayName} · <span className="text-accent font-semibold">{role}</span>
      </div>
      <nav className="flex flex-col gap-1 flex-1">
        {items.map((item) => (
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
      </nav>
      <button onClick={handleLogout} className="text-sm text-inkDim hover:text-danger text-left mt-4">
        로그아웃
      </button>
    </aside>
  );
}
