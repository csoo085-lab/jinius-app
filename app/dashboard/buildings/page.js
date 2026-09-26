import { createClient } from "@/lib/supabaseServer";
import BuildingsManager from "@/components/BuildingsManager";

export default async function BuildingsPage({ searchParams }) {
  const supabase = createClient();
  const [{ data: buildings }, { data: members }, { data: settings }, { data: staff }] = await Promise.all([
    supabase.from("buildings").select("*").order("created_at", { ascending: true }),
    supabase.from("building_members").select("*").order("created_at", { ascending: true }),
    supabase.from("app_settings").select("*"),
    supabase.from("profiles").select("id, display_name, role").in("role", ["관리자", "담당자"]).order("display_name", { ascending: true }),
  ]);
  return (
    <BuildingsManager
      initialBuildings={buildings || []}
      initialMembers={members || []}
      initialSettings={settings || []}
      staff={staff || []}
      initialExpandedId={searchParams?.building || null}
    />
  );
}
