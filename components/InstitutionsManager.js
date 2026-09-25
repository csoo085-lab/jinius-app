"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabaseClient";

const ORG_TYPES = ["공공기관", "협력업체", "관공서", "기타"];
const DOC_TYPES = ["고지서", "점검보고서", "기타"];

function emptyInstitution() {
  return { name: "", org_type: "공공기관", category: "", office_phone: "", manager_phone: "", address: "", notes: "" };
}

function PhoneLink({ number }) {
  if (!number) return <span>-</span>;
  return (
    <a href={`tel:${number}`} className="text-accent hover:underline" onClick={(e) => e.stopPropagation()}>
      {number}
    </a>
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
  const [docsLink, setDocsLink] = useState(null);

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
    });
    setAddingLink(false);
    if (error) { alert("연결 실패: " + error.message); return; }
    setLinkInstitutionId(""); setCustomerNumber(""); setContractInfo("");
    router.refresh();
  }

  async function removeLink(id) {
    if (!confirm("이 연결 정보를 삭제할까요? 첨부된 서류도 함께 삭제됩니다.")) return;
    const { error } = await supabase.from("building_institutions").delete().eq("id", id);
    if (error) { alert("삭제 실패: " + error.message); return; }
    router.refresh();
  }

  const linksForBuilding = initialLinks.filter((l) => l.building_id === buildingId);
  const linkedInstitutionIds = new Set(linksForBuilding.map((l) => l.institution_id));
  const availableInstitutions = initialInstitutions.filter((i) => !linkedInstitutionIds.has(i.id));

  return (
    <div>
      <h1 className="font-display font-bold text-xl mb-5">기관·업체</h1>

      <div className="card mb-4">
        <div className="flex items-center justify-between mb-3">
          <div className="font-semibold text-sm">공통 기관·업체 목록</div>
          <button className="btn text-xs" onClick={() => setEditingInst("new")}>+ 추가</button>
        </div>
        {initialInstitutions.length === 0 ? (
          <div className="text-sm text-inkDim">등록된 기관·업체가 없습니다.</div>
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
              {initialInstitutions.map((inst) => (
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
            <div className="grid grid-cols-[1fr_1fr_1fr_80px] gap-2 items-center mb-4">
              <select value={linkInstitutionId} onChange={(e) => setLinkInstitutionId(e.target.value)}>
                <option value="">기관·업체 선택</option>
                {availableInstitutions.map((i) => <option key={i.id} value={i.id}>{i.name}</option>)}
              </select>
              <input placeholder="고객번호" value={customerNumber} onChange={(e) => setCustomerNumber(e.target.value)} />
              <input placeholder="계약정보" value={contractInfo} onChange={(e) => setContractInfo(e.target.value)} />
              <button className="btn text-xs" disabled={addingLink} onClick={addLink}>연결</button>
            </div>

            {linksForBuilding.length === 0 ? (
              <div className="text-sm text-inkDim">이 건물에 연결된 기관·업체가 없습니다.</div>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs text-inkDim border-b border-borderBright">
                    <th className="py-2">기관·업체</th>
                    <th className="py-2">사무실 전화</th>
                    <th className="py-2">담당자 전화</th>
                    <th className="py-2">고객번호</th>
                    <th className="py-2">계약정보</th>
                    <th className="py-2"></th>
                  </tr>
                </thead>
                <tbody>
                  {linksForBuilding.map((l) => (
                    <tr key={l.id} className="border-b border-border">
                      <td className="py-2">
                        {l.institutions?.name}
                        <span className="tag ml-1 text-[10px]">{l.institutions?.org_type}</span>
                      </td>
                      <td className="py-2 font-mono text-xs"><PhoneLink number={l.institutions?.office_phone} /></td>
                      <td className="py-2 font-mono text-xs"><PhoneLink number={l.institutions?.manager_phone} /></td>
                      <td className="py-2 font-mono text-xs">{l.customer_number || "-"}</td>
                      <td className="py-2 text-inkDim">{l.contract_info || "-"}</td>
                      <td className="py-2 text-right">
                        <button className="text-accent text-xs mr-2" onClick={() => setDocsLink(l)}>서류</button>
                        <button className="text-danger text-xs" onClick={() => removeLink(l.id)}>삭제</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </>
        )}
      </div>

      {editingInst && (
        <InstitutionModal
          institution={editingInst === "new" ? null : editingInst}
          onClose={() => setEditingInst(null)}
          onSaved={() => { setEditingInst(null); router.refresh(); }}
        />
      )}

      {docsLink && (
        <DocsModal link={docsLink} onClose={() => setDocsLink(null)} onChanged={() => router.refresh()} />
      )}
    </div>
  );
}

function InstitutionModal({ institution, onClose, onSaved }) {
  const supabase = createClient();
  const [form, setForm] = useState(institution ? {
    name: institution.name || "",
    org_type: institution.org_type || "공공기관",
    category: institution.category || "",
    office_phone: institution.office_phone || "",
    manager_phone: institution.manager_phone || "",
    address: institution.address || "",
    notes: institution.notes || "",
  } : emptyInstitution());
  const [saving, setSaving] = useState(false);

  function set(key, value) { setForm((f) => ({ ...f, [key]: value })); }

  async function save() {
    if (!form.name.trim()) { alert("이름을 입력해주세요."); return; }
    setSaving(true);
    const payload = {
      name: form.name.trim(),
      org_type: form.org_type,
      category: form.category.trim(),
      office_phone: form.office_phone.trim(),
      manager_phone: form.manager_phone.trim(),
      address: form.address.trim(),
      notes: form.notes.trim(),
    };
    const { error } = institution
      ? await supabase.from("institutions").update(payload).eq("id", institution.id)
      : await supabase.from("institutions").insert(payload);
    setSaving(false);
    if (error) { alert("저장 실패: " + error.message); return; }
    onSaved();
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50" onClick={onClose}>
      <div className="bg-surface rounded-xl max-w-sm w-full p-5" onClick={(e) => e.stopPropagation()}>
        <div className="font-display font-bold mb-4">{institution ? "기관·업체 수정" : "기관·업체 추가"}</div>
        <div className="flex flex-col gap-3">
          <label className="text-xs text-inkDim font-medium">이름
            <input value={form.name} onChange={(e) => set("name", e.target.value)} placeholder="예: 한국전력공사" />
          </label>
          <label className="text-xs text-inkDim font-medium">구분
            <select value={form.org_type} onChange={(e) => set("org_type", e.target.value)}>
              {ORG_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
          </label>
          <label className="text-xs text-inkDim font-medium">분류
            <input value={form.category} onChange={(e) => set("category", e.target.value)} placeholder="예: 전기, 소방, 승강기" />
          </label>
          <label className="text-xs text-inkDim font-medium">사무실 전화번호
            <input value={form.office_phone} onChange={(e) => set("office_phone", e.target.value)} placeholder="예: 051-123-4567" />
          </label>
          <label className="text-xs text-inkDim font-medium">담당자 전화번호
            <input value={form.manager_phone} onChange={(e) => set("manager_phone", e.target.value)} placeholder="예: 010-1234-5678" />
          </label>
          <label className="text-xs text-inkDim font-medium">주소
            <input value={form.address} onChange={(e) => set("address", e.target.value)} />
          </label>
          <label className="text-xs text-inkDim font-medium">비고
            <input value={form.notes} onChange={(e) => set("notes", e.target.value)} />
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

function DocsModal({ link, onClose, onChanged }) {
  const supabase = createClient();
  const [docs, setDocs] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [docType, setDocType] = useState("고지서");
  const [issuedDate, setIssuedDate] = useState("");

  async function loadDocs() {
    const { data } = await supabase.from("institution_documents").select("*").eq("building_institution_id", link.id).order("created_at", { ascending: false });
    setDocs(data || []);
  }
  if (docs === null) loadDocs();

  async function handleUpload(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    const path = `institutions/${link.id}/${Date.now()}_${file.name}`;
    const { error: upErr } = await supabase.storage.from("attachments").upload(path, file);
    if (upErr) { setUploading(false); alert("업로드 실패: " + upErr.message); return; }
    await supabase.from("institution_documents").insert({
      building_institution_id: link.id,
      doc_type: docType,
      issued_date: issuedDate.trim(),
      file_name: file.name,
      storage_path: path,
      size_bytes: file.size,
    });
    setUploading(false);
    setIssuedDate("");
    await loadDocs();
    onChanged();
  }

  async function handleDownload(doc) {
    const { data, error } = await supabase.storage.from("attachments").createSignedUrl(doc.storage_path, 60);
    if (error) { alert("다운로드 링크 생성 실패: " + error.message); return; }
    window.open(data.signedUrl, "_blank");
  }

  async function handleDelete(doc) {
    if (!confirm("이 서류를 삭제할까요?")) return;
    await supabase.storage.from("attachments").remove([doc.storage_path]);
    await supabase.from("institution_documents").delete().eq("id", doc.id);
    await loadDocs();
    onChanged();
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50" onClick={onClose}>
      <div className="bg-surface rounded-xl max-w-sm w-full p-5" onClick={(e) => e.stopPropagation()}>
        <div className="font-display font-bold mb-4">{link.institutions?.name} · 첨부 서류</div>
        <div className="grid grid-cols-2 gap-2 mb-3">
          <select value={docType} onChange={(e) => setDocType(e.target.value)}>
            {DOC_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
          <input placeholder="발급일 (예: 2026.09)" value={issuedDate} onChange={(e) => setIssuedDate(e.target.value)} />
        </div>
        <label className="btn-ghost inline-flex cursor-pointer mb-4">
          업로드
          <input type="file" className="hidden" onChange={handleUpload} disabled={uploading} />
        </label>
        {docs === null ? (
          <p className="text-sm text-inkDim">불러오는 중…</p>
        ) : docs.length === 0 ? (
          <p className="text-sm text-inkDim">첨부된 서류가 없습니다.</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {docs.map((d) => (
              <li key={d.id} className="flex items-center justify-between bg-surface2 rounded-lg p-2">
                <div className="text-xs">
                  <div className="font-medium">{d.file_name}</div>
                  <div className="text-inkDim">{d.doc_type} {d.issued_date ? `· ${d.issued_date}` : ""} · {(d.size_bytes / 1024).toFixed(1)} KB</div>
                </div>
                <div className="flex gap-2">
                  <button className="text-accent text-xs" onClick={() => handleDownload(d)}>다운로드</button>
                  <button className="text-danger text-xs" onClick={() => handleDelete(d)}>삭제</button>
                </div>
              </li>
            ))}
          </ul>
        )}
        <button className="btn-ghost w-full justify-center mt-4" onClick={onClose}>닫기</button>
      </div>
    </div>
  );
}
