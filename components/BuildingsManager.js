"use client";

import { useState, useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabaseClient";

const ROLES = ["관리자", "담당자", "고객"];
const MEMBER_TYPES = ["임차인", "임대인"];

const BANK_LIST = [
  "KB국민은행", "신한은행", "우리은행", "하나은행", "IBK기업은행",
  "NH농협은행", "SC제일은행", "한국씨티은행", "카카오뱅크", "케이뱅크",
  "토스뱅크", "수협은행", "대구은행(iM뱅크)", "부산은행", "광주은행",
  "제주은행", "전북은행", "경남은행", "새마을금고", "신협",
  "우체국", "산업은행", "수출입은행", "저축은행", "기타",
];

const USAGE_LIST = [
  "업무시설", "오피스텔", "아파트", "도시형생활주택", "공동주택",
  "단독주택", "근린생활시설", "판매시설", "숙박시설", "주차장", "기타",
];

function generateFloorOptions(floorsAbove, floorsBelow) {
  const above = Number(floorsAbove) || 0;
  const below = Number(floorsBelow) || 0;
  const opts = [];
  for (let i = above; i >= 1; i--) opts.push(`${i}층`);
  for (let i = 1; i <= below; i++) opts.push(`지하${i}층`);
  return opts;
}

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
    owner_name: b?.owner_name || "",
    designer_name: b?.designer_name || "",
    supervisor_name: b?.supervisor_name || "",
    contractor_name: b?.contractor_name || "",
    periodic_inspection_required: b?.periodic_inspection_required || false,
    periodic_inspection_valid_until: b?.periodic_inspection_valid_until || "",
    floor_details: Array.isArray(b?.floor_details) ? b.floor_details : [],
    manager_id: b?.manager_id || "",
    unit_gen_settings: {
      dong: b?.unit_gen_settings?.dong || "",
      floorStart: b?.unit_gen_settings?.floorStart || "",
      floorEnd: b?.unit_gen_settings?.floorEnd || "",
      perFloor: b?.unit_gen_settings?.perFloor || "",
      areas: b?.unit_gen_settings?.areas || "",
    },
  };
}

const FIELD_LABELS = [
  ["manager_name", "담당자"],
  ["company_name", "위탁관리업체"], ["company_phone", "문의전화"],
  ["bank_line", "계좌"], ["due_date_text", "납부마감"], ["late_fee_rate", "연체료율"],
  ["land_address", "대지위치"], ["road_address", "도로명주소"],
  ["main_use", "주용도"], ["structure", "주구조"], ["floors_line", "층수"],
  ["total_area", "연면적"], ["approval_date", "사용승인일"], ["unit_summary", "호수/세대수"],
  ["elevator_count", "승강기"], ["parking_info", "주차"],
  ["floor_details_line", "층별현황"],
  ["owner_name", "건축주"], ["designer_name", "설계자"],
  ["supervisor_name", "공사감리자"], ["contractor_name", "시공자"],
  ["periodic_inspection_line", "정기점검"],
];

function buildingSummaryFields(b, staffById = {}) {
  const bankLine = b.bank_name ? `${b.bank_name} ${b.bank_account || ""} ${b.account_holder ? "(" + b.account_holder + ")" : ""}`.trim() : "";
  const floorsLine = (b.floors_above || b.floors_below) ? `지상 ${b.floors_above || 0}층 / 지하 ${b.floors_below || 0}층` : "";
  const floorDetailsLine = Array.isArray(b.floor_details) && b.floor_details.length
    ? (() => {
        const rows = b.floor_details.filter((r) => r.floor || r.usage || r.area);
        const list = rows.map((r) => `${r.floor || "-"} ${r.usage || ""}${r.area ? "(" + Number(r.area).toLocaleString("ko-KR") + "㎡)" : ""}`).join(", ");
        const sum = rows.reduce((acc, r) => acc + (Number(r.area) || 0), 0);
        return sum ? `${list} · 합계 ${sum.toLocaleString("ko-KR")}㎡` : list;
      })()
    : "";
  const inspectionLine = b.periodic_inspection_required
    ? `필요${b.periodic_inspection_valid_until ? " (유효기간: " + b.periodic_inspection_valid_until + ")" : ""}`
    : "불필요";
  const raw = {
    manager_name: b.manager_id ? (staffById[b.manager_id]?.display_name || "알 수 없음") : "",
    company_name: b.company_name, company_phone: b.company_phone, bank_line: bankLine,
    due_date_text: b.due_date_text, late_fee_rate: b.late_fee_rate ? b.late_fee_rate + "%" : "",
    land_address: b.land_address, road_address: b.road_address, main_use: b.main_use, structure: b.structure,
    floors_line: floorsLine, total_area: b.total_area ? b.total_area + "㎡" : "", approval_date: b.approval_date,
    unit_summary: b.unit_summary, elevator_count: b.elevator_count ? b.elevator_count + "대" : "", parking_info: b.parking_info,
    floor_details_line: floorDetailsLine,
    owner_name: b.owner_name, designer_name: b.designer_name,
    supervisor_name: b.supervisor_name, contractor_name: b.contractor_name,
    periodic_inspection_line: inspectionLine,
  };
  return FIELD_LABELS.map(([key, label]) => [label, raw[key]]).filter(([, v]) => v);
}

