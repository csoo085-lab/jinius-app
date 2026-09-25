import { createClient } from "@/lib/supabaseServer";
import InstitutionsManager from "@/components/InstitutionsManager";

export default async function InstitutionsPage() {
  const supabase = createClient();
  const [{ data: institutions }, { data: buildings }, { data: links }] = await Promise.all([
    supabase.from("institutions").select("*").order("created_at", { ascending: true }),
    supabase.from("buildings").select("id, name").order("created_at", { ascending: true }),
    supabase
      .from("building_institutions")
      .select("*, institutions(name, org_type, category, phone), buildings(name)")
      .order("created_at", { ascending: true }),
  ]);
  return (
    <InstitutionsManager
      initialInstitutions={institutions || []}
      buildings={buildings || []}
      initialLinks={links || []}
    />
  );
}
