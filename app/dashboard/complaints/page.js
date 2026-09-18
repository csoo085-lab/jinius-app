import { createClient } from "@/lib/supabaseServer";
import { getCurrentUser } from "@/lib/session";
import ComplaintsManager from "@/components/ComplaintsManager";

export default async function ComplaintsPage() {
  const supabase = createClient();
  const { user, role } = await getCurrentUser();

  const [{ data: buildings }, { data: complaints }] = await Promise.all([
    supabase.from("buildings").select("*").order("created_at", { ascending: true }),
    supabase.from("complaints").select("*").order("received_date", { ascending: false }),
  ]);

  return (
    <ComplaintsManager buildings={buildings || []} complaints={complaints || []} role={role} myId={user.id} />
  );
}
