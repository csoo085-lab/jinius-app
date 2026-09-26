"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabaseClient";

function formatDate(d) {
  if (!d) return "";
  return d;
}

function sanitizeFileName(name) {
  return name.replace(/[^\w.\-가-힣]/g, "_");
}

export default function MeetingMinutesManager({ initialMinutes, buildingId, canManage }) {
  const supabase = createClient();
  const router = useRouter();

  const [title, setTitle] = useState("");
  const [meetingDate, setMeetingDate] = useState("");
  const [content, setContent] = useState("");
  const [files, setFiles] = useState([]);
  const [saving, setSaving] = useState(false);
  const [uploadingFor, setUploadingFor] = useState(null);

  async function uploadFilesFor(minuteId, fileList) {
    for (const file of fileList) {
      const path = `meeting/${buildingId}/${minuteId}/${Date.now()}_${sanitizeFileName(file.name)}`;
      const { error: upErr } = await supabase.storage.from("building_docs").upload(path, file);
      if (upErr) { alert(`"${file.name}" 업로드 실패: ` + upErr.message); continue; }
      const fileType = file.type.startsWith("image/") ? "image" : "document";
      await supabase.from("meeting_minute_files").insert({
        minute_id: minuteId,
        building_id: buildingId,
        file_name: file.name,
        storage_path: path,
        file_type: fileType,
      });
    }
  }

  async function addMinute() {
    if (!title.trim()) { alert("제목을 입력해주세요."); return; }
    setSaving(true);
    const { data, error } = await supabase.from("meeting_minutes").insert({
      building_id: buildingId,
      title: title.trim(),
      meeting_date: meetingDate || null,
      content: content.trim(),
    }).select().single();
    if (error) { setSaving(false); alert("등록 실패: " + error.message); return; }

    if (files.length > 0) await uploadFilesFor(data.id, files);

    setSaving(false);
    setTitle(""); setMeetingDate(""); setContent(""); setFiles([]);
    router.refresh();
  }

  async function removeMinute(minute) {
    if (!confirm("이 회의록을 삭제할까요? 첨부된 파일도 함께 삭제됩니다.")) return;
    const paths = (minute.meeting_minute_files || []).map((f) => f.storage_path);
    if (paths.length > 0) await supabase.storage.from("building_docs").remove(paths);
    const { error } = await supabase.from("meeting_minutes").delete().eq("id", minute.id);
    if (error) { alert("삭제 실패: " + error.message); return; }
    router.refresh();
  }

  async function addFilesToExisting(minuteId, fileList) {
    if (!fileList || fileList.length === 0) return;
    setUploadingFor(minuteId);
    await uploadFilesFor(minuteId, Array.from(fileList));
    setUploadingFor(null);
    router.refresh();
  }

  async function removeFile(file) {
    if (!confirm(`"${file.file_name}" 파일을 삭제할까요?`)) return;
    await supabase.storage.from("building_docs").remove([file.storage_path]);
    const { error } = await supabase.from("meeting_minute_files").delete().eq("id", file.id);
    if (error) { alert("삭제 실패: " + error.message); return; }
    router.refresh();
  }

  function publicUrl(path) {
    return supabase.storage.from("building_docs").getPublicUrl(path).data.publicUrl;
  }

  return (
    <div>
      <h1 className="font-display font-bold text-xl mb-5">회의록</h1>

      {canManage && (
        <div className="card mb-4">
          <div className="font-semibold text-sm mb-3">회의록 작성</div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-3">
            <input placeholder="제목 (예: 2026년 3월 정기회의)" value={title} onChange={(e) => setTitle(e.target.value)} />
            <input type="date" value={meetingDate} onChange={(e) => setMeetingDate(e.target.value)} />
          </div>
          <textarea
            placeholder="회의 내용을 입력해주세요."
            value={content}
            onChange={(e) => setContent(e.target.value)}
            rows={6}
            className="w-full mb-3"
          />
          <label className="text-xs text-inkDim font-medium block mb-3">
            사진·문서 첨부
            <input
              type="file"
              multiple
              onChange={(e) => setFiles(Array.from(e.target.files || []))}
              className="block mt-1 text-sm"
            />
            {files.length > 0 && (
              <div className="text-xs text-inkDim mt-1">{files.length}개 파일 선택됨</div>
            )}
          </label>
          <button className="btn" disabled={saving} onClick={addMinute}>{saving ? "등록 중…" : "회의록 등록"}</button>
        </div>
      )}

      <div className="flex flex-col gap-3">
        {(!initialMinutes || initialMinutes.length === 0) && (
          <div className="card text-sm text-inkDim">등록된 회의록이 없습니다.</div>
        )}
        {(initialMinutes || []).map((m) => (
          <div key={m.id} className="card">
            <div className="flex items-start justify-between gap-2">
              <div>
                <div className="font-semibold text-sm">{m.title}</div>
                {m.meeting_date && <div className="text-xs text-inkDim font-mono mt-0.5">{formatDate(m.meeting_date)}</div>}
              </div>
              {canManage && (
                <button onClick={() => removeMinute(m)} className="text-danger text-xs font-medium shrink-0">삭제</button>
              )}
            </div>
            {m.content && <div className="text-sm mt-3 whitespace-pre-wrap">{m.content}</div>}

            {(m.meeting_minute_files || []).length > 0 && (
              <div className="mt-3 pt-3 border-t border-border">
                <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                  {m.meeting_minute_files.map((f) =>
                    f.file_type === "image" ? (
                      <a key={f.id} href={publicUrl(f.storage_path)} target="_blank" rel="noopener noreferrer" className="block group relative">
                        <img src={publicUrl(f.storage_path)} alt={f.file_name} className="w-full h-24 object-cover rounded-lg border border-border" />
                        {canManage && (
                          <button
                            onClick={(e) => { e.preventDefault(); removeFile(f); }}
                            className="absolute top-1 right-1 bg-black/60 text-white text-[10px] rounded px-1.5 py-0.5 opacity-0 group-hover:opacity-100"
                          >
                            ✕
                          </button>
                        )}
                      </a>
                    ) : (
                      <a
                        key={f.id}
                        href={publicUrl(f.storage_path)}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-1 text-xs text-accent underline truncate border border-border rounded-lg px-2 py-1.5 h-24 flex-col justify-center text-center"
                      >
                        <span>📄</span>
                        <span className="truncate w-full">{f.file_name}</span>
                      </a>
                    )
                  )}
                </div>
              </div>
            )}

            {canManage && (
              <label className="text-xs text-accent font-medium mt-3 inline-block cursor-pointer">
                {uploadingFor === m.id ? "업로드 중…" : "+ 파일 추가"}
                <input
                  type="file"
                  multiple
                  className="hidden"
                  onChange={(e) => addFilesToExisting(m.id, e.target.files)}
                />
              </label>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
