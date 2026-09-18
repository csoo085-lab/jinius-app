import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabaseServer";
import { getCurrentUser } from "@/lib/session";
import RegulationsManager from "@/components/RegulationsManager";

export default async function RegulationsPage() {
  const supabase = createClient();
  const { role } = await getCurrentUser();
  if (!["관리자", "담당자"].includes(role)) redirect("/dashboard");

  const { data: regulations } = await supabase
    .from("regulations")
    .select("*")
    .order("category", { ascending: true })
    .order("effective_date", { ascending: false })
    .order("created_at", { ascending: false });

  const ids = (regulations || []).map((r) => r.id);
  const { data: docs } = ids.length
    ? await supabase.from("regulation_documents").select("regulation_id").in("regulation_id", ids)
    : { data: [] };

  const docCountById = {};
  (docs || []).forEach((d) => {
    docCountById[d.regulation_id] = (docCountById[d.regulation_id] || 0) + 1;
  });

  return <RegulationsManager regulations={regulations || []} docCountById={docCountById} />;
}
