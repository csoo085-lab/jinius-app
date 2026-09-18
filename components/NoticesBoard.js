"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabaseClient";

export default function NoticesBoard({ notices, role, myName, buildingId }) {
  const supabase = createClient();
  const router = useRouter();
  const canManage = role === "관리자" || role === "담당자";
  const [showForm, setShowForm] = useState(false);
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [editingId, setEditingId] = useState(null);
  const [expandedId, setExpandedId] = useState(null);
  const [collapsed, setCollapsed] = useState(false);

  function startNew() {
    setEditingId(null); setTitle(""); setContent(""); setShowForm(true);
  }

  function startEdit(n) {
    setEditingId(n.id); setTitle(n.title); setContent(n.content); setShowForm(true);
  }

  async function save() {
    if (!title.trim()) { alert("제목을 입력해주세요."); return; }
    if (editingId) {
      const { error } = await supabase.from("notices").update({
        title: title.trim(), content: content.trim(),
      }).eq("id", editingId);
      if (error) { alert("수정 실패: " + error.message); return; }
    } else {
      const { error } = await supabase.from("notices").insert({
        title: title.trim(), content: content.trim(), author: myName || "", building_id: buildingId,
      });
      if (error) { alert("등록 실패: " + error.message); return; }
    }
    setShowForm(false); setTitle(""); setContent(""); setEditingId(null);
    router.refresh();
  }

  async function remove(id) {
    if (!confirm("이 공지사항을 삭제할까요?")) return;
    const { error } = await supabase.from("notices").delete().eq("id", id);
    if (error) { alert("삭제 실패: " + error.message); return; }
    router.refresh();
  }

  function dateLabel(iso) {
    const d = new Date(iso);
    return `${String(d.getFullYear()).slice(2)}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  }

  return (
    <div className="rounded-xl border border-border overflow-hidden mb-4 bg-surface shadow-sm">
      {/* 헤더 바 */}
      <button
        onClick={() => setCollapsed(!collapsed)}
        className="w-full flex items-center justify-between px-4 py-3"
        style={{ background: "linear-gradient(90deg, #262f6e, #004cd4)" }}
      >
        <span className="text-white font-display font-bold text-sm tracking-wide">공지사항</span>
        <span className={`text-white transition-transform ${collapsed ? "-rotate-90" : ""}`}>▾</span>
      </button>

      {!collapsed && (
        <div className="p-4">
          {canManage && (
            <div className="flex justify-end mb-2">
              {!showForm && <button className="btn-ghost text-xs" onClick={startNew}>+ 공지 작성</button>}
            </div>
          )}

          {showForm && (
            <div className="border border-borderBright rounded-lg p-3 mb-3">
              <input placeholder="제목" value={title} onChange={(e) => setTitle(e.target.value)} className="mb-2" />
              <textarea placeholder="내용" value={content} onChange={(e) => setContent(e.target.value)} rows={4} className="mb-2 w-full" />
              <div className="flex gap-2">
                <button className="btn" onClick={save}>{editingId ? "수정 저장" : "등록"}</button>
                <button className="btn-ghost" onClick={() => { setShowForm(false); setEditingId(null); }}>취소</button>
              </div>
            </div>
          )}

          {notices.length === 0 ? (
            <p className="text-sm text-inkDim">등록된 공지사항이 없습니다.</p>
          ) : (
            <ul>
              {notices.map((n, idx) => (
                <li key={n.id} className={idx > 0 ? "border-t border-border" : ""}>
                  <button
                    className="w-full flex items-center gap-2 py-2 text-left group"
                    onClick={() => setExpandedId(expandedId === n.id ? null : n.id)}
                  >
                    <span className="w-1 h-1 rounded-full bg-accent shrink-0" />
                    <span className="text-sm text-ink truncate flex-1 group-hover:text-accent">{n.title}</span>
                    <span className="text-xs text-inkDim font-mono shrink-0">{dateLabel(n.created_at)}</span>
                  </button>
                  {expandedId === n.id && (
                    <div className="pb-3 pl-3 text-sm text-inkDim whitespace-pre-wrap">
                      {n.content}
                      {canManage && (
                        <div className="flex gap-3 mt-2">
                          <button onClick={() => startEdit(n)} className="text-accent text-xs font-medium">수정</button>
                          <button onClick={() => remove(n.id)} className="text-danger text-xs font-medium">삭제</button>
                        </div>
                      )}
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