function RoleMappingCard({ initialSettings }) {
  const supabase = createClient();
  const router = useRouter();
  const getVal = (key, fallback) => initialSettings.find((s) => s.key === key)?.value || fallback;
  const [landlordRole, setLandlordRole] = useState(getVal("role_landlord", "고객"));
  const [tenantRole, setTenantRole] = useState(getVal("role_tenant", "고객"));
  const [saving, setSaving] = useState(false);

  async function save() {
    setSaving(true);
    const { error } = await supabase.from("app_settings").upsert([
      { key: "role_landlord", value: landlordRole },
      { key: "role_tenant", value: tenantRole },
    ]);
    setSaving(false);
    if (error) { alert("저장 실패: " + error.message); return; }
    alert("저장되었습니다.");
    router.refresh();
  }

  return (
    <div className="card mb-4">
      <div className="font-semibold text-sm mb-3">QR코드 가입 시 자동 역할 부여</div>
      <div className="text-xs text-inkDim mb-3">
        등록된 전화번호가 임대인/임차인 중 어느 쪽과 일치하는지에 따라, 가입 시 아래 역할이 자동으로 부여됩니다.
        (활성화는 여전히 관리자 승인이 필요합니다)
      </div>
      <div className="grid grid-cols-2 gap-3">
        <label className="text-xs text-inkDim font-medium">임대인 → 역할
          <select value={landlordRole} onChange={(e) => setLandlordRole(e.target.value)}>
            {ROLES.map((r) => <option key={r} value={r}>{r}</option>)}
          </select>
        </label>
        <label className="text-xs text-inkDim font-medium">임차인 → 역할
          <select value={tenantRole} onChange={(e) => setTenantRole(e.target.value)}>
            {ROLES.map((r) => <option key={r} value={r}>{r}</option>)}
          </select>
        </label>
      </div>
      <div className="flex justify-end mt-3">
        <button type="button" className="btn text-xs" disabled={saving} onClick={save}>{saving ? "저장 중…" : "저장"}</button>
      </div>
    </div>
  );
}

