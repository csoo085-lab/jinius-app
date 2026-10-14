"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabaseClient";
import { prepareUpload, DOC_MAX_SIDE } from "@/lib/uploadUtils";

const ORG_TYPES = ["공공기관", "협력업체", "관공서", "기타"];
const CATEGORIES = [
  "소방안전", "승강기안전", "기계식주차안전", "전기안전", "주차차단기",
  "소독방역", "청소", "보안", "인터넷", "전기요금", "수도요금", "기타",
];
const DOC_TYPES = ["고지서", "점검보고서", "기타"];

function emptyInstitution() {
  return { name: "", org_type: "공공기관", category: CATEGORIES[0], office_phone: "", manager_phone: "", address: "", notes: "" };
}

function PhoneLink({ number }) {
  if (!number) return <span>-</span>;
  return (
    <a href={`tel:${number}`} className="text-accent hover:underline" onClick={(e) => e.stopPropagation()}>
      {number}
    </a>
  );
}

function daysUntil(dateStr) {
  if (!dateStr) return null;
  const d = new Date(dateStr + "T00:00:00");
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Math.round((d - today) / 86400000);
}

function DdayBadge({ dateStr }) {
  if (!dateStr) return <span className="text-inkDim">-</span>;
  const days = daysUntil(dateStr);
  const overdue = days < 0;
  const soon = days <= 30;
  const cls = overdue ? "bg-danger/10 text-danger" : soon ? "bg-warn/10 text-warn" : "bg-surface2 text-inkDim";
  const label = overdue ? `기한초과 D+${Math.abs(days)}` : `D-${days}`;
  return (
    <div className="flex flex-col gap-0.5">
      <span className="font-mono text-[11px] text-inkDim">{dateStr}</span>
      <span className={`tag ${cls}`}>{label}</span>
    </div>
  );
}

export default function InstitutionsManager({ initialInstitutions, buildings, initialLinks }) {
  const supabase = createClient();
  const router = useRouter();
  const [editingInst, setEditingInst] = useState(null);
  const [buildingId, setBuildingId] = useState(buildings[0]?.id || "");
  const [addingLink, setAddingLink] = useState(false);
  const [linkInstitutionId, setLinkInstitutionId] = useState("");
  const [customerNumber, setCustomerNumber] = useState("");
  const [contractInfo, setContractInfo] = useState("");
  const [nextInspectionDate, setNextInspectionDate] = useState("");
  const [inspectionCycleMonths, setInspectionCycleMonths] = useState(12);
  const [docsLink, setDocsLink] = useState(null);
  const [inspectionLink, setInspectionLink] = useState(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [filterOrgType, setFilterOrgType] = useState("전체");

  async function removeInstitution(id) {
    if (!confirm("이 기관·업체를 삭제할까요? 건물별 연결 정보도 함께 삭제됩니다.")) return;
    const { error } = await supabase.from("institutions").delete().eq("id", id);
    if (error) { alert("삭제 실패: " + error.message); return; }
    router.refresh();
  }

  async function addLink() {
    if (!linkInstitutionId) { alert("기관·업체를 선택해주세요."); return; }
    setAddingLink(true);
    const { error } = await supabase.from("building_institutions").insert({
      building_id: buildingId,
      institution_id: linkInstitutionId,
      customer_number: customerNumber.trim(),
      contract_info: contractInfo.trim(),
      next_inspection_date: nextInspectionDate || null,
      inspection_cycle_months: Number(inspectionCycleMonths) || 12,
    });
    setAddingLink(false);
    if (error) { alert("연결 실패: " + error.message); return; }
    setLinkInstitutionId(""); setCustomerNumber(""); setContractInfo(""); setNextInspectionDate(""); setInspectionCycleMonths(12);
    router.refresh();
  }

  async function removeLink(id) {
    if (!confirm("이 연결 정보를 삭제할까요? 첨부된 서류도 함께 삭제됩니다.")) return;
    const { error } = await supabase.from("building_institutions").delete().eq("id", id);
    if (error) { alert("삭제 실패: " + error.message); return; }
    router.refresh();
  }

  const sortedInstitutions = [...initialInstitutions].sort((a, b) => a.name.localeCompare(b.name, "ko"));

  const filteredInstitutions = sortedInstitutions.filter((inst) => {
    if (filterOrgType !== "전체" && inst.org_type !== filterOrgType) return false;
    const term = searchTerm.trim().toLowerCase();
    if (!term) return true;
    return (
      inst.name.toLowerCase().includes(term) ||
      (inst.category || "").toLowerCase().includes(term) ||
      (inst.office_phone || "").includes(term) ||
      (inst.manager_phone || "").includes(term)
    );
  });

  const linksForBuilding = initialLinks.filter((l) => l.building_id === buildingId);
  const linkedInstitutionIds = new Set(linksForBuilding.map((l) => l.institution_id));
  const availableInstitutions = sortedInstitutions.filter((i) => !linkedInstitutionIds.has(i.id));

  return (
    <div>
      <h1 className="font-display font-bold text-xl mb-5">기관·업체</h1>

      <div className="card mb-4">
        <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
          <div className="font-semibold text-sm">공통 기관·업체 목록</div>
          <button className="btn text-xs" onClick={() => setEditingInst("new")}>+ 추가</button>
        </div>

        <div className="flex items-center gap-2 mb-3 flex-wrap">
          <input
            placeholder="이름, 분류, 전화번호로 검색"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="flex-1 min-w-[180px]"
          />
          <select value={filterOrgType} onChange={(e) => setFilterOrgType(e.target.value)} className="w-32">
            <option value="전체">전체</option>
            {ORG_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
        </div>

        {sortedInstitutions.length === 0 ? (
          <div className="text-sm text-inkDim">등록된 기관·업체가 없습니다.</div>
        ) : filteredInstitutions.length === 0 ? (
          <div className="text-sm text-inkDim">검색 결과가 없습니다.</div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-inkDim border-b border-borderBright">
                <th className="py-2">이름</th>
                <th className="py-2">구분</th>
                <th className="py-2">분류</th>
                <th className="py-2">사무실 전화</th>
                <th className="py-2">담당자 전화</th>
                <th className="py-2"></th>
              </tr>
            </thead>
            <tbody>
              {filteredInstitutions.map((inst) => (
                <tr key={inst.id} className="border-b border-border">
                  <td className="py-2">{inst.name}</td>
                  <td className="py-2"><span className="tag">{inst.org_type}</span></td>
                  <td className="py-2 text-inkDim">{inst.category || "-"}</td>
                  <td className="py-2 font-mono text-xs"><PhoneLink number={inst.office_phone} /></td>
                  <td className="py-2 font-mono text-xs"><PhoneLink number={inst.manager_phone} /></td>
                  <td className="py-2 text-right">
                    <button className="text-accent text-xs mr-2" onClick={() => setEditingInst(inst)}>수정</button>
                    <button className="text-danger text-xs" onClick={() => removeInstitution(inst.id)}>삭제</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div className="card">
        <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
          <div className="font-semibold text-sm">건물별 연결 정보</div>
          <select value={buildingId} onChange={(e) => setBuildingId(e.target.value)} className="w-40">
            {buildings.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
          </select>
        </div>

        {buildingId && (
          <>
            <div className="flex flex-col gap-2 mb-4">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                <select value={linkInstitutionId} onChange={(e) => setLinkInstitutionId(e.target.value)}>
                  <option value="">기관·업체 선택</option>
                  {availableInstitutions.map((i) => <option key={i.id} value={i.id}>{i.name}</option>)}
