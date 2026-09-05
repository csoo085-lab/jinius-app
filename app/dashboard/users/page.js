import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabaseServer";
import UsersManager from "@/components/UsersManager";

export default async function UsersPage() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const { data: me } = await supabase.from("profiles").select("role").eq("id", user.id).single();
  if (me?.role !== "관리자") redirect("/dashboard");

  const { data: profiles } = await supabase.from("profiles").select("*").order("created_at", { ascending: true });
  return <UsersManager profiles={profiles || []} myId={user.id} />;
}
