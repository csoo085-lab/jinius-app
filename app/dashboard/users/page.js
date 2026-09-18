import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabaseServer";
import { getCurrentUser } from "@/lib/session";
import UsersManager from "@/components/UsersManager";

export default async function UsersPage() {
  const supabase = createClient();
  const { user, role } = await getCurrentUser();
  if (role !== "관리자") redirect("/dashboard");

  const { data: profiles } = await supabase.from("profiles").select("*").order("created_at", { ascending: true });
  return <UsersManager profiles={profiles || []} myId={user.id} />;
}
