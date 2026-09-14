"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabaseClient";

export default function NoticesBoard({ notices, role, myName }) {
  const supabase = createClient();
  const router = useRouter();
  const canManage = role === "관리자" || role === "담당자";
  const [showForm, setShowForm] = useState(false);
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [editingId, setEditingId] = useState(null);
  const [expandedId, setExpandedId] = useState(notices[0]?.id || null);

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
        title: title.trim(), content: content.trim(), author: myName || "",
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
    return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, "0")}.${String(d.getDate()).padStart(2, "0")}`;
  }

  return (
    <div className="card mb-4">
      <div className="flex items-center justify-between mb-3">
        <div className="font-semibold text-sm">공지사항</div>
        {canManage && !showForm && (
          <button className="btn-ghost text-xs" onClick={startNew}>+ 공지 작성</button>
        )}
      </div>

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
        <div className="divide-y divide-border">
          {notices.map((n) => (
            <div key={n.id} className="py-2">
              <button
                className="w-full flex items-center justify-between text-left"
                onClick={() => setExpandedId(expandedId === n.id ? null : n.id)}
              >
                <span className="text-sm font-medium">{n.title}</span>
                <span className="text-xs text-inkDim shrink-0 ml-2">{dateLabel(n.created_at)}</span>
              </button>
              {expandedId === n.id && (
                <div className="mt-2 text-sm text-inkDim whitespace-pre-wrap">
                  {n.content}
                  {canManage && (
                    <div className="flex gap-3 mt-2">
                      <button onClick={() => startEdit(n)} className="text-accent text-xs font-medium">수정</button>
                      <button onClick={() => remove(n.id)} className="text-danger text-xs font-medium">삭제</button>
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
