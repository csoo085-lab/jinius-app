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
    <div className="min-h-screen flex">
      <Sidebar role={role} displayName={displayName} loginAt={user.last_sign_in_at} buildings={buildings || []} />
      <main className="flex-1 p-6 pt-20 md:pt-6 overflow-x-hidden">{children}</main>
    </div>
  );
}
