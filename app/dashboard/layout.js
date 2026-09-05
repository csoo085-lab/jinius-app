import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabaseServer";
import Sidebar from "@/components/Sidebar";

export default async function DashboardLayout({ children }) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("display_name, role")
    .eq("id", user.id)
    .single();

  const role = profile?.role || "고객";
  const displayName = profile?.display_name || user.email;

  return (
    <div className="min-h-screen flex">
      <Sidebar role={role} displayName={displayName} />
      <main className="flex-1 p-6 overflow-x-hidden">{children}</main>
    </div>
  );
}
