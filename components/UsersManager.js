"use client";

import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabaseClient";

const ROLES = ["관리자", "담당자", "구분소유자", "고객"];

export default function UsersManager({ profiles, myId, buildings = [] }) {
  const supabase = createClient();
  const router = useRouter();

  async function changeRole(id, role) {
    const { error } = await supabase.from("profiles").update({ role }).eq("id", id);
    if (error) { alert("변경 실패: " + error.message); return; }
    router.refresh();
  }

  async function setApproved(id, approved) {
    const { error } = await supabase.from("profiles").update({ approved }).eq("id", id);
    if (error) { alert("변경 실패: " + error.message); return; }
    router.refresh();
  }

  async function changeBuilding(id, buildingId) {
    const { error } = await supabase.from("profiles").update({ building_id: buildingId || null }).eq("id", id);
    if (error) { alert("변경 실패: " + error.message); return; }
    router.refresh();
  }

  function buildingName(id) {
    return buildings.find((b) => b.id === id)?.name || "";
  }

  const pending = profiles.filter((p) => !p.approved);
  const approvedList = profiles.filter((p) => p.approved);

  return (
    <div>
      <h1 className="font-display font-bold text-xl mb-5">사용자 설정</h1>

      {pending.length > 0 && (
        <div className="card mb-4 border-warn/40">
          <div className="font-semibold text-sm mb-3 text-warn">승인 대기중인 회원 ({pending.length}명)</div>
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-inkDim border-b border-borderBright">
                <th className="py-2">이름</th>
                <th className="py-2">구분</th>
                <th className="py-2">건물</th>
                <th className="py-2">역할</th>
                <th className="py-2">가입일</th>
                <th className="py-2"></th>
              </tr>
            </thead>
            <tbody>
              {pending.map((p) => (
                <tr key={p.id} className="border-b border-border">
                  <td className="py-2">{p.display_name}</td>
                  <td className="py-2">
                    {p.member_type && <span className="tag text-[10px]">{p.member_type}</span>}
                  </td>
                  <td className="py-2">
                    <select value={p.building_id || ""} onChange={(e) => changeBuilding(p.id, e.target.value)} className="w-28">
                      <option value="">미지정</option>
                      {buildings.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
                    </select>
                  </td>
                  <td className="py-2">
                    <select value={p.role} onChange={(e) => changeRole(p.id, e.target.value)} className="w-28">
                      {ROLES.map((r) => <option key={r}>{r}</option>)}
                    </select>
                  </td>
                  <td className="py-2 text-inkDim font-mono text-xs">{new Date(p.created_at).toLocaleDateString()}</td>
                  <td className="py-2 text-right">
                    <button onClick={() => setApproved(p.id, true)} className="btn">승인</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="card">
        <p className="text-xs text-inkDim mb-4">
          <strong>관리자</strong>: 전체 기능 · <strong>담당자</strong>: 시설점검·민원·관리비·검침 등 실무 · <strong>구분소유자</strong>: 일반 열람 기능 + 회의록·통장내역 열람 · <strong>고객</strong>: 관리비 조회·민원 접수 중심의 열람 위주 화면
        </p>
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs text-inkDim border-b border-borderBright">
              <th className="py-2">이름</th>
              <th className="py-2">구분</th>
              <th className="py-2">건물</th>
              <th className="py-2">역할</th>
              <th className="py-2">승인상태</th>
              <th className="py-2">가입일</th>
            </tr>
          </thead>
          <tbody>
            {approvedList.map((p) => (
              <tr key={p.id} className="border-b border-border">
                <td className="py-2">{p.display_name} {p.id === myId && <span className="tag border-accent text-accent ml-1">나</span>}</td>
                <td className="py-2">
                  {p.member_type && <span className="tag text-[10px]">{p.member_type}</span>}
                </td>
                <td className="py-2">
                  <select value={p.building_id || ""} onChange={(e) => changeBuilding(p.id, e.target.value)} className="w-28">
                    <option value="">미지정</option>
                    {buildings.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
                  </select>
                </td>
                <td className="py-2">
                  <select value={p.role} onChange={(e) => changeRole(p.id, e.target.value)} className="w-28">
                    {ROLES.map((r) => <option key={r}>{r}</option>)}
                  </select>
                </td>
                <td className="py-2 text-ok text-xs font-medium">
                  승인됨
                  {p.id !== myId && (
                    <button
                      onClick={() => setApproved(p.id, false)}
                      className="ml-2 text-inkDim hover:text-warn underline text-xs font-normal"
                    >
                      승인 취소
                    </button>
                  )}
                </td>
                <td className="py-2 text-inkDim font-mono text-xs">{new Date(p.created_at).toLocaleDateString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
