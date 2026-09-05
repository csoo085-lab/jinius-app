"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabaseClient";

function emptyForm(b) {
  return {
    company_name: b?.company_name || "",
    company_phone: b?.company_phone || "",
    bank_name: b?.bank_name || "",
    bank_account: b?.bank_account || "",
    account_holder: b?.account_holder || "",
    due_date_text: b?.due_date_text || "",
    late_fee_rate: b?.late_fee_rate ?? 10,
    land_address: b?.land_address || "",
    road_address: b?.road_address || "",
    main_use: b?.main_use || "",
    structure: b?.structure || "",
    floors_above: b?.floors_above || 0,
    floors_below: b?.floors_below || 0,
    total_area: b?.total_area || 0,
    approval_date: b?.approval_date || "",
    unit_summary: b?.unit_summary || "",
    elevator_count: b?.elevator_count || 0,
    parking_info: b?.parking_info || "",
  };
}

const FIELD_LABELS = [
  ["company_name", "위탁관리업체"], ["company_phone", "문의전화"],
  ["bank_line", "계좌"], ["due_date_text", "납부마감"], ["late_fee_rate", "연체료율"],
  ["land_address", "대지위치"], ["road_address", "도로명주소"],
  ["main_use", "주용도"], ["structure", "주구조"], ["floors_line", "층수"],
  ["total_area", "연면적"], ["approval_date", "사용승인일"], ["unit_summary", "호수/세대수"],
  ["elevator_count", "승강기"], ["parking_info", "주차"],
];

function buildingSummaryFields(b) {
  const bankLine = b.bank_name ? `${b.bank_name} ${b.bank_account || ""} ${b.account_holder ? "(" + b.account_holder + ")" : ""}`.trim() : "";
  const floorsLine = (b.floors_above || b.floors_below) ? `지상 ${b.floors_above || 0}층 / 지하 ${b.floors_below || 0}층` : "";
  const raw = {
    company_name: b.company_name, company_phone: b.company_phone, bank_line: bankLine,
    due_date_text: b.due_date_text, late_fee_rate: b.late_fee_rate ? b.late_fee_rate + "%" : "",
    land_address: b.land_address, road_address: b.road_address, main_use: b.main_use, structure: b.structure,
    floors_line: floorsLine, total_area: b.total_area ? b.total_area + "㎡" : "", approval_date: b.approval_date,
    unit_summary: b.unit_summary, elevator_count: b.elevator_count ? b.elevator_count + "대" : "", parking_info: b.parking_info,
  };
  return FIELD_LABELS.map(([key, label]) => [label, raw[key]]).filter(([, v]) => v);
}

export default function BuildingsManager({ initialBuildings }) {
  const supabase = createClient();
  const router = useRouter();
  const [name, setName] = useState("");
  const [loading, setLoading] = useState(false);
  const [editing, setEditing] = useState(null);

  async function addBuilding() {
    if (!name.trim()) return;
    setLoading(true);
    const { error } = await supabase.from("buildings").insert({ name: name.trim() });
    setLoading(false);
    if (error) { alert("추가 실패: " + error.message); return; }
    setName("");
    router.refresh();
  }

  async function removeBuilding(id) {
    if (!confirm("이 건물을 삭제할까요? 관련된 세대·시설·민원·관리비 데이터도 함께 삭제됩니다.")) return;
    const { error } = await supabase.from("buildings").delete().eq("id", id);
    if (error) { alert("삭제 실패: " + error.message); return; }
    router.refresh();
  }

  return (
    <div>
      <h1 className="font-display font-bold text-xl mb-5">건물 설정</h1>
      <div className="card mb-4">
        <div className="flex gap-2">
          <input
            placeholder="건물명 (예: 101동, 관리동, 전체단지)"
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && addBuilding()}
          />
          <button className="btn shrink-0" disabled={loading} onClick={addBuilding}>추가</button>
        </div>
      </div>

      <div className="flex flex-col gap-3">
        {initialBuildings.length === 0 && <div className="card text-sm text-inkDim">등록된 건물이 없습니다. 위에서 추가해주세요.</div>}
        {initialBuildings.map((b) => {
          const fields = buildingSummaryFields(b);
          return (
            <div key={b.id} className="card">
              <div className="flex items-center justify-between">
                <div className="font-semibold text-sm">{b.name}</div>
                <div className="flex gap-2">
                  <button onClick={() => setEditing(b)} className="text-accent text-xs font-medium">건물 정보 수정</button>
                  <button onClick={() => removeBuilding(b.id)} className="text-danger text-xs font-medium">삭제</button>
                </div>
              </div>
              {fields.length > 0 ? (
                <div className="grid grid-cols-2 md:grid-cols-3 gap-x-4 gap-y-1 mt-3">
                  {fields.map(([label, value]) => (
                    <div key={label} className="text-xs text-inkDim"><strong className="text-ink font-medium">{label}</strong>: {value}</div>
                  ))}
                </div>
              ) : (
                <div className="text-xs text-inkDim mt-3">등록된 상세 정보가 없습니다. &quot;건물 정보 수정&quot;을 눌러 입력하세요.</div>
              )}
            </div>
          );
        })}
      </div>

      {editing && (
        <BuildingEditModal
          building={editing}
          onClose={() => setEditing(null)}
          onSaved={() => { setEditing(null); router.refresh(); }}
        />
      )}
    </div>
  );
}

