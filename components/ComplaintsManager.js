"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabaseClient";

const TYPES = ["고장", "민원", "기타"];
const STATUSES = ["접수", "처리중", "완료"];

export default function ComplaintsManager({ buildings, complaints, role, myId }) {
  const supabase = createClient();
  const router = useRouter();
  const canManage = role === "관리자" || role === "담당자";
  const [showForm, setShowForm] = useState(false);
  const [buildingId, setBuildingId] = useState(buildings[0]?.id || "");
  const [unitText, setUnitText] = useState("");
  const [type, setType] = useState("고장");
  const [content, setContent] = useState("");
  const [reporter, setReporter] = useState("");
  const [selected, setSelected] = useState(null);
  const [assignee, setAssignee] = useState("");
  const [resolution, setResolution] = useState("");
  const [status, setStatus] = useState("접수");

  async function submitComplaint() {
    if (!content.trim()) { alert("내용을 입력해주세요."); return; }
    const { error } = await supabase.from("complaints").insert({
      building_id: buildingId || null, unit_text: unitText.trim(), type, content: content.trim(),
      reporter: reporter.trim(), created_by: myId,
    });
    if (error) { alert("등록 실패: " + error.message); return; }
    setShowForm(false); setUnitText(""); setContent(""); setReporter("");
    router.refresh();
  }

  function openDetail(c) {
    setSelected(c);
    setAssignee(c.assignee || "");
    setResolution(c.resolution || "");
    setStatus(c.status);
  }

  async function saveDetail() {
    const patch = { status, assignee: assignee.trim(), resolution: resolution.trim() };
    if (status === "완료" && !selected.resolved_date) patch.resolved_date = new Date().toISOString().slice(0, 10);
    const { error } = await supabase.from("complaints").update(patch).eq("id", selected.id);
    if (error) { alert("저장 실패: " + error.message); return; }
    setSelected(null);
    router.refresh();
  }

  async function removeComplaint(id) {
    if (!confirm("삭제할까요?")) return;
    const { error } = await supabase.from("complaints").delete().eq("id", id);
    if (error) { alert("삭제 실패: " + error.message); return; }
    setSelected(null);
    router.refresh();
  }

  const buildingName = (id) => buildings.find((b) => b.id === id)?.name || "-";
  const toneClass = (s) => (s === "완료" ? "text-ok border-ok" : s === "처리중" ? "text-warn border-warn" : "text-accent2 border-accent2");

  return (
    <div>
      <div className="flex items-center justify-between mb-5">
        <h1 className="font-display font-bold text-xl">민원·고장신고</h1>
        <button className="btn" onClick={() => setShowForm(!showForm)}>신규 접수</button>
      </div>

      {showForm && (
        <div className="card mb-4">
          <div className="grid grid-cols-2 gap-3 mb-3">
            <select value={buildingId} onChange={(e) => setBuildingId(e.target.value)}>
              {buildings.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
            </select>
            <input placeholder="동/호수 (예: 101동 203호)" value={unitText} onChange={(e) => setUnitText(e.target.value)} />
          </div>
          <div className="flex gap-2 mb-3">
            {TYPES.map((t) => (
              <button key={t} type="button" onClick={() => setType(t)}
                className={"flex-1 py-2 rounded-lg text-sm border " + (type === t ? "bg-accent text-white border-accent" : "bg-surface2 border-border text-inkDim")}>
                {t}
              </button>
            ))}
          </div>
          <textarea placeholder="내용" rows={3} value={content} onChange={(e) => setContent(e.target.value)} className="mb-3" />
          <input placeholder="접수자 이름" value={reporter} onChange={(e) => setReporter(e.target.value)} className="mb-3" />
          <button className="btn" onClick={submitComplaint}>접수 등록</button>
        </div>
      )}

      <div className="card">
        {complaints.length === 0 ? (
          <p className="text-sm text-inkDim">접수된 민원이 없습니다.</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {complaints.map((c) => (
              <li key={c.id} onClick={() => openDetail(c)} className="bg-surface2 rounded-lg p-3 cursor-pointer hover:bg-border/40">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-xs text-inkDim font-mono">{c.received_date} · {c.type}</div>
                    <div className="font-semibold text-sm mt-0.5">{buildingName(c.building_id)} {c.unit_text}</div>
                    <div className="text-xs text-inkDim mt-0.5">{c.content}</div>
                  </div>
                  <span className={"tag " + toneClass(c.status)}>{c.status}</span>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      {selected && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50" onClick={() => setSelected(null)}>
          <div className="bg-surface rounded-xl max-w-sm w-full p-5" onClick={(e) => e.stopPropagation()}>
            <div className="font-semibold mb-1">{buildingName(selected.building_id)} {selected.unit_text}</div>
            <div className="text-xs text-inkDim font-mono mb-3">접수 {selected.received_date} · {selected.type} · 접수자 {selected.reporter || "-"}</div>
            <p className="text-sm bg-surface2 rounded-lg p-3 mb-4">{selected.content}</p>
            {canManage ? (
              <>
                <label className="text-xs text-inkDim font-medium block mb-1">진행 상태</label>
                <div className="flex gap-2 mb-3">
                  {STATUSES.map((s) => (
                    <button key={s} onClick={() => setStatus(s)}
                      className={"flex-1 py-2 rounded-lg text-xs border " + (status === s ? "bg-accent text-white border-accent" : "bg-surface2 border-border text-inkDim")}>
                      {s}
                    </button>
                  ))}
                </div>
                <input placeholder="담당자" value={assignee} onChange={(e) => setAssignee(e.target.value)} className="mb-3" />
                <textarea placeholder="처리 내용" rows={3} value={resolution} onChange={(e) => setResolution(e.target.value)} className="mb-4" />
                <div className="flex justify-between">
                  <button onClick={() => removeComplaint(selected.id)} className="text-danger text-sm font-medium">삭제</button>
                  <div className="flex gap-2">
                    <button className="btn-ghost" onClick={() => setSelected(null)}>닫기</button>
                    <button className="btn" onClick={saveDetail}>저장</button>
                  </div>
                </div>
              </>
            ) : (
              <>
                <span className={"tag " + toneClass(selected.status)}>{selected.status}</span>
                {selected.resolution && <p className="text-sm bg-surface2 rounded-lg p-3 mt-3">{selected.resolution}</p>}
                <button className="btn-ghost w-full justify-center mt-4" onClick={() => setSelected(null)}>닫기</button>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
