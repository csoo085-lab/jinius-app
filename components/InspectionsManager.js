"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabaseClient";
import { prepareUpload } from "@/lib/uploadUtils";
import ItemFormModal from "@/components/FacilityItemForm";

export default function InspectionsManager({ buildings, buildingId, items, logsByItem }) {
  const supabase = createClient();
  const router = useRouter();
  const [showItemForm, setShowItemForm] = useState(false);
  const [editingItem, setEditingItem] = useState(null);
  const [logItemId, setLogItemId] = useState(null);
  const [logStatus, setLogStatus] = useState("정상");
  const [logNote, setLogNote] = useState("");
  const [logInspector, setLogInspector] = useState("");
  const [photoFiles, setPhotoFiles] = useState([]);
  const [saving, setSaving] = useState(false);

  async function removeItem(id) {
    if (!confirm("이 항목을 삭제할까요? 관련 점검 기록도 함께 삭제됩니다.")) return;
    const { error } = await supabase.from("facility_items").delete().eq("id", id);
    if (error) { alert("삭제 실패: " + error.message); return; }
    router.refresh();
  }

  async function saveLog() {
    setSaving(true);
    const { data: log, error } = await supabase
      .from("inspection_logs")
      .insert({ item_id: logItemId, status: logStatus, note: logNote.trim(), inspector: logInspector.trim() })
      .select()
      .single();
    if (error) { setSaving(false); alert("저장 실패: " + error.message); return; }

    for (const original of photoFiles) {
      const { file, storageName } = await prepareUpload(original);
      const path = `logs/${log.id}/${storageName}`;
      const { error: upErr } = await supabase.storage.from("attachments").upload(path, file);
      if (upErr) { alert(`"${original.name}" 사진 업로드 실패: ` + upErr.message); continue; }
      await supabase.from("inspection_photos").insert({ log_id: log.id, storage_path: path });
    }

    setSaving(false);
    setLogItemId(null); setLogNote(""); setLogInspector(""); setPhotoFiles([]); setLogStatus("정상");
    router.refresh();
  }

  return (
    <div>
      <h1 className="font-display font-bold text-xl mb-5">
        시설점검 관리 <span className="text-inkDim font-normal text-base">· {buildings.find((b) => b.id === buildingId)?.name}</span>
      </h1>

      <div className="flex justify-end mb-3">
        <button className="btn" onClick={() => setShowItemForm(true)}>+ 시설 등록</button>
      </div>

      <div className="flex flex-col gap-3">
        {items.length === 0 && <div className="card text-sm text-inkDim">등록된 점검 항목이 없습니다.</div>}
        {items.map((item) => {
          const logs = logsByItem[item.id] || [];
          const last = logs[0];
          const specs = item.specs || [];
          return (
            <div key={item.id} className="card">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <div>
                  <div className="font-semibold text-sm">{item.name} <span className="tag border-borderBright text-inkDim ml-1">{item.category}</span></div>
                  <div className="text-xs text-inkDim mt-1">
                    {item.location || "위치 미기재"} · 주기 {item.cycle}
                    {last && <> · 최근: {last.log_date} ({last.status})</>}
                  </div>
                  {specs.length > 0 && (
                    <div className="grid grid-cols-2 md:grid-cols-3 gap-x-4 gap-y-0.5 mt-2">
                      {specs.map((s, i) => <div key={i} className="text-xs text-inkDim"><strong className="text-ink font-medium">{s.key}</strong>: {s.value || "-"}</div>)}
                    </div>
                  )}
                </div>
                <div className="flex gap-2">
                  <button className="btn-ghost text-xs" onClick={() => setEditingItem(item)}>사양 편집</button>
                  <button className="btn-ghost text-xs" onClick={() => setLogItemId(logItemId === item.id ? null : item.id)}>점검 기록</button>
                  <button onClick={() => removeItem(item.id)} className="text-danger text-xs font-medium">삭제</button>
                </div>
              </div>

              {logItemId === item.id && (
                <div className="mt-4 border-t border-border pt-4">
                  <div className="grid grid-cols-2 gap-3 mb-3">
                    <input placeholder="점검자" value={logInspector} onChange={(e) => setLogInspector(e.target.value)} />
                    <select value={logStatus} onChange={(e) => setLogStatus(e.target.value)}>
                      <option>정상</option><option>이상</option>
                    </select>
                  </div>
                  <textarea placeholder="비고" rows={2} value={logNote} onChange={(e) => setLogNote(e.target.value)} className="mb-3" />
                  <input type="file" accept="image/*" capture="environment" multiple
                    onChange={(e) => setPhotoFiles(Array.from(e.target.files))} className="mb-3 text-xs" />
                  <button className="btn" disabled={saving} onClick={saveLog}>{saving ? "저장 중…" : "기록 저장"}</button>
                </div>
              )}

              {logs.length > 0 && (
                <details className="mt-3">
                  <summary className="text-xs text-inkDim cursor-pointer">점검 이력 {logs.length}건 보기</summary>
                  <ul className="mt-2 flex flex-col gap-1">
                    {logs.map((l) => (
                      <li key={l.id} className="text-xs flex justify-between border-b border-border py-1">
                        <span>{l.log_date} · {l.inspector || "-"} · {l.note || ""}</span>
                        <span className={l.status === "정상" ? "text-ok" : "text-danger"}>{l.status}</span>
                      </li>
                    ))}
                  </ul>
                </details>
              )}
            </div>
          );
        })}
      </div>

      {showItemForm && (
        <ItemFormModal buildingId={buildingId} item={null} onClose={() => setShowItemForm(false)} onSaved={() => { setShowItemForm(false); router.refresh(); }} />
      )}
      {editingItem && (
        <ItemFormModal buildingId={buildingId} item={editingItem} onClose={() => setEditingItem(null)} onSaved={() => { setEditingItem(null); router.refresh(); }} />
      )}
    </div>
  );
}
