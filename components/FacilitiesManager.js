"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabaseClient";

export default function FacilitiesManager({ buildings, buildingId, groups, lastLogByItem, docCountByItem }) {
  const supabase = createClient();
  const router = useRouter();
  const [docsItem, setDocsItem] = useState(null);
  const printRef = useRef(null);

  function changeBuilding(id) {
    router.push("/dashboard/facilities?building=" + id);
  }

  function handlePrint() {
    window.print();
  }

  const buildingName = buildings.find((b) => b.id === buildingId)?.name || "";

  return (
    <div>
      <div className="flex items-center justify-between mb-5 print:hidden">
        <h1 className="font-display font-bold text-xl">시설현황</h1>
        <button className="btn" onClick={handlePrint}>인쇄 / PDF 저장</button>
      </div>

      <div className="card mb-4 print:hidden">
        <label className="text-xs text-inkDim font-medium block mb-1">대상 건물</label>
        <select className="max-w-xs" value={buildingId} onChange={(e) => changeBuilding(e.target.value)}>
          {buildings.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
        </select>
      </div>

      <div ref={printRef}>
        <div className="hidden print:block mb-4">
          <div className="font-display font-bold text-lg">{buildingName} · 시설현황</div>
          <div className="text-xs text-inkDim">{new Date().toLocaleDateString()}</div>
        </div>

        {groups.length === 0 && <div className="card text-sm text-inkDim">등록된 시설 항목이 없습니다.</div>}

        {groups.map((g) => (
          <div key={g.category} className="card mb-4">
            <div className="font-semibold text-sm mb-3">{g.category} <span className="text-inkDim font-normal">({g.items.length})</span></div>
            <div className="flex flex-col gap-2">
              {g.items.map((item) => {
                const lastLog = lastLogByItem[item.id];
                const docCount = docCountByItem[item.id] || 0;
                const specs = item.specs || [];
                return (
                  <div key={item.id} className="bg-surface2 rounded-lg p-3">
                    <div className="flex items-center justify-between flex-wrap gap-2">
                      <div>
                        <div className="font-semibold text-sm">{item.name}</div>
                        <div className="text-xs text-inkDim">{item.location || "위치 미기재"} · 주기 {item.cycle}</div>
                      </div>
                      <div className="flex items-center gap-2 print:hidden">
                        {lastLog ? (
                          <span className={"tag " + (lastLog.status === "정상" ? "border-ok text-ok" : "border-danger text-danger")}>
                            {lastLog.status} · {lastLog.log_date}
                          </span>
                        ) : (
                          <span className="tag border-borderBright text-inkDim">점검 이력 없음</span>
                        )}
                        <button className="btn-ghost text-xs" onClick={() => setDocsItem(item)}>서류 {docCount ? `(${docCount})` : ""}</button>
                      </div>
                    </div>
                    {specs.length > 0 && (
                      <div className="grid grid-cols-2 md:grid-cols-3 gap-x-4 gap-y-0.5 mt-2">
                        {specs.map((s, i) => <div key={i} className="text-xs text-inkDim"><strong className="text-ink font-medium">{s.key}</strong>: {s.value || "-"}</div>)}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      {docsItem && (
        <DocsModal item={docsItem} onClose={() => setDocsItem(null)} onChanged={() => router.refresh()} />
      )}
    </div>
  );
}

function DocsModal({ item, onClose, onChanged }) {
  const supabase = createClient();
  const [docs, setDocs] = useState(null);
  const [uploading, setUploading] = useState(false);

  async function loadDocs() {
    const { data } = await supabase.from("documents").select("*").eq("item_id", item.id).order("created_at", { ascending: false });
    setDocs(data || []);
  }
  if (docs === null) loadDocs();

  async function handleUpload(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    const path = `items/${item.id}/${Date.now()}_${file.name}`;
    const { error: upErr } = await supabase.storage.from("attachments").upload(path, file);
    if (upErr) { setUploading(false); alert("업로드 실패: " + upErr.message); return; }
    await supabase.from("documents").insert({ item_id: item.id, file_name: file.name, storage_path: path, size_bytes: file.size });
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
    if (!confirm("이 서류를 삭제할까요?")) return;
    await supabase.storage.from("attachments").remove([doc.storage_path]);
    await supabase.from("documents").delete().eq("id", doc.id);
    await loadDocs();
    onChanged();
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50" onClick={onClose}>
      <div className="bg-surface rounded-xl max-w-sm w-full p-5" onClick={(e) => e.stopPropagation()}>
        <div className="font-display font-bold mb-4">{item.name} · 첨부 서류</div>
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
