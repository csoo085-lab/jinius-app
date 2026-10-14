"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabaseClient";
import { FACILITY_CATEGORIES, FACILITY_CYCLES, SPEC_TEMPLATES } from "@/lib/facilityConstants";
import { parseElevatorText } from "@/lib/elevatorPaste";

function templateSpecs(category) {
  return (SPEC_TEMPLATES[category] || []).map((k) => ({ key: k, value: "" }));
}

// 사양 값이 하나도 입력되지 않았는지 (= 분류를 바꿀 때 템플릿을 갈아끼워도 되는지)
function isUntouched(specs) {
  return specs.every((s) => !String(s.value || "").trim());
}

/**
 * 시설 항목 추가/수정 모달 (시설현황·시설점검 공용)
 * - item 이 없으면 신규 등록, 있으면 수정
 * - 신규 등록 시 분류를 고르면 해당 분류의 기본 사양 항목이 자동으로 채워짐
 * - onDeleted 를 넘기면 수정 화면에 삭제 버튼이 표시됨
 */
export default function FacilityItemFormModal({ buildingId, item, initialCategory, onClose, onSaved, onDeleted }) {
  const supabase = createClient();
  const isEdit = !!item;
  const startCategory = item?.category || initialCategory || "전기";
  const [name, setName] = useState(item?.name || "");
  const [category, setCategory] = useState(startCategory);
  const [location, setLocation] = useState(item?.location || "");
  const [cycle, setCycle] = useState(item?.cycle || "월간");
  const [specs, setSpecs] = useState(item?.specs?.length ? item.specs : isEdit ? [] : templateSpecs(startCategory));
  const [saving, setSaving] = useState(false);
  const [showPaste, setShowPaste] = useState(false);
  const [pasteMsg, setPasteMsg] = useState("");

  // 승강기정보센터에서 복사한 내용을 분석해 상세 정보 칸에 채움 (같은 항목은 덮어쓰고, 없는 항목은 추가)
  function applyElevatorText(text) {
    const parsed = parseElevatorText(text);
    if (parsed.length === 0) {
      setPasteMsg("읽을 수 있는 승강기 정보가 없습니다. 승강기정보센터 상세 화면을 통째로 복사했는지 확인해주세요.");
      return;
    }
    const next = specs.filter((s) => s.key.trim());
    parsed.forEach(({ key, value }) => {
      const idx = next.findIndex((s) => s.key.trim() === key);
      if (idx >= 0) next[idx] = { ...next[idx], value };
      else next.push({ key, value });
    });
    setSpecs(next);
    setPasteMsg(`${parsed.length}개 항목을 채웠습니다. 내용 확인 후 저장해주세요.`);
    setShowPaste(false);
  }

  function changeCategory(next) {
    setCategory(next);
    // 아직 값을 하나도 안 넣었으면 새 분류의 기본 항목으로 바꿔줌
    if (isUntouched(specs)) setSpecs(templateSpecs(next));
  }

  function loadTemplate() {
    const template = SPEC_TEMPLATES[category] || [];
    if (template.length === 0) { alert("이 분류에는 기본 사양 항목이 없습니다. '+ 항목 추가'로 직접 입력해주세요."); return; }
    const existingKeys = specs.map((s) => s.key);
    const additions = template.filter((k) => !existingKeys.includes(k)).map((k) => ({ key: k, value: "" }));
    if (additions.length === 0) { alert("기본 항목이 이미 모두 들어 있습니다."); return; }
    setSpecs([...specs, ...additions]);
  }

  function updateSpec(idx, field, value) {
    const next = [...specs];
    next[idx] = { ...next[idx], [field]: value };
    setSpecs(next);
  }

  async function save() {
    const finalName = name.trim() || category;
    const cleanSpecs = specs.filter((s) => s.key.trim()).map((s) => ({ key: s.key.trim(), value: s.value.trim() }));
    setSaving(true);
    const payload = { name: finalName, category, location: location.trim(), cycle, specs: cleanSpecs };
    const { error } = isEdit
      ? await supabase.from("facility_items").update(payload).eq("id", item.id)
      : await supabase.from("facility_items").insert({ ...payload, building_id: buildingId });
    setSaving(false);
    if (error) { alert("저장 실패: " + error.message); return; }
    onSaved();
  }

  async function remove() {
    if (!confirm(`'${item.name}' 항목을 삭제할까요?\n점검 기록과 첨부 서류도 함께 삭제됩니다.`)) return;
    setSaving(true);
    const { error } = await supabase.from("facility_items").delete().eq("id", item.id);
    setSaving(false);
    if (error) { alert("삭제 실패: " + error.message); return; }
    onDeleted();
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50" onClick={onClose}>
      <div className="bg-surface rounded-xl max-w-md w-full p-5 max-h-[85vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="font-display font-bold mb-4">{isEdit ? "시설 정보 수정" : "시설 등록"}</div>
        <div className="flex flex-col gap-3">
          <label className="block text-xs font-semibold">분류
            <select className="mt-1" value={category} onChange={(e) => changeCategory(e.target.value)}>
              {FACILITY_CATEGORIES.map((c) => <option key={c}>{c}</option>)}
            </select>
          </label>
          <label className="block text-xs font-semibold">설비명
            <input className="mt-1" placeholder={`비워두면 '${category}'(으)로 저장 (예: 1호기 승강기)`} value={name} onChange={(e) => setName(e.target.value)} />
          </label>
          <div className="grid grid-cols-2 gap-2">
            <label className="block text-xs font-semibold">위치
              <input className="mt-1" placeholder="예: 지하 1층 전기실" value={location} onChange={(e) => setLocation(e.target.value)} />
            </label>
            <label className="block text-xs font-semibold">점검 주기
              <select className="mt-1" value={cycle} onChange={(e) => setCycle(e.target.value)}>
                {FACILITY_CYCLES.map((c) => <option key={c}>{c}</option>)}
              </select>
            </label>
          </div>

          {category === "엘리베이터" && (
            <div className="rounded-lg border border-dashed border-accent p-3 mt-1">
              <div className="flex items-center justify-between gap-2">
                <div className="text-xs">
                  <div className="font-semibold">승강기정보센터 자동 입력</div>
                  <div className="text-inkDim">조회 화면에서 Ctrl+A → Ctrl+C 후 붙여넣기</div>
                </div>
                <button type="button" className="btn text-xs shrink-0" onClick={() => { setShowPaste(!showPaste); setPasteMsg(""); }}>
                  {showPaste ? "닫기" : "붙여넣기"}
                </button>
              </div>
              {showPaste && (
                <textarea
                  className="mt-2 text-xs"
                  rows={4}
                  autoFocus
                  placeholder="여기에 붙여넣으면 바로 입력됩니다 (Ctrl+V)"
                  onPaste={(e) => { e.preventDefault(); applyElevatorText(e.clipboardData.getData("text")); }}
                />
              )}
              {pasteMsg && <div className="text-xs text-accent mt-2">{pasteMsg}</div>}
            </div>
          )}

          <div className="flex items-center justify-between mt-2">
            <span className="text-xs font-semibold">상세 정보</span>
            <button type="button" className="btn-ghost text-xs" onClick={loadTemplate}>기본 항목 불러오기</button>
          </div>
          {specs.length === 0 && <div className="text-xs text-inkDim">입력된 상세 정보가 없습니다.</div>}
          {specs.map((s, idx) => (
            <div key={idx} className="grid grid-cols-[1fr_1.3fr_28px] gap-2 items-center">
              <input value={s.key} placeholder="항목 (예: 제조사)" onChange={(e) => updateSpec(idx, "key", e.target.value)} />
              <input value={s.value} placeholder="내용" onChange={(e) => updateSpec(idx, "value", e.target.value)} />
              <button type="button" className="text-danger text-xs" aria-label="항목 삭제" onClick={() => setSpecs(specs.filter((_, i) => i !== idx))}>✕</button>
            </div>
          ))}
          <button type="button" className="btn-ghost text-xs w-fit" onClick={() => setSpecs([...specs, { key: "", value: "" }])}>+ 항목 추가</button>
        </div>
        <div className="flex items-center justify-between gap-2 mt-5">
          <div>
            {isEdit && onDeleted && (
              <button className="text-danger text-xs font-medium" disabled={saving} onClick={remove}>삭제</button>
            )}
          </div>
          <div className="flex gap-2">
            <button className="btn-ghost" onClick={onClose}>취소</button>
            <button className="btn" disabled={saving} onClick={save}>{saving ? "저장 중…" : "저장"}</button>
          </div>
        </div>
      </div>
    </div>
  );
}
