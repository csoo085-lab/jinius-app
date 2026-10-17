import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabaseServer";
import { getCurrentUser } from "@/lib/session";
import Sidebar from "@/components/Sidebar";

export default async function DashboardLayout({ children }) {
  const { user, role, displayName, approved } = await getCurrentUser();
  if (!user) redirect("/login");
  if (!approved) redirect("/pending");

  const supabase = createClient();
  const { data: buildings } = await supabase
    .from("buildings")
    .select("id, name")
    .order("created_at", { ascending: true });

  return (
    <div className="min-h-screen md:flex">
      <Sidebar role={role} displayName={displayName} loginAt={user.last_sign_in_at} buildings={buildings || []} />
      {/* 모바일: 위 상단바(56px)·아래 탭바(64px) 만큼 여백 / PC: 넓은 화면에서도 가운데 정렬 */}
      <main className="flex-1 min-w-0 px-4 pt-[4.5rem] pb-28 md:px-10 md:pt-10 md:pb-12 overflow-x-hidden print:p-0">
        <div className="mx-auto max-w-6xl">{children}</div>
      </main>
    </div>
  );
}
