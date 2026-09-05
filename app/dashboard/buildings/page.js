import { createClient } from "@/lib/supabaseServer";
import BuildingsManager from "@/components/BuildingsManager";

export default async function BuildingsPage() {
  const supabase = createClient();
  const { data } = await supabase.from("buildings").select("*").order("created_at", { ascending: true });
  return <BuildingsManager initialBuildings={data || []} />;
}
