"use client";

import { Fragment, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabaseClient";
import { prepareUpload, DOC_MAX_SIDE } from "@/lib/uploadUtils";

const NAVY = "#1f2a44";
const MEETING_TYPES = ["관리위원회", "관리단집회", "임시회의", "기타"];
const RESULTS = ["가결", "부결", "보류", "보고"];
// 결재란 칸 수에 따른 기본 이름 (직접 바꿀 수 있음)
const DEFAULT_BOXES = {
  1: ["승인"],
  2: ["작성", "승인"],
  3: ["담당", "관리인", "위원장"],
  4: ["담당", "검토", "관리인", "위원장"],
  5: ["담당", "검토", "관리인", "감사", "위원장"],
  6: ["담당", "검토", "관리인", "감사", "부위원장", "위원장"],
};
const BOX_KEY = "jinius_minutes_boxes"; // 마지막으로 쓴 결재란을 이 브라우저에 기억

const todayKST = () => new Date().toLocaleDateString("sv-SE", { timeZone: "Asia/Seoul" });
const emptyAgenda = () => ({ title: "", content: "", decision: "", result: "가결", vote_for: "", vote_against: "", vote_abstain: "" });
const splitNames = (s) => (s || "").split(/[,\n、·]/).map((x) => x.trim()).filter(Boolean);

function koDate(iso) {
  if (!iso) return "";
  const d = new Date(iso + "T00:00:00");
  const days = ["일", "월", "화", "수", "목", "금", "토"];
  return `${d.getFullYear()}년 ${d.getMonth() + 1}월 ${d.getDate()}일 (${days[d.getDay()]})`;
}

function loadBoxes() {
  try { const v = JSON.parse(localStorage.getItem(BOX_KEY) || "null"); if (Array.isArray(v) && v.length) return v; } catch {}
  return DEFAULT_BOXES[3];
}

function newForm() {
  return {
    meeting_type: "관리위원회", session_no: "", title: "", meeting_date: todayKST(), start_time: "", end_time: "",
    place: "", total_members: "", present_count: "", attendees: "", absentees: "", writer: "",
    agenda: [emptyAgenda()], notes: "", content: "", approval_boxes: loadBoxes(), sign_table: true, expense_related: false,
  };
}

function autoTitle(f) {
  const y = (f.meeting_date || todayKST()).slice(0, 4);
  return `${y}년 ${f.session_no ? f.session_no + " " : ""}${f.meeting_type === "기타" ? "" : f.meeting_type + " "}회의록`.replace(/\s+/g, " ").trim();
}

export default function MeetingMinutesManager({ initialMinutes, buildingId, buildingName = "", canManage, linksByMinute = {} }) {
  const supabase = createClient();
  const router = useRouter();
  const [editing, setEditing] = useState(null); // null | { id?, form }
  const [printing, setPrinting] = useState(null);
  const [uploadingFor, setUploadingFor] = useState(null);

  async function uploadFilesFor(minuteId, fileList) {
    for (const original of Array.from(fileList)) {
      const { file, storageName, displayName } = await prepareUpload(original, { maxSide: DOC_MAX_SIDE });
      const path = `meeting/${buildingId}/${minuteId}/${storageName}`;
      const { error: upErr } = await supabase.storage.from("building_docs").upload(path, file);
      if (upErr) { alert(`"${displayName}" 업로드 실패: ` + upErr.message); continue; }
      const fileType = file.type.startsWith("image/") ? "image" : "document";
      await supabase.from("meeting_minute_files").insert({
        minute_id: minuteId, building_id: buildingId, file_name: displayName, storage_path: path, file_type: fileType,
      });
    }
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

  const publicUrl = (path) => supabase.storage.from("building_docs").getPublicUrl(path).data.publicUrl;

  function openEdit(m) {
    setEditing({
      id: m.id,
      form: {
        meeting_type: m.meeting_type || "기타", session_no: m.session_no || "", title: m.title || "",
        meeting_date: m.meeting_date || "", start_time: m.start_time || "", end_time: m.end_time || "",
        place: m.place || "", total_members: m.total_members ?? "", present_count: m.present_count ?? "",
        attendees: m.attendees || "", absentees: m.absentees || "", writer: m.writer || "",
        agenda: Array.isArray(m.agenda) && m.agenda.length ? m.agenda : [emptyAgenda()],
        notes: m.notes || "", content: m.content || "",
        approval_boxes: Array.isArray(m.approval_boxes) ? m.approval_boxes : DEFAULT_BOXES[3],
        sign_table: m.sign_table !== false,
        expense_related: !!m.expense_related,
      },
    });
  }

  function doPrint(m) {
    setPrinting(m);
    setTimeout(() => window.print(), 150);
  }

  return (
    <div>
      <div className="print:hidden">
        <div className="flex items-end justify-between gap-3 mb-5">
          <h1 className="font-display font-bold text-xl">회의록</h1>
          {canManage && <button className="btn" onClick={() => setEditing({ form: newForm() })}>+ 회의록 작성</button>}
        </div>

        <div className="flex flex-col gap-3">
          {(!initialMinutes || initialMinutes.length === 0) && (
            <div className="card text-sm text-inkDim">등록된 회의록이 없습니다.</div>
          )}
          {(initialMinutes || []).map((m) => {
            const agenda = Array.isArray(m.agenda) ? m.agenda.filter((a) => a.title) : [];
            return (
              <div key={m.id} id={`m-${m.id}`} className="card scroll-mt-20 target:ring-2 target:ring-accent">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      {m.meeting_type && <span className="tag py-0.5 text-[11px]">{m.meeting_type}</span>}
                      {m.expense_related && <span className="tag py-0.5 text-[11px] text-accent border-accent/40">지출 관련</span>}
                      <span className="font-semibold">{m.title}</span>
                    </div>
                    <div className="text-xs text-inkDim mt-1">
                      {koDate(m.meeting_date)}{m.start_time ? ` ${m.start_time}` : ""}{m.place ? ` · ${m.place}` : ""}
                      {m.total_members ? ` · 재적 ${m.total_members}명 중 ${m.present_count ?? "-"}명 참석` : ""}
                    </div>
                  </div>
                  <div className="flex gap-1.5 shrink-0">
                    <button className="btn-ghost text-xs" onClick={() => doPrint(m)}>🖨 출력</button>
                    {canManage && <button className="btn-ghost text-xs" onClick={() => openEdit(m)}>수정</button>}
                    {canManage && <button onClick={() => removeMinute(m)} className="text-danger text-xs font-medium px-2">삭제</button>}
                  </div>
                </div>

                {agenda.length > 0 && (
                  <div className="mt-3 flex flex-col gap-1.5">
                    {agenda.map((a, i) => (
                      <div key={i} className="text-sm flex gap-2">
                        <span className="text-inkDim shrink-0">제{i + 1}호</span>
                        <span className="flex-1 min-w-0 truncate">{a.title}</span>
                        {a.result && <span className={"tag py-0 text-[11px] " + (a.result === "가결" ? "text-ok border-ok/40" : a.result === "부결" ? "text-danger border-danger/40" : "text-inkDim")}>{a.result}</span>}
                      </div>
                    ))}
                  </div>
                )}
                {m.content && <div className="text-sm mt-3 whitespace-pre-wrap">{m.content}</div>}

                {(linksByMinute[m.id] || []).length > 0 && (
                  <div className="mt-3 rounded-xl bg-surface2 px-3 py-2">
                    <div className="text-xs font-semibold text-inkDim mb-1">이 회의록이 증빙으로 연결된 지출</div>
                    {linksByMinute[m.id].map((l, i) => (
                      <div key={i} className="text-sm flex justify-between gap-2">
                        <span className="truncate">{l.expense_date?.slice(5).replace("-", ".")} · {l.description} <span className="text-xs text-inkDim">[{l.doc_type}]</span></span>
                        <span className="font-semibold shrink-0">{Number(l.amount || 0).toLocaleString("ko-KR")}원</span>
                      </div>
                    ))}
                  </div>
                )}

                {(m.meeting_minute_files || []).length > 0 && (
                  <div className="mt-3 pt-3 border-t border-border">
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                      {m.meeting_minute_files.map((f) =>
                        f.file_type === "image" ? (
                          <a key={f.id} href={publicUrl(f.storage_path)} target="_blank" rel="noopener noreferrer" className="block group relative">
                            <img src={publicUrl(f.storage_path)} alt={f.file_name} className="w-full h-24 object-cover rounded-lg border border-border" />
                            {canManage && (
                              <button onClick={(e) => { e.preventDefault(); removeFile(f); }}
                                className="absolute top-1 right-1 bg-black/60 text-white text-[10px] rounded px-1.5 py-0.5 opacity-0 group-hover:opacity-100">✕</button>
                            )}
                          </a>
                        ) : (
                          <a key={f.id} href={publicUrl(f.storage_path)} target="_blank" rel="noopener noreferrer"
                            className="flex items-center gap-1 text-xs text-accent underline truncate border border-border rounded-lg px-2 py-1.5 h-24 flex-col justify-center text-center">
                            <span>📄</span><span className="truncate w-full">{f.file_name}</span>
                          </a>
                        )
                      )}
                    </div>
                  </div>
                )}

                {canManage && (
                  <label className="text-xs text-accent font-medium mt-3 inline-block cursor-pointer">
                    {uploadingFor === m.id ? "업로드 중…" : "+ 파일 추가 (서명본 스캔·사진 등)"}
                    <input type="file" multiple className="hidden" onChange={(e) => addFilesToExisting(m.id, e.target.files)} />
                  </label>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {editing && (
        <MinuteEditor
          initial={editing.form}
          minuteId={editing.id}
          buildingId={buildingId}
          onClose={() => setEditing(null)}
          onSaved={async (saved, files, printAfter) => {
            if (files?.length) await uploadFilesFor(saved.id, files);
            setEditing(null);
            router.refresh();
            if (printAfter) doPrint(saved);
          }}
        />
      )}

      {printing && <MinutePrint m={printing} buildingName={buildingName} />}
    </div>
  );
}

// 입력칸 이름표 (컴포넌트 밖에 두어야 입력 중 커서가 튀지 않음)
function L({ label, children, className = "" }) {
  return <label className={"block text-xs font-semibold text-inkDim " + className}>{label}<div className="mt-1">{children}</div></label>;
}

// ---------- 작성·수정 창 ----------
function MinuteEditor({ initial, minuteId, buildingId, onClose, onSaved }) {
  const supabase = createClient();
  const [f, setF] = useState(initial);
  const [titleTouched, setTitleTouched] = useState(!!initial.title);
  const [files, setFiles] = useState([]);
  const [saving, setSaving] = useState(false);
  const set = (k, v) => setF((p) => {
    const n = { ...p, [k]: v };
    if (!titleTouched && ["meeting_type", "session_no", "meeting_date"].includes(k)) n.title = autoTitle(n);
    return n;
  });
  const setAgenda = (i, k, v) => setF((p) => ({ ...p, agenda: p.agenda.map((a, j) => (j === i ? { ...a, [k]: v } : a)) }));
  const boxes = f.approval_boxes || [];
  function setBoxCount(n) {
    const c = Math.max(0, Math.min(6, n));
    setF((p) => {
      const cur = p.approval_boxes || [];
      const base = DEFAULT_BOXES[c] || [];
      return { ...p, approval_boxes: Array.from({ length: c }, (_, i) => (cur.length === c ? cur[i] : base[i]) || "") };
    });
  }
  const names = splitNames(f.attendees);
  const quorum = f.total_members && f.present_count !== ""
    ? (Number(f.present_count) > Number(f.total_members) / 2 ? "과반수 참석" : "과반수 미달") : "";

  async function save(printAfter) {
    const title = (titleTouched ? f.title : f.title || autoTitle(f)).trim();
    if (!title) { alert("제목을 입력해주세요."); return; }
    setSaving(true);
    const payload = {
      title, meeting_type: f.meeting_type, session_no: f.session_no.trim(), meeting_date: f.meeting_date || null,
      start_time: f.start_time, end_time: f.end_time, place: f.place.trim(),
      total_members: f.total_members === "" ? null : Number(f.total_members),
      present_count: f.present_count === "" ? null : Number(f.present_count),
      attendees: f.attendees.trim(), absentees: f.absentees.trim(), writer: f.writer.trim(),
      agenda: f.agenda.filter((a) => a.title.trim() || a.content.trim() || a.decision.trim()),
      notes: f.notes.trim(), content: f.content || "",
      approval_boxes: boxes.map((b) => b.trim()), sign_table: !!f.sign_table, expense_related: !!f.expense_related,
    };
    try { localStorage.setItem(BOX_KEY, JSON.stringify(payload.approval_boxes)); } catch {}
    const q = minuteId
      ? supabase.from("meeting_minutes").update(payload).eq("id", minuteId).select("*, meeting_minute_files(*)").single()
      : supabase.from("meeting_minutes").insert({ ...payload, building_id: buildingId }).select("*, meeting_minute_files(*)").single();
    const { data, error } = await q;
    setSaving(false);
    if (error) { alert("저장 실패: " + error.message); return; }
    onSaved(data, files, printAfter);
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-end sm:items-center justify-center sm:p-4 z-50 print:hidden" onClick={onClose}>
      <div className="bg-surface w-full sm:max-w-2xl max-h-[94vh] overflow-y-auto p-5 rounded-t-3xl sm:rounded-3xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <div className="font-bold text-lg">{minuteId ? "회의록 수정" : "회의록 작성"}</div>
          <button className="text-inkDim text-xl leading-none px-2" onClick={onClose} aria-label="닫기">×</button>
        </div>

        <div className="flex flex-col gap-4">
          {/* 기본 정보 */}
          <section className="flex flex-col gap-3">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
              {MEETING_TYPES.map((t) => (
                <button key={t} type="button" onClick={() => set("meeting_type", t)}
                  className={"rounded-lg py-2 text-sm font-semibold border " + (f.meeting_type === t ? "bg-ink text-white border-ink" : "bg-surface border-border text-inkDim")}>{t}</button>
              ))}
            </div>
            <label className="flex items-center gap-2 text-sm rounded-xl bg-accent/5 px-3 py-2">
              <input type="checkbox" checked={!!f.expense_related} onChange={(e) => set("expense_related", e.target.checked)} />
              <span><b>지출 관련 회의</b> <span className="text-xs text-inkDim">— 체크하면 통장·지출의 증빙(승인 서류 등)에 이 회의록을 연결할 수 있어요</span></span>
            </label>
            <div className="grid grid-cols-3 gap-2">
              <L label="회차"><input placeholder="예: 제3차" value={f.session_no} onChange={(e) => set("session_no", e.target.value)} /></L>
              <L label="제목" className="col-span-2">
                <input value={f.title} onChange={(e) => { setTitleTouched(true); setF((p) => ({ ...p, title: e.target.value })); }} placeholder={autoTitle(f)} />
              </L>
            </div>
            <div className="grid grid-cols-3 gap-2">
              <L label="회의일"><input type="date" value={f.meeting_date} onChange={(e) => set("meeting_date", e.target.value)} /></L>
              <L label="시작"><input type="time" value={f.start_time} onChange={(e) => set("start_time", e.target.value)} /></L>
              <L label="종료"><input type="time" value={f.end_time} onChange={(e) => set("end_time", e.target.value)} /></L>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <L label="장소"><input placeholder="예: 관리사무소 회의실" value={f.place} onChange={(e) => set("place", e.target.value)} /></L>
              <L label="작성자"><input placeholder="예: 관리인 최수영" value={f.writer} onChange={(e) => set("writer", e.target.value)} /></L>
            </div>
            <div className="grid grid-cols-3 gap-2 items-end">
              <L label="재적 인원"><input inputMode="numeric" value={f.total_members} onChange={(e) => set("total_members", e.target.value.replace(/[^\d]/g, ""))} /></L>
              <L label="참석 인원"><input inputMode="numeric" value={f.present_count} onChange={(e) => set("present_count", e.target.value.replace(/[^\d]/g, ""))} /></L>
              <div className={"text-sm font-semibold pb-3 " + (quorum === "과반수 참석" ? "text-ok" : "text-warn")}>{quorum}</div>
            </div>
            <L label="참석자 (쉼표나 줄바꿈으로 구분)">
              <textarea rows={2} placeholder="예: 홍길동(위원장), 김철수, 이영희" value={f.attendees}
                onChange={(e) => set("attendees", e.target.value)} />
              {names.length > 0 && <span className="block font-normal mt-1">{names.length}명 입력됨{f.present_count === "" && <button type="button" className="text-accent ml-2 underline" onClick={() => set("present_count", String(names.length))}>참석 인원에 넣기</button>}</span>}
            </L>
            <L label="불참자"><input value={f.absentees} onChange={(e) => set("absentees", e.target.value)} /></L>
          </section>

          {/* 안건 */}
          <section>
            <div className="flex items-center justify-between mb-2">
              <div className="text-sm font-bold">안건</div>
              <button type="button" className="btn-ghost text-xs" onClick={() => setF((p) => ({ ...p, agenda: [...p.agenda, emptyAgenda()] }))}>+ 안건 추가</button>
            </div>
            <div className="flex flex-col gap-3">
              {f.agenda.map((a, i) => (
                <div key={i} className="rounded-xl border border-border p-3 flex flex-col gap-2">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-bold shrink-0">제{i + 1}호</span>
                    <input placeholder="안건명 (예: 주차타워 롤러 교체 방식 결정)" value={a.title} onChange={(e) => setAgenda(i, "title", e.target.value)} />
                    {f.agenda.length > 1 && (
                      <button type="button" className="text-danger text-xs shrink-0 px-1" onClick={() => setF((p) => ({ ...p, agenda: p.agenda.filter((_, j) => j !== i) }))}>삭제</button>
                    )}
                  </div>
                  <textarea rows={3} placeholder="논의 내용" value={a.content} onChange={(e) => setAgenda(i, "content", e.target.value)} />
                  <textarea rows={2} placeholder="결정 사항" value={a.decision} onChange={(e) => setAgenda(i, "decision", e.target.value)} />
                  <div className="grid grid-cols-4 gap-2">
                    <L label="결과">
                      <select value={a.result} onChange={(e) => setAgenda(i, "result", e.target.value)}>
                        {RESULTS.map((r) => <option key={r}>{r}</option>)}
                      </select>
                    </L>
                    <L label="찬성"><input inputMode="numeric" value={a.vote_for} onChange={(e) => setAgenda(i, "vote_for", e.target.value.replace(/[^\d]/g, ""))} /></L>
                    <L label="반대"><input inputMode="numeric" value={a.vote_against} onChange={(e) => setAgenda(i, "vote_against", e.target.value.replace(/[^\d]/g, ""))} /></L>
                    <L label="기권"><input inputMode="numeric" value={a.vote_abstain} onChange={(e) => setAgenda(i, "vote_abstain", e.target.value.replace(/[^\d]/g, ""))} /></L>
                  </div>
                </div>
              ))}
            </div>
          </section>

          <L label="기타 사항"><textarea rows={2} value={f.notes} onChange={(e) => set("notes", e.target.value)} /></L>
          {f.content && (
            <L label="회의 내용 (예전 방식으로 입력된 내용)"><textarea rows={3} value={f.content} onChange={(e) => set("content", e.target.value)} /></L>
          )}

          {/* 결재란 */}
          <section className="rounded-xl bg-surface2 p-3">
            <div className="flex items-center justify-between mb-2">
              <div className="text-sm font-bold">결재란</div>
              <div className="flex items-center gap-2">
                <button type="button" className="btn-ghost text-xs w-8" onClick={() => setBoxCount(boxes.length - 1)}>−</button>
                <span className="text-sm font-semibold w-10 text-center">{boxes.length}칸</span>
                <button type="button" className="btn-ghost text-xs w-8" onClick={() => setBoxCount(boxes.length + 1)}>+</button>
              </div>
            </div>
            {boxes.length === 0 ? (
              <div className="text-xs text-inkDim">결재란 없이 출력합니다.</div>
            ) : (
              <div className="grid gap-1.5" style={{ gridTemplateColumns: `repeat(${boxes.length}, minmax(0, 1fr))` }}>
                {boxes.map((b, i) => (
                  <input key={i} className="text-center text-sm px-1" value={b}
                    onChange={(e) => setF((p) => ({ ...p, approval_boxes: p.approval_boxes.map((x, j) => (j === i ? e.target.value : x)) }))} />
                ))}
              </div>
            )}
            <label className="flex items-center gap-2 text-sm mt-3">
              <input type="checkbox" checked={f.sign_table} onChange={(e) => set("sign_table", e.target.checked)} />
              참석자 서명란도 출력 (참석자 이름 + 서명 칸)
            </label>
          </section>

          {!minuteId && (
            <L label="사진·문서 첨부 (선택)">
              <input type="file" multiple onChange={(e) => setFiles(Array.from(e.target.files || []))} className="text-sm" />
              {files.length > 0 && <span className="block font-normal mt-1">{files.length}개 파일 선택됨</span>}
            </L>
          )}
        </div>

        <div className="flex justify-end gap-2 mt-6">
          <button className="btn-ghost" onClick={onClose}>취소</button>
          <button className="btn-ghost" disabled={saving} onClick={() => save(true)}>저장 후 출력</button>
          <button className="btn px-6" disabled={saving} onClick={() => save(false)}>{saving ? "저장 중…" : "저장"}</button>
        </div>
      </div>
    </div>
  );
}

// ---------- 출력 양식 (A4) ----------
function MinutePrint({ m, buildingName }) {
  const boxes = Array.isArray(m.approval_boxes) ? m.approval_boxes : [];
  const agenda = Array.isArray(m.agenda) ? m.agenda : [];
  const names = splitNames(m.attendees);
  const th = "border border-black/50 bg-black/[0.06] px-2 py-1.5 text-[9.5pt] font-semibold text-center whitespace-nowrap";
  const td = "border border-black/50 px-2.5 py-1.5 text-[10pt]";
  const time = [m.start_time, m.end_time].filter(Boolean).join(" ~ ");
  const quorum = m.total_members && m.present_count != null
    ? `재적 ${m.total_members}명 중 ${m.present_count}명 참석${Number(m.present_count) > Number(m.total_members) / 2 ? " (과반수 참석으로 성원)" : ""}` : (m.present_count != null ? `${m.present_count}명 참석` : "");

  return (
    <div className="hidden print:block text-black" style={{ WebkitPrintColorAdjust: "exact", printColorAdjust: "exact" }}>
      {/* 머리말: 제목 + 결재란 */}
      <div className="flex items-start justify-between gap-4 mb-4">
        <div className="pt-1">
          <div className="text-[10pt] text-black/60">{buildingName} 관리단</div>
          <div className="text-[20pt] font-extrabold tracking-tight leading-tight" style={{ color: NAVY }}>{m.title}</div>
        </div>
        {boxes.length > 0 && (
          <table className="border-collapse shrink-0">
            <tbody>
              <tr>
                <td rowSpan={2} className="border border-black/50 px-1 text-[9pt] font-semibold text-center" style={{ writingMode: "vertical-rl", width: "7mm" }}>결재</td>
                {boxes.map((b, i) => <td key={i} className={th} style={{ width: "19mm" }}>{b}</td>)}
              </tr>
              <tr>{boxes.map((_, i) => <td key={i} className="border border-black/50" style={{ height: "17mm" }} />)}</tr>
            </tbody>
          </table>
        )}
      </div>
      <div className="h-[3px] mb-4" style={{ background: NAVY }} />

      {/* 회의 개요 */}
      <table className="w-full border-collapse mb-5">
        <tbody>
          <tr><td className={th} style={{ width: "22mm" }}>회의 구분</td><td className={td}>{[m.meeting_type, m.session_no].filter(Boolean).join(" · ")}</td>
            <td className={th} style={{ width: "22mm" }}>작성자</td><td className={td}>{m.writer}</td></tr>
          <tr><td className={th}>일시</td><td className={td} colSpan={3}>{koDate(m.meeting_date)}{time ? `  ${time}` : ""}</td></tr>
          <tr><td className={th}>장소</td><td className={td} colSpan={3}>{m.place}</td></tr>
          <tr><td className={th}>성원</td><td className={td} colSpan={3}>{quorum}</td></tr>
          <tr><td className={th}>참석자</td><td className={td} colSpan={3}>{names.join(", ")}</td></tr>
          {m.absentees && <tr><td className={th}>불참자</td><td className={td} colSpan={3}>{m.absentees}</td></tr>}
        </tbody>
      </table>

      {/* 안건 */}
      {agenda.length > 0 && <div className="text-[12pt] font-bold mb-2" style={{ color: NAVY }}>■ 회의 안건 및 결과</div>}
      {agenda.map((a, i) => {
        const hasVote = a.vote_for !== "" || a.vote_against !== "" || a.vote_abstain !== "";
        return (
          <div key={i} className="mb-4 break-inside-avoid">
            <div className="flex items-center justify-between rounded px-3 py-1.5 mb-1.5" style={{ background: NAVY, color: "#fff" }}>
              <span className="text-[10.5pt] font-bold">제{i + 1}호 안건 · {a.title}</span>
              {a.result && <span className="text-[10pt] font-bold">{a.result}</span>}
            </div>
            {a.content && (
              <div className="text-[10pt] leading-relaxed whitespace-pre-wrap px-1 mb-1.5"><b>논의 내용</b><br />{a.content}</div>
            )}
            {a.decision && (
              <div className="text-[10pt] leading-relaxed whitespace-pre-wrap rounded bg-black/[0.05] px-3 py-2 mb-1"><b>결정 사항</b> — {a.decision}</div>
            )}
            {hasVote && (
              <div className="text-[9.5pt] text-black/80 px-1">표결: 찬성 {a.vote_for || 0} · 반대 {a.vote_against || 0} · 기권 {a.vote_abstain || 0}</div>
            )}
          </div>
        );
      })}

      {m.content && (
        <div className="mb-4 break-inside-avoid">
          <div className="text-[12pt] font-bold mb-1.5" style={{ color: NAVY }}>■ 회의 내용</div>
          <div className="text-[10pt] leading-relaxed whitespace-pre-wrap">{m.content}</div>
        </div>
      )}
      {m.notes && (
        <div className="mb-4 break-inside-avoid">
          <div className="text-[12pt] font-bold mb-1.5" style={{ color: NAVY }}>■ 기타 사항</div>
          <div className="text-[10pt] leading-relaxed whitespace-pre-wrap">{m.notes}</div>
        </div>
      )}

      <div className="mt-6 mb-5 text-center text-[10.5pt] break-inside-avoid">
        위와 같이 회의를 진행하였으며, 이 회의록의 내용이 사실과 다름없음을 확인합니다.
        <div className="mt-3">{koDate(m.meeting_date)}</div>
        <div className="mt-3">작성자 : {m.writer || "            "}   (인)</div>
      </div>

      {m.sign_table !== false && names.length > 0 && (
        <div className="break-inside-avoid">
          <div className="text-[12pt] font-bold mb-2" style={{ color: NAVY }}>■ 참석자 확인 서명</div>
          <table className="w-full border-collapse">
            <thead>
              <tr>
                {[0, 1].map((k) => (
                  <Fragment key={k}>
                    <th className={th} style={{ width: "8%" }}>No</th>
                    <th className={th} style={{ width: "22%" }}>성명</th>
                    <th className={th} style={{ width: "20%" }}>서명</th>
                  </Fragment>
                ))}
              </tr>
            </thead>
            <tbody>
              {Array.from({ length: Math.ceil(names.length / 2) }, (_, r) => (
                <tr key={r}>
                  {[0, 1].map((k) => {
                    const idx = r * 2 + k;
                    return (
                      <Fragment key={k}>
                        <td className={td + " text-center"} style={{ height: "11mm" }}>{idx < names.length ? idx + 1 : ""}</td>
                        <td className={td}>{names[idx] || ""}</td>
                        <td className={td + " text-right text-black/40 text-[9pt]"}>{idx < names.length ? "(인)" : ""}</td>
                      </Fragment>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="mt-6 pt-2 border-t flex justify-between text-[9pt] text-black/60" style={{ borderColor: NAVY }}>
        <span>{buildingName} 관리단</span>
        <span>관리업체 지니어스 1551-9976</span>
      </div>
    </div>
  );
}
