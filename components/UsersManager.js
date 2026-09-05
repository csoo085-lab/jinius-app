"use client";

import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabaseClient";

const ROLES = ["관리자", "담당자", "고객"];

export default function UsersManager({ profiles, myId }) {
  const supabase = createClient();
  const router = useRouter();

  async function changeRole(id, role) {
    const { error } = await supabase.from("profiles").update({ role }).eq("id", id);
    if (error) { alert("변경 실패: " + error.message); return; }
    router.refresh();
  }

  return (
    <div>
      <h1 className="font-display font-bold text-xl mb-5">사용자 설정</h1>
      <div className="card">
        <p className="text-xs text-inkDim mb-4">
          <strong>관리자</strong>: 전체 기능 · <strong>담당자</strong>: 시설점검·민원·관리비·검침 등 실무 · <strong>고객</strong>: 관리비 조회·민원 접수 중심의 열람 위주 화면
        </p>
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs text-inkDim border-b border-borderBright">
              <th className="py-2">이름</th><th className="py-2">역할</th><th className="py-2">가입일</th>
            </tr>
          </thead>
          <tbody>
            {profiles.map((p) => (
              <tr key={p.id} className="border-b border-border">
                <td className="py-2">{p.display_name} {p.id === myId && <span className="tag border-accent text-accent ml-1">나</span>}</td>
                <td className="py-2">
                  <select value={p.role} onChange={(e) => changeRole(p.id, e.target.value)} className="w-28">
                    {ROLES.map((r) => <option key={r}>{r}</option>)}
                  </select>
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
