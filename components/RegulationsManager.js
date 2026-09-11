"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabaseClient";

const CATEGORY_LIST = [
  "집합건물의 소유 및 관리에 관한 법률",
  "공동주택관리법",
  "민법",
  "소방시설 설치 및 관리에 관한 법률",
  "화재의 예방 및 안전관리에 관한 법률",
  "승강기 안전관리법",
  "전기안전관리법",
  "기계설비법",
  "건축물관리법",
  "건축법",
  "시설물의 안전 및 유지관리에 관한 특별법",
  "도시가스사업법 / 고압가스 안전관리법",
  "수도법",
  "감염병의 예방 및 관리에 관한 법률",
  "공중위생관리법",
  "하수도법",
  "실내공기질 관리법",
  "폐기물관리법 / 자원재활용법",
  "개인정보 보호법",
  "경비업법",
  "주차장법",
  "중대재해 처벌 등에 관한 법률",
  "산업안전보건법",
  "근로기준법 / 최저임금법",
  "화재로 인한 재해보상과 보험가입에 관한 법률",
  "재난 및 안전관리 기본법",
  "부가가치세법 / 법인세법 / 소득세법",
  "기타",
];

export default function RegulationsManager({ regulations, docCountById }) {
  const supabase = createClient();
  const router = useRouter();
  const [activeCategory, setActiveCategory] = useState("전체");
  const [formModal, setFormModal] = useState(null); // null | "new" | entry
  const [docsEntry, setDocsEntry] = useState(null);

  const categoryCounts = {};
  regulations.forEach((r) => { categoryCounts[r.category] = (categoryCounts[r.category] || 0) + 1; });

  const filtered = activeCategory === "전체" ? regulations : regulations.filter((r) => r.category === activeCategory);

  async function remove(entry) {
    if (!confirm(`"${entry.title}" 항목을 삭제할까요? 첨부된 파일도 함께 삭제됩니다.`)) return;
    const { error } = await supabase.from("regulations").delete().eq("id", entry.id);
    if (error) { alert("삭제 실패: " + error.message); return; }
    router.refresh();
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-5 flex-wrap gap-2">
        <h1 className="font-display font-bold text-xl">법령 자료실</h1>
        <button className="btn" onClick={() => setFormModal("new")}>+ 개정 이력 추가</button>
      </div>

      <div className="flex flex-wrap gap-2 mb-4">
        <button
          onClick={() => setActiveCategory("전체")}
          className={"px-3 py-1.5 rounded-lg text-xs font-medium border " + (activeCategory === "전체" ? "bg-accent text-white border-accent" : "bg-surface2 border-border text-inkDim")}
        >
          전체 ({regulations.length})
        </button>
        {CATEGORY_LIST.map((c) => (
          <button
            key={c}
            onClick={() => setActiveCategory(c)}
            className={"px-3 py-1.5 rounded-lg text-xs font-medium border " + (activeCategory === c ? "bg-accent text-white border-accent" : "bg-surface2 border-border text-inkDim")}
          >
            {c} ({categoryCounts[c] || 0})
          </button>
        ))}
      </div>

      {filtered.length === 0 ? (
        <div className="card text-sm text-inkDim">등록된 법령 개정 이력이 없습니다. &quot;+ 개정 이력 추가&quot;를 눌러 등록하세요.</div>
      ) : (
        <div className="flex flex-col gap-3">
          {filtered.map((r) => {
            const docCount = docCountById[r.id] || 0;
            return (
              <div key={r.id} className="card">
                <div className="flex items-start justify-between flex-wrap gap-2">
                  <div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="tag border-borderBright text-inkDim">{r.category}</span>
                      <span className="font-semibold text-sm">{r.title}</span>
                    </div>
                    {r.effective_date && <div className="text-xs text-inkDim mt-1">시행일: {r.effective_date}</div>}
                    {r.summary && <div className="text-sm mt-2 whitespace-pre-wrap">{r.summary}</div>}
                    {r.source_url && (
                      <a href={r.source_url} target="_blank" rel="noopener noreferrer" className="text-xs text-accent mt-1 inline-block">
                        출처 링크 열기 ↗
                      </a>
                    )}
                    {r.notes && <div className="text-xs text-inkDim mt-1">비고: {r.notes}</div>}
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <button className="btn-ghost text-xs" onClick={() => setDocsEntry(r)}>파일 {docCount ? `(${docCount})` : ""}</button>
                    <button className="text-accent text-xs font-medium" onClick={() => setFormModal(r)}>수정</button>
                    <button className="text-danger text-xs font-medium" onClick={() => remove(r)}>삭제</button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {formModal && (
        <FormModal
          entry={formModal === "new" ? null : formModal}
          defaultCategory={activeCategory !== "전체" ? activeCategory : CATEGORY_LIST[0]}
          onClose={() => setFormModal(null)}
          onSaved={() => { setFormModal(null); router.refresh(); }}
        />
      )}
      {docsEntry && (
        <DocsModal entry={docsEntry} onClose={() => setDocsEntry(null)} onChanged={() => router.refresh()} />
      )}
    </div>
  );
}

function FormModal({ entry, defaultCategory, onClose, onSaved }) {
  const supabase = createClient();
  const isEdit = !!entry;
  const [category, setCategory] = useState(entry?.category || defaultCategory);
  const [title, setTitle] = useState(entry?.title || "");
  const [effectiveDate, setEffectiveDate] = useState(entry?.effective_date || "");
  const [summary, setSummary] = useState(entry?.summary || "");
  const [sourceUrl, setSourceUrl] = useState(entry?.source_url || "");
  const [notes, setNotes] = useState(entry?.notes || "");
  const [saving, setSaving] = useState(false);

  async function save() {
    if (!title.trim()) { alert("제목을 입력해주세요."); return; }
    setSaving(true);
    const payload = {
      category,
      title: title.trim(),
      effective_date: effectiveDate.trim(),
      summary: summary.trim(),
      source_url: sourceUrl.trim(),
      notes: notes.trim(),
    };
    const { error } = isEdit
      ? await supabase.from("regulations").update(payload).eq("id", entry.id)
      : await supabase.from("regulations").insert(payload);
    setSaving(false);
    if (error) { alert("저장 실패: " + error.message); return; }
    onSaved();
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50" onClick={onClose}>
      <div className="bg-surface rounded-xl max-w-md w-full p-5 max-h-[85vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="font-display font-bold mb-4">{isEdit ? "개정 이력 수정" : "개정 이력 추가"}</div>
        <div className="flex flex-col gap-3">
          <label className="text-xs text-inkDim font-medium">법령 분류
            <select value={category} onChange={(e) => setCategory(e.target.value)}>
              {CATEGORY_LIST.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </label>
          <label className="text-xs text-inkDim font-medium">제목
            <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="예: 공동주택관리법 시행령 개정 (제29조)" />
          </label>
          <label className="text-xs text-inkDim font-medium">시행일
            <input value={effectiveDate} onChange={(e) => setEffectiveDate(e.target.value)} placeholder="예: 2026.07.01" />
          </label>
          <label className="text-xs text-inkDim font-medium">개정 내용 요약
            <textarea rows={4} value={summary} onChange={(e) => setSummary(e.target.value)} placeholder="주요 개정 내용을 적어주세요" />
          </label>
          <label className="text-xs text-inkDim font-medium">출처 링크
            <input value={sourceUrl} onChange={(e) => setSourceUrl(e.target.value)} placeholder="예: 국가법령정보센터 URL" />
          </label>
          <label className="text-xs text-inkDim font-medium">비고
            <input value={notes} onChange={(e) => setNotes(e.target.value)} />
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

function DocsModal({ entry, onClose, onChanged }) {
  const supabase = createClient();
  const [docs, setDocs] = useState(null);
  const [uploading, setUploading] = useState(false);

  async function loadDocs() {
    const { data } = await supabase
      .from("regulation_documents")
      .select("*")
      .eq("regulation_id", entry.id)
      .order("created_at", { ascending: false });
    setDocs(data || []);
  }
  if (docs === null) loadDocs();

  async function handleUpload(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    const path = `regulations/${entry.id}/${Date.now()}_${file.name}`;
    const { error: upErr } = await supabase.storage.from("attachments").upload(path, file);
    if (upErr) { setUploading(false); alert("업로드 실패: " + upErr.message); return; }
    await supabase.from("regulation_documents").insert({ regulation_id: entry.id, file_name: file.name, storage_path: path, size_bytes: file.size });
    setUploading(false);
    await loadDocs();
    onChanged();
  }

  async function handleDownload(doc) {
    const { data, error } = await supabase.storage.from("attachments").createSignedUrl(doc.storage_path, 60);
    if (error) { alert("다운로드 링크 생성 실패: " + error.message); return; }
    window.open(data.signedUrl, "_blank");
  }

  async function handleDelete(doc) {
    if (!confirm("이 파일을 삭제할까요?")) return;
    await supabase.storage.from("attachments").remove([doc.storage_path]);
    await supabase.from("regulation_documents").delete().eq("id", doc.id);
    await loadDocs();
    onChanged();
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50" onClick={onClose}>
      <div className="bg-surface rounded-xl max-w-sm w-full p-5 max-h-[85vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="font-display font-bold mb-4">{entry.title} · 첨부 파일</div>
        <label className="btn-ghost inline-flex cursor-pointer mb-4">
          업로드
          <input type="file" className="hidden" onChange={handleUpload} disabled={uploading} />
        </label>
        {docs === null ? (
          <p className="text-sm text-inkDim">불러오는 중…</p>
        ) : docs.length === 0 ? (
          <p className="text-sm text-inkDim">첨부된 파일이 없습니다.</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {docs.map((d) => (
              <li key={d.id} className="flex items-center justify-between bg-surface2 rounded-lg p-2">
                <div className="text-xs">
                  <div className="font-medium">{d.file_name}</div>
                  <div className="text-inkDim">{(d.size_bytes / 1024).toFixed(1)} KB</div>
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
