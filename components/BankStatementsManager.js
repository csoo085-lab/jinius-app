"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabaseClient";

function sanitizeFileName(name) {
  return name.replace(/[^\w.\-가-힣]/g, "_");
}

function periodLabel(s) {
  if (!s.period_start && !s.period_end) return "-";
  return `${s.period_start || "-"} ~ ${s.period_end || "-"}`;
}

export default function BankStatementsManager({ initialStatements, buildingId, canManage }) {
  const supabase = createClient();
  const router = useRouter();

  const [periodStart, setPeriodStart] = useState("");
  const [periodEnd, setPeriodEnd] = useState("");
  const [file, setFile] = useState(null);
  const [saving, setSaving] = useState(false);

  function publicUrl(path) {
    return supabase.storage.from("building_docs").getPublicUrl(path).data.publicUrl;
  }

  async function addStatement() {
    if (!file) { alert("업로드할 파일을 선택해주세요."); return; }
    if (!periodStart || !periodEnd) { alert("기간(시작일, 종료일)을 입력해주세요."); return; }
    setSaving(true);
    const path = `bankstatement/${buildingId}/${Date.now()}_${sanitizeFileName(file.name)}`;
    const { error: upErr } = await supabase.storage.from("building_docs").upload(path, file);
    if (upErr) { setSaving(false); alert("업로드 실패: " + upErr.message); return; }

    const { error } = await supabase.from("bank_statements").insert({
      building_id: buildingId,
      period_start: periodStart,
      period_end: periodEnd,
      file_name: file.name,
      storage_path: path,
    });
    setSaving(false);
    if (error) { alert("등록 실패: " + error.message); return; }
    setPeriodStart(""); setPeriodEnd(""); setFile(null);
    router.refresh();
  }

  async function removeStatement(s) {
    if (!confirm(`"${s.file_name}" 통장내역을 삭제할까요?`)) return;
    await supabase.storage.from("building_docs").remove([s.storage_path]);
    const { error } = await supabase.from("bank_statements").delete().eq("id", s.id);
    if (error) { alert("삭제 실패: " + error.message); return; }
    router.refresh();
  }

  return (
    <div>
      <h1 className="font-display font-bold text-xl mb-5">통장내역</h1>

      {canManage && (
        <div className="card mb-4">
          <div className="font-semibold text-sm mb-3">통장내역 업로드</div>
          <div className="grid grid-cols-2 gap-3 mb-3">
            <label className="text-xs text-inkDim font-medium">기간 시작
              <input type="date" value={periodStart} onChange={(e) => setPeriodStart(e.target.value)} />
            </label>
            <label className="text-xs text-inkDim font-medium">기간 종료
              <input type="date" value={periodEnd} onChange={(e) => setPeriodEnd(e.target.value)} />
            </label>
          </div>
          <label className="text-xs text-inkDim font-medium block mb-3">
            파일 (이미지 또는 문서)
            <input type="file" onChange={(e) => setFile(e.target.files?.[0] || null)} className="block mt-1 text-sm" />
          </label>
          <button className="btn" disabled={saving} onClick={addStatement}>{saving ? "업로드 중…" : "등록"}</button>
        </div>
      )}

      <div className="card">
        <div className="font-semibold text-sm mb-3">등록된 통장내역 ({(initialStatements || []).length})</div>
        {(!initialStatements || initialStatements.length === 0) ? (
          <p className="text-sm text-inkDim">등록된 통장내역이 없습니다.</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-inkDim border-b border-borderBright">
                <th className="py-2">기간</th>
                <th className="py-2">파일명</th>
                <th className="py-2">등록일</th>
                <th className="py-2 w-24"></th>
              </tr>
            </thead>
            <tbody>
              {initialStatements.map((s) => (
                <tr key={s.id} className="border-b border-border">
                  <td className="py-2 font-mono text-xs">{periodLabel(s)}</td>
                  <td className="py-2">
                    <a href={publicUrl(s.storage_path)} target="_blank" rel="noopener noreferrer" className="text-accent underline">
                      {s.file_name}
                    </a>
                  </td>
                  <td className="py-2 text-inkDim font-mono text-xs">{new Date(s.created_at).toLocaleDateString()}</td>
                  <td className="py-2 text-right">
                    {canManage && (
                      <button onClick={() => removeStatement(s)} className="text-danger text-xs font-medium">삭제</button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