function BuildingQrSection({ building, onRegenerated }) {
  const supabase = createClient();
  const [origin, setOrigin] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setOrigin(window.location.origin);
  }, []);

  const signupUrl = origin ? `${origin}/signup?b=${building.invite_code}` : "";

  async function regenerate() {
    if (!confirm("코드를 재발급하면 기존 QR코드/링크는 더 이상 작동하지 않습니다. 계속할까요?")) return;
    setBusy(true);
    const newCode = Math.random().toString(16).slice(2, 10);
    const { error } = await supabase.from("buildings").update({ invite_code: newCode }).eq("id", building.id);
    setBusy(false);
    if (error) { alert("재발급 실패: " + error.message); return; }
    onRegenerated();
  }

  function copyLink() {
    if (!signupUrl) return;
    navigator.clipboard.writeText(signupUrl).then(() => alert("링크가 복사되었습니다."));
  }

  return (
    <div className="mt-4 pt-4 border-t border-border">
      <div className="font-semibold text-sm mb-2">입주민 가입 QR코드</div>
      {signupUrl && (
        <div className="flex flex-col sm:flex-row gap-4 items-start">
          <img
            src={`https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(signupUrl)}`}
            alt="가입 QR코드"
            className="w-36 h-36 border border-border rounded-lg bg-white p-1"
          />
          <div className="flex-1 min-w-0">
            <div className="text-xs text-inkDim mb-2">이 QR코드를 건물 입구 등에 붙여두면, 입주민이 스캔해서 가입할 수 있습니다.</div>
            <div className="bg-surface2 border border-border rounded-lg px-3 py-2 text-xs font-mono break-all mb-2">{signupUrl}</div>
            <div className="flex gap-2">
              <button type="button" className="btn-ghost text-xs" onClick={copyLink}>링크 복사</button>
              <button type="button" className="btn-ghost text-xs text-danger" disabled={busy} onClick={regenerate}>
                {busy ? "재발급 중…" : "코드 재발급"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function BuildingMembersSection({ buildingId, members, onChanged }) {
  const supabase = createClient();
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [type, setType] = useState("임차인");
  const [adding, setAdding] = useState(false);

  async function addMember() {
    if (!phone.trim()) { alert("전화번호를 입력해주세요."); return; }
    setAdding(true);
    const { error } = await supabase.from("building_members").insert({
      building_id: buildingId,
      name: name.trim(),
      phone: phone.trim(),
      member_type: type,
    });
    setAdding(false);
    if (error) { alert("추가 실패: " + error.message); return; }
    setName(""); setPhone("");
    onChanged();
  }

  async function removeMember(id) {
    if (!confirm("이 입주민 정보를 삭제할까요?")) return;
    const { error } = await supabase.from("building_members").delete().eq("id", id);
    if (error) { alert("삭제 실패: " + error.message); return; }
    onChanged();
  }

  return (
    <div className="mt-4 pt-4 border-t border-border">
      <div className="font-semibold text-sm mb-2">등록된 임대인·임차인 ({members.length}명)</div>
      <div className="text-xs text-inkDim mb-3">여기 등록된 전화번호와 일치해야 QR코드로 가입할 수 있습니다.</div>
      <div className="grid grid-cols-[1fr_1fr_100px_60px] gap-2 items-center mb-3">
        <input placeholder="이름" value={name} onChange={(e) => setName(e.target.value)} />
        <input placeholder="전화번호 (예: 010-1234-5678)" value={phone} onChange={(e) => setPhone(e.target.value)} />
        <select value={type} onChange={(e) => setType(e.target.value)}>
          {MEMBER_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
        </select>
        <button type="button" className="btn text-xs" disabled={adding} onClick={addMember}>추가</button>
      </div>
      {members.length > 0 && (
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs text-inkDim border-b border-borderBright">
              <th className="py-1.5">이름</th>
              <th className="py-1.5">전화번호</th>
              <th className="py-1.5">구분</th>
              <th className="py-1.5"></th>
            </tr>
          </thead>
          <tbody>
            {members.map((m) => (
              <tr key={m.id} className="border-b border-border">
                <td className="py-1.5">{m.name || "-"}</td>
                <td className="py-1.5 font-mono text-xs">{m.phone}</td>
                <td className="py-1.5">
                  <span className="tag">{m.member_type}</span>
                </td>
                <td className="py-1.5 text-right">
                  <button type="button" className="text-danger text-xs" onClick={() => removeMember(m.id)}>삭제</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

export default function BuildingsManager({ initialBuildings, initialExpandedId, initialMembers = [], initialSettings = [], staff = [] }) {
  const supabase = createClient();
  const router = useRouter();
  const [name, setName] = useState("");
  const [loading, setLoading] = useState(false);
  const [editing, setEditing] = useState(null);
  const [expandedId, setExpandedId] = useState(initialExpandedId || null);

  const membersByBuilding = useMemo(() => {
    const map = {};
    initialMembers.forEach((m) => {
      if (!map[m.building_id]) map[m.building_id] = [];
      map[m.building_id].push(m);
    });
    return map;
  }, [initialMembers]);

  const staffById = useMemo(() => {
    const map = {};
    staff.forEach((s) => { map[s.id] = s; });
    return map;
  }, [staff]);

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
      <h1 className="font-display font-bold text-xl mb-5">건물 정보</h1>

      <RoleMappingCard initialSettings={initialSettings} />

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
          const fields = buildingSummaryFields(b, staffById);
          const isExpanded = expandedId === b.id;
          return (
            <div key={b.id} className="card">
              <div
                className="flex items-center justify-between cursor-pointer select-none"
                onClick={() => setExpandedId(isExpanded ? null : b.id)}
              >
                <div className="flex items-center gap-2">
                  <span className="text-inkDim text-xs">{isExpanded ? "▾" : "▸"}</span>
                  <div className="font-semibold text-sm">{b.name}</div>
                  {b.manager_id && staffById[b.manager_id] && (
                    <span className="tag text-[10px]">담당 {staffById[b.manager_id].display_name}</span>
                  )}
                </div>
                <div className="flex gap-2" onClick={(e) => e.stopPropagation()}>
                  <button onClick={() => setEditing(b)} className="text-accent text-xs font-medium">건물 정보 수정</button>
                  <button onClick={() => removeBuilding(b.id)} className="text-danger text-xs font-medium">삭제</button>
                </div>
              </div>
              {isExpanded && (
                <>
                  {fields.length > 0 ? (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mt-4">
                      {fields.map(([label, value]) => (
                        <label key={label} className="text-xs text-inkDim font-medium">
                          {label}
                          <div className="bg-surface2 border border-border rounded-lg px-3 py-2 text-sm text-ink mt-1">
                            {value}
                          </div>
                        </label>
                      ))}
                    </div>
                  ) : (
                    <div className="text-xs text-inkDim mt-3">등록된 상세 정보가 없습니다. &quot;건물 정보 수정&quot;을 눌러 입력하세요.</div>
                  )}
                  <BuildingQrSection building={b} onRegenerated={() => router.refresh()} />
                  <BuildingMembersSection
                    buildingId={b.id}
                    members={membersByBuilding[b.id] || []}
                    onChanged={() => router.refresh()}
                  />
                </>
              )}
            </div>
          );
        })}
      </div>

      {editing && (
        <BuildingEditModal
          building={editing}
          staff={staff}
          onClose={() => setEditing(null)}
          onSaved={() => { setEditing(null); router.refresh(); }}
          onGenerated={() => router.refresh()}
        />
      )}
    </div>
  );
}

function BuildingEditModal({ building, staff = [], onClose, onSaved, onGenerated }) {
  const supabase = createClient();
  const [form, setForm] = useState(emptyForm(building));
  const [bankIsOther, setBankIsOther] = useState(
    !!form.bank_name && !BANK_LIST.includes(form.bank_name)
  );
  const [saving, setSaving] = useState(false);
  const [ugDong, setUgDong] = useState(form.unit_gen_settings.dong);
  const [ugFloorStart, setUgFloorStart] = useState(form.unit_gen_settings.floorStart);
  const [ugFloorEnd, setUgFloorEnd] = useState(form.unit_gen_settings.floorEnd);
  const [ugPerFloor, setUgPerFloor] = useState(form.unit_gen_settings.perFloor);
  const [ugAreas, setUgAreas] = useState(form.unit_gen_settings.areas);
  const [ugBusy, setUgBusy] = useState(false);

  async function generateUnits() {
    const start = parseInt(ugFloorStart, 10);
    const end = parseInt(ugFloorEnd, 10);
    const perFloor = parseInt(ugPerFloor, 10);
    if (!start || !end || end < start) { alert("시작층/끝층을 올바르게 입력해주세요."); return; }
    if (!perFloor || perFloor < 1) { alert("층당 호실 수를 입력해주세요."); return; }

    const areaList = ugAreas.split(",").map((s) => s.trim()).filter((s) => s !== "").map((s) => Number(s));
    if (areaList.length > 0 && areaList.length !== perFloor) {
      if (!confirm(`입력한 면적 개수(${areaList.length}개)가 층당 호실 수(${perFloor}개)와 다릅니다. 부족한 호실은 면적 없이 생성됩니다. 계속할까요?`)) return;
    }

    const dongVal = ugDong.trim();

    setUgBusy(true);
    const { data: existing, error: fetchErr } = await supabase.from("units").select("id").eq("building_id", building.id);
    if (fetchErr) { setUgBusy(false); alert("기존 호실 조회 실패: " + fetchErr.message); return; }

    // 이 건물에 등록된 세대(호실)는 전부 교체 대상입니다.
    const toReplace = existing || [];

    const totalPlanned = (end - start + 1) * perFloor;
    const dongLabel = dongVal ? `${dongVal} ` : "";
    const warnLine = toReplace.length > 0
      ? `\n\n※ 이 건물에 이미 등록된 세대(호실) ${toReplace.length}개(입주 정보 등 포함)가 모두 삭제되고, 새로 생성하는 ${totalPlanned}개로 교체됩니다.`
      : "";
    if (!confirm(`${dongLabel}${start}층~${end}층, 층당 ${perFloor}호실 → 총 ${totalPlanned}개 호실을 생성합니다.${warnLine}\n계속할까요?`)) {
      setUgBusy(false);
      return;
    }

    if (toReplace.length > 0) {
      const { error: delError } = await supabase.from("units").delete().in("id", toReplace.map((u) => u.id));
      if (delError) { setUgBusy(false); alert("기존 호실 삭제 실패: " + delError.message); return; }
    }

    const rows = [];
    for (let floor = start; floor <= end; floor++) {
      for (let i = 1; i <= perFloor; i++) {
        rows.push({ building_id: building.id, dong: dongVal, ho: `${floor * 100 + i}호`, area: areaList[i - 1] || null });
      }
    }
    const { error } = await supabase.from("units").insert(rows);
    if (error) { setUgBusy(false); alert("생성 실패: " + error.message); return; }

    // 다음에 다시 열었을 때도 방금 입력한 값이 남아있도록 건물 정보에 저장해둡니다.
    const settingsToSave = { dong: ugDong, floorStart: ugFloorStart, floorEnd: ugFloorEnd, perFloor: ugPerFloor, areas: ugAreas };
    await supabase.from("buildings").update({ unit_gen_settings: settingsToSave }).eq("id", building.id);
    setForm((f) => ({ ...f, unit_gen_settings: settingsToSave }));

    setUgBusy(false);
    alert(`${rows.length}개 호실이 생성되었습니다.${toReplace.length > 0 ? ` (기존 ${toReplace.length}개는 삭제 후 교체됨)` : ""}\n'세대(호실) 설정' 메뉴에서 확인하세요.`);
    onGenerated?.();
  }

  function set(key, value) { setForm((f) => ({ ...f, [key]: value })); }
  function addFloorRow() {
    setForm((f) => ({ ...f, floor_details: [...f.floor_details, { floor: "", usage: "", area: "" }] }));
  }
  function updateFloorRow(idx, key, value) {
    setForm((f) => ({
      ...f,
      floor_details: f.floor_details.map((row, i) => (i === idx ? { ...row, [key]: value } : row)),
    }));
  }
  function removeFloorRow(idx) {
    setForm((f) => ({ ...f, floor_details: f.floor_details.filter((_, i) => i !== idx) }));
  }

  async function save() {
    setSaving(true);
    const { error } = await supabase.from("buildings").update({
      manager_id: form.manager_id || null,
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
      owner_name: form.owner_name.trim(),
      designer_name: form.designer_name.trim(),
      supervisor_name: form.supervisor_name.trim(),
      contractor_name: form.contractor_name.trim(),
      periodic_inspection_required: !!form.periodic_inspection_required,
      periodic_inspection_valid_until: form.periodic_inspection_valid_until.trim(),
      floor_details: form.floor_details
        .filter((r) => r.floor || r.usage || r.area)
        .map((r) => ({ floor: r.floor.trim(), usage: r.usage.trim(), area: r.area })),
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
          <label className="text-xs text-inkDim font-medium">담당자
            <select value={form.manager_id} onChange={(e) => set("manager_id", e.target.value)}>
              <option value="">미지정</option>
              {staff.map((s) => <option key={s.id} value={s.id}>{s.display_name} ({s.role})</option>)}
            </select>
          </label>
          <label className="text-xs text-inkDim font-medium">위탁관리업체명
            <input value={form.company_name} onChange={(e) => set("company_name", e.target.value)} placeholder="예: 청수빌 위탁관리 지니어스" />
          </label>
          <label className="text-xs text-inkDim font-medium">문의전화
            <input value={form.company_phone} onChange={(e) => set("company_phone", e.target.value)} placeholder="예: 051-504-9998" />
          </label>
          <div className="grid grid-cols-2 gap-3">
            <label className="text-xs text-inkDim font-medium">은행명
              <select
                value={bankIsOther ? "기타" : form.bank_name}
                onChange={(e) => {
                  const v = e.target.value;
                  if (v === "기타") {
                    setBankIsOther(true);
                    set("bank_name", "");
                  } else {
                    setBankIsOther(false);
                    set("bank_name", v);
                  }
                }}
              >
                <option value="">선택</option>
                {BANK_LIST.map((b) => (
                  <option key={b} value={b}>{b}</option>
                ))}
              </select>
              {bankIsOther && (
                <input
                  className="mt-2"
                  value={form.bank_name}
                  onChange={(e) => set("bank_name", e.target.value)}
                  placeholder="은행명 직접 입력"
                />
              )}
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

          <label className="text-xs text-inkDim font-medium">층별 용도/면적</label>
          <div className="flex flex-col gap-2">
            {form.floor_details.map((row, idx) => {
              const floorOptions = generateFloorOptions(form.floors_above, form.floors_below);
              const floorTrim = (row.floor || "").trim();
              const floorSelectVal = floorTrim === "" ? "" : (floorOptions.includes(floorTrim) ? floorTrim : "기타");
              const floorIsOther = floorTrim !== "" && !floorOptions.includes(floorTrim);

              const usageTrim = (row.usage || "").trim();
              const usageSelectVal = usageTrim === "" ? "" : (USAGE_LIST.includes(usageTrim) ? usageTrim : "기타");
              const usageIsOther = usageTrim !== "" && !USAGE_LIST.includes(usageTrim);

              return (
                <div key={idx} className="grid grid-cols-[100px_1fr_120px_28px] gap-2 items-center">
                  <select
                    value={floorSelectVal}
                    onChange={(e) => updateFloorRow(idx, "floor", e.target.value === "기타" ? " " : e.target.value)}
                  >
                    <option value="">층 선택</option>
                    {floorOptions.map((o) => (
                      <option key={o} value={o}>{o}</option>
                    ))}
                    <option value="기타">기타</option>
                  </select>
                  <select
                    value={usageSelectVal}
                    onChange={(e) => updateFloorRow(idx, "usage", e.target.value === "기타" ? " " : e.target.value)}
                  >
                    <option value="">용도 선택</option>
                    {USAGE_LIST.map((u) => (
                      <option key={u} value={u}>{u}</option>
                    ))}
                  </select>
                  <div className="flex items-center gap-1">
                    <input type="number" value={row.area} onChange={(e) => updateFloorRow(idx, "area", e.target.value)} placeholder="0" />
                    <span className="text-xs text-inkDim shrink-0">㎡</span>
                  </div>
                  <button type="button" className="btn-ghost px-2 py-2 text-xs" onClick={() => removeFloorRow(idx)}>✕</button>

                  {floorIsOther && (
                    <input
                      className="col-span-4 -mt-1"
                      value={row.floor === " " ? "" : row.floor}
                      onChange={(e) => updateFloorRow(idx, "floor", e.target.value)}
                      placeholder="층 직접 입력 (예: 옥탑, PH1)"
                    />
                  )}
                  {usageIsOther && (
                    <input
                      className="col-span-4 -mt-1"
                      value={row.usage === " " ? "" : row.usage}
                      onChange={(e) => updateFloorRow(idx, "usage", e.target.value)}
                      placeholder="용도 직접 입력"
                    />
                  )}
                </div>
              );
            })}
            <button type="button" className="btn-ghost self-start text-xs" onClick={addFloorRow}>+ 층 추가</button>
            {form.floor_details.length > 0 && (
              <div className="text-xs text-inkDim text-right pr-9">
                면적 합계: <strong className="text-ink">
                  {form.floor_details.reduce((acc, r) => acc + (Number(r.area) || 0), 0).toLocaleString("ko-KR")}㎡
                </strong>
              </div>
            )}
          </div>

          <div className="text-xs font-semibold text-ink mt-2">호실 자동 생성 → 세대(호실) 설정 반영</div>
          <div className="text-xs text-inkDim -mt-1 mb-1">
            동, 시작층~끝층, 층당 호실 수, 호실별 면적을 입력하면 &quot;301호&quot;(3층 1번째) 형식으로 자동 생성되어 각 건물의 &quot;세대(호실) 설정&quot; 화면에 그대로 반영됩니다. 층 구성은 범위 내 모든 층에 동일하게 적용되며, <strong>생성 버튼을 누르면 이 건물에 기존에 등록된 세대(호실)는 전부 삭제되고 새로 입력한 내용으로 교체</strong>됩니다.
          </div>
          <label className="text-xs text-inkDim font-medium">동 (단일 건물이면 비워두어도 됩니다)
            <input value={ugDong} onChange={(e) => setUgDong(e.target.value)} placeholder="예: 101동" />
          </label>
          <div className="grid grid-cols-2 gap-3">
            <label className="text-xs text-inkDim font-medium">시작층
              <input type="number" value={ugFloorStart} onChange={(e) => setUgFloorStart(e.target.value)} placeholder="예: 3" />
            </label>
            <label className="text-xs text-inkDim font-medium">끝층
              <input type="number" value={ugFloorEnd} onChange={(e) => setUgFloorEnd(e.target.value)} placeholder="예: 15" />
            </label>
          </div>
          <label className="text-xs text-inkDim font-medium">층당 호실 수
            <input type="number" value={ugPerFloor} onChange={(e) => setUgPerFloor(e.target.value)} placeholder="예: 4" />
          </label>
          <label className="text-xs text-inkDim font-medium">각 호실 면적(㎡) — 1번째 호실부터 순서대로, 콤마로 구분
            <input value={ugAreas} onChange={(e) => setUgAreas(e.target.value)} placeholder="예: 59.98,84.92,59.98,114.51" />
          </label>
          <button type="button" className="btn-ghost self-start text-xs" disabled={ugBusy} onClick={generateUnits}>
            {ugBusy ? "생성 중…" : "호실 자동 생성"}
          </button>

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

          <div className="text-xs font-semibold text-ink mt-2">건축주/설계/시공 정보</div>
          <div className="grid grid-cols-2 gap-3">
            <label className="text-xs text-inkDim font-medium">건축주
              <input value={form.owner_name} onChange={(e) => set("owner_name", e.target.value)} />
            </label>
            <label className="text-xs text-inkDim font-medium">설계자
              <input value={form.designer_name} onChange={(e) => set("designer_name", e.target.value)} />
            </label>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <label className="text-xs text-inkDim font-medium">공사감리자
              <input value={form.supervisor_name} onChange={(e) => set("supervisor_name", e.target.value)} />
            </label>
            <label className="text-xs text-inkDim font-medium">시공자
              <input value={form.contractor_name} onChange={(e) => set("contractor_name", e.target.value)} />
            </label>
          </div>

          <div className="text-xs font-semibold text-ink mt-2">건축물 정기점검</div>
          <label className="text-xs text-inkDim font-medium flex items-center gap-2">
            <input
              type="checkbox"
              className="w-auto"
              checked={form.periodic_inspection_required}
              onChange={(e) => set("periodic_inspection_required", e.target.checked)}
            />
            정기점검 필요
          </label>
          {form.periodic_inspection_required && (
            <label className="text-xs text-inkDim font-medium">점검 유효기간
              <input
                value={form.periodic_inspection_valid_until}
                onChange={(e) => set("periodic_inspection_valid_until", e.target.value)}
                placeholder="예: 2024.03.01 ~ 2027.02.28"
              />
            </label>
          )}
        </div>
        <div className="flex justify-end gap-2 mt-5">
          <button className="btn-ghost" onClick={onClose}>취소</button>
          <button className="btn" disabled={saving} onClick={save}>{saving ? "저장 중…" : "저장"}</button>
        </div>
      </div>
    </div>
  );
}
