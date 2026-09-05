"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabaseClient";

const CATEGORIES = ["전기", "소방", "엘리베이터", "기계식주차", "인터넷", "펌프실", "비상발전기실", "급수·배수", "기계·냉난방", "청소", "기타"];
const CYCLES = ["일간", "주간", "월간", "분기", "반기", "연간"];
const SPEC_TEMPLATES = {
  "전기": ["수전용량", "변압기 용량", "계약전력", "한전 고객번호"],
  "소방": ["소화설비 종류", "설치대수", "소방안전관리자", "점검업체"],
  "엘리베이터": ["제조사", "모델명", "정격속도", "정원(인승)", "설치일", "검사유효기간", "유지보수업체"],
  "기계식주차": ["형식(모델)", "제조사", "설치대수", "정기검사 유효기간", "관리업체"],
  "인터넷": ["통신사", "회선 종류", "회선속도", "계약만료일", "고객센터"],
  "펌프실": ["펌프 모델", "용량(마력)", "설치일", "점검주기"],
  "비상발전기실": ["제조사", "모델명", "용량(kW)", "연료종류", "설치일", "점검주기"],
  "급수·배수": ["저수조 용량", "설치일"],
  "기계·냉난방": ["기종", "용량", "설치일"],
  "청소": [], "기타": [],
};

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

  function changeBuilding(id) {
    router.push("/dashboard/inspections?building=" + id);
  }

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

    for (const file of photoFiles) {
      const path = `logs/${log.id}/${Date.now()}_${file.name}`;
      const { error: upErr } = await supabase.storage.from("attachments").upload(path, file);
      if (upErr) { alert("사진 업로드 실패: " + upErr.message); continue; }
      await supabase.from("inspection_photos").insert({ log_id: log.id, storage_path: path });
    }

    setSaving(false);
    setLogItemId(null); setLogNote(""); setLogInspector(""); setPhotoFiles([]); setLogStatus("정상");
    router.refresh();
  }

  return (
    <div>
      <h1 className="font-display font-bold text-xl mb-5">시설점검 관리</h1>
      <div className="card mb-4">
        <label className="text-xs text-inkDim font-medium block mb-1">대상 건물</label>
        <select className="max-w-xs" value={buildingId} onChange={(e) => changeBuilding(e.target.value)}>
          {buildings.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
        </select>
      </div>

      <div className="flex justify-end mb-3">
        <button className="btn" onClick={() => setShowItemForm(true)}>+ 점검 항목 추가</button>
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

function ItemFormModal({ buildingId, item, onClose, onSaved }) {
  const supabase = createClient();
  const isEdit = !!item;
  const [name, setName] = useState(item?.name || "");
  const [category, setCategory] = useState(item?.category || "기타");
  const [location, setLocation] = useState(item?.location || "");
  const [cycle, setCycle] = useState(item?.cycle || "월간");
  const [specs, setSpecs] = useState(item?.specs || []);
  const [saving, setSaving] = useState(false);

  function loadTemplate() {
    const template = SPEC_TEMPLATES[category] || [];
    if (template.length === 0) { alert("이 분류에는 기본 사양 템플릿이 없습니다."); return; }
    const existingKeys = specs.map((s) => s.key);
    const additions = template.filter((k) => !existingKeys.includes(k)).map((k) => ({ key: k, value: "" }));
    setSpecs([...specs, ...additions]);
  }

  async function save() {
    if (!name.trim()) { alert("설비/항목명을 입력해주세요."); return; }
    const cleanSpecs = specs.filter((s) => s.key.trim()).map((s) => ({ key: s.key.trim(), value: s.value.trim() }));
    setSaving(true);
    const payload = { name: name.trim(), category, location: location.trim(), cycle, specs: cleanSpecs };
    const { error } = isEdit
      ? await supabase.from("facility_items").update(payload).eq("id", item.id)
      : await supabase.from("facility_items").insert({ ...payload, building_id: buildingId });
    setSaving(false);
    if (error) { alert("저장 실패: " + error.message); return; }
    onSaved();
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50" onClick={onClose}>
      <div className="bg-surface rounded-xl max-w-md w-full p-5 max-h-[85vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="font-display font-bold mb-4">{isEdit ? "점검 항목 수정" : "점검 항목 추가"}</div>
        <div className="flex flex-col gap-3">
          <input placeholder="설비/항목명 (예: 옥상 급수펌프)" value={name} onChange={(e) => setName(e.target.value)} />
          <select value={category} onChange={(e) => setCategory(e.target.value)}>
            {CATEGORIES.map((c) => <option key={c}>{c}</option>)}
          </select>
          <input placeholder="위치" value={location} onChange={(e) => setLocation(e.target.value)} />
          <select value={cycle} onChange={(e) => setCycle(e.target.value)}>
            {CYCLES.map((c) => <option key={c}>{c}</option>)}
          </select>

          <div className="flex items-center justify-between mt-2">
            <span className="text-xs font-semibold">사양(스펙) 정보</span>
            <button type="button" className="btn-ghost text-xs" onClick={loadTemplate}>카테고리 기본값 불러오기</button>
          </div>
          {specs.length === 0 && <div className="text-xs text-inkDim">등록된 사양이 없습니다.</div>}
          {specs.map((s, idx) => (
            <div key={idx} className="grid grid-cols-[1fr_1fr_28px] gap-2 items-center">
              <input value={s.key} placeholder="항목 (예: 제조사)" onChange={(e) => {
                const next = [...specs]; next[idx] = { ...next[idx], key: e.target.value }; setSpecs(next);
              }} />
              <input value={s.value} placeholder="값" onChange={(e) => {
                const next = [...specs]; next[idx] = { ...next[idx], value: e.target.value }; setSpecs(next);
              }} />
              <button type="button" className="text-danger text-xs" onClick={() => setSpecs(specs.filter((_, i) => i !== idx))}>✕</button>
            </div>
          ))}
          <button type="button" className="btn-ghost text-xs w-fit" onClick={() => setSpecs([...specs, { key: "", value: "" }])}>+ 사양 추가</button>
        </div>
        <div className="flex justify-end gap-2 mt-5">
          <button className="btn-ghost" onClick={onClose}>취소</button>
          <button className="btn" disabled={saving} onClick={save}>{saving ? "저장 중…" : "저장"}</button>
        </div>
      </div>
    </div>
  );
}