function BuildingEditModal({ building, onClose, onSaved }) {
  const supabase = createClient();
  const [form, setForm] = useState(emptyForm(building));
  const [saving, setSaving] = useState(false);

  function set(key, value) { setForm((f) => ({ ...f, [key]: value })); }

  async function save() {
    setSaving(true);
    const { error } = await supabase.from("buildings").update({
      company_name: form.company_name.trim(),
      company_phone: form.company_phone.trim(),
      bank_name: form.bank_name.trim(),
      bank_account: form.bank_account.trim(),
      account_holder: form.account_holder.trim(),
      due_date_text: form.due_date_text.trim(),
      late_fee_rate: Number(form.late_fee_rate) || 0,
      land_address: form.land_address.trim(),
      road_address: form.road_address.trim(),
      main_use: form.main_use.trim(),
      structure: form.structure.trim(),
      floors_above: Number(form.floors_above) || 0,
      floors_below: Number(form.floors_below) || 0,
      total_area: Number(form.total_area) || 0,
      approval_date: form.approval_date.trim(),
      unit_summary: form.unit_summary.trim(),
      elevator_count: Number(form.elevator_count) || 0,
      parking_info: form.parking_info.trim(),
    }).eq("id", building.id);
    setSaving(false);
    if (error) { alert("저장 실패: " + error.message); return; }
    onSaved();
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50" onClick={onClose}>
      <div className="bg-surface rounded-xl max-w-md w-full p-5 max-h-[85vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="font-display font-bold mb-4">{building.name} · 건물 정보</div>
        <div className="flex flex-col gap-3">
          <label className="text-xs text-inkDim font-medium">위탁관리업체명
            <input value={form.company_name} onChange={(e) => set("company_name", e.target.value)} placeholder="예: 청수빌 위탁관리 지니어스" />
          </label>
          <label className="text-xs text-inkDim font-medium">문의전화
            <input value={form.company_phone} onChange={(e) => set("company_phone", e.target.value)} placeholder="예: 051-504-9998" />
          </label>
          <div className="grid grid-cols-2 gap-3">
            <label className="text-xs text-inkDim font-medium">은행명
              <input value={form.bank_name} onChange={(e) => set("bank_name", e.target.value)} placeholder="예: 카카오뱅크" />
            </label>
            <label className="text-xs text-inkDim font-medium">계좌번호
              <input value={form.bank_account} onChange={(e) => set("bank_account", e.target.value)} placeholder="예: 3333-17-2291391" />
            </label>
          </div>
          <label className="text-xs text-inkDim font-medium">예금주
            <input value={form.account_holder} onChange={(e) => set("account_holder", e.target.value)} placeholder="예: 최수영(청수빌)" />
          </label>
          <label className="text-xs text-inkDim font-medium">납부마감 안내 문구
            <input value={form.due_date_text} onChange={(e) => set("due_date_text", e.target.value)} placeholder="예: 매월 4일까지" />
          </label>
          <label className="text-xs text-inkDim font-medium">연체료율(%)
            <input type="number" value={form.late_fee_rate} onChange={(e) => set("late_fee_rate", e.target.value)} />
          </label>
          <div className="text-xs font-semibold text-ink mt-2">건축물대장 정보</div>
          <label className="text-xs text-inkDim font-medium">대지위치
            <input value={form.land_address} onChange={(e) => set("land_address", e.target.value)} />
          </label>
          <label className="text-xs text-inkDim font-medium">도로명주소
            <input value={form.road_address} onChange={(e) => set("road_address", e.target.value)} />
          </label>
          <div className="grid grid-cols-2 gap-3">
            <label className="text-xs text-inkDim font-medium">주용도
              <input value={form.main_use} onChange={(e) => set("main_use", e.target.value)} placeholder="예: 업무시설" />
            </label>
            <label className="text-xs text-inkDim font-medium">주구조
              <input value={form.structure} onChange={(e) => set("structure", e.target.value)} placeholder="예: 철근콘크리트구조" />
            </label>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <label className="text-xs text-inkDim font-medium">지상층수
              <input type="number" value={form.floors_above} onChange={(e) => set("floors_above", e.target.value)} />
            </label>
            <label className="text-xs text-inkDim font-medium">지하층수
              <input type="number" value={form.floors_below} onChange={(e) => set("floors_below", e.target.value)} />
            </label>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <label className="text-xs text-inkDim font-medium">연면적(㎡)
              <input type="number" value={form.total_area} onChange={(e) => set("total_area", e.target.value)} />
            </label>
            <label className="text-xs text-inkDim font-medium">사용승인일
              <input value={form.approval_date} onChange={(e) => set("approval_date", e.target.value)} placeholder="예: 2019.12.18" />
            </label>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <label className="text-xs text-inkDim font-medium">호수/가구수/세대수
              <input value={form.unit_summary} onChange={(e) => set("unit_summary", e.target.value)} placeholder="예: 28호/0가구/28세대" />
            </label>
            <label className="text-xs text-inkDim font-medium">승강기 대수
              <input type="number" value={form.elevator_count} onChange={(e) => set("elevator_count", e.target.value)} />
            </label>
          </div>
          <label className="text-xs text-inkDim font-medium">주차대수(자주식/기계식)
            <input value={form.parking_info} onChange={(e) => set("parking_info", e.target.value)} placeholder="예: 자주식 3대, 기계식 52대" />
          </label>
        </div>
        <div className="flex justify-end gap-2 mt-5">
          <button className="btn-ghost" onClick={onClose}>취소</button>
          <button className="btn" disabled={saving} onClick={save}>{saving ? "저장 중…" : "저장"}</button>
        </div>
      </div>
    </div>
  );
}
