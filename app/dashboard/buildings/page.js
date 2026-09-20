import { createClient } from "@/lib/supabaseServer";
import BuildingsManager from "@/components/BuildingsManager";

export default async function BuildingsPage({ searchParams }) {
  const supabase = createClient();
  const [{ data: buildings }, { data: members }, { data: settings }] = await Promise.all([
    supabase.from("buildings").select("*").order("created_at", { ascending: true }),
    supabase.from("building_members").select("*").order("created_at", { ascending: true }),
    supabase.from("app_settings").select("*"),
  ]);
  return (
    <BuildingsManager
      initialBuildings={buildings || []}
      initialMembers={members || []}
      initialSettings={settings || []}
      initialExpandedId={searchParams?.building || null}
    />
  );
}
