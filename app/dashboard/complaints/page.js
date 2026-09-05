import { createClient } from "@/lib/supabaseServer";
import ComplaintsManager from "@/components/ComplaintsManager";

export default async function ComplaintsPage() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const { data: me } = await supabase.from("profiles").select("role").eq("id", user.id).single();
  const role = me?.role || "고객";

  const { data: buildings } = await supabase.from("buildings").select("*").order("created_at", { ascending: true });
  const { data: complaints } = await supabase.from("complaints").select("*").order("received_date", { ascending: false });

  return (
    <ComplaintsManager buildings={buildings || []} complaints={complaints || []} role={role} myId={user.id} />
  );
}
