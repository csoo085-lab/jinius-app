"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabaseClient";

const OCCUPANCY_OPTIONS = ["자가", "전세", "월세", "공실"];

export default function UnitsManager({ buildings, initialBuildingId, units }) {
  const supabase = createClient();
  const router = useRouter();
  const [buildingId, setBuildingId] = useState(initialBuildingId || (buildings[0]?.id ?? ""));
  const [dong, setDong] = useState("");
  const [count, setCount] = useState("");
  const [start, setStart] = useState("");
  const [area, setArea] = useState("");
  const [loading, setLoading] = useState(false);

  function changeBuilding(id) {
    setBuildingId(id);
    router.push("/dashboard/units?building=" + id);
  }

  async function bulkGenerate() {
    if (!dong.trim()) { alert("동을 입력해주세요."); return; }
    const c = parseInt(count, 10);
    const s = parseInt(start, 10);
    if (!c || c < 1) { alert("세대수를 입력해주세요."); return; }
    if (isNaN(s)) { alert("시작 호수를 입력해주세요."); return; }
    const rows = Array.from({ length: c }, (_, i) => ({
      building_id: buildingId,
      dong: dong.trim(),
      ho: (s + i) + "호",
      area: Number(area) || null,
    }));
    setLoading(true);
    const { error } = await supabase.from("units").insert(rows);
    setLoading(false);
    if (error) { alert("생성 실패: " + error.message); return; }
    alert(c + "세대가 생성되었습니다.");
    router.refresh();
  }

  async function updateUnit(id, patch) {
    const { error } = await supabase.from("units").update(patch).eq("id", id);
    if (error) alert("수정 실패: " + error.message);
    router.refresh();
  }

  async function removeUnit(id) {
    if (!confirm("이 세대를 삭제할까요?")) return;
    const { error } = await supabase.from("units").delete().eq("id", id);
    if (error) { alert("삭제 실패: " + error.message); return; }
    router.refresh();
  }

  return (
    <div>
      <h1 className="font-display font-bold text-xl mb-5">세대(호실) 설정</h1>
      <div className="card mb-4">
        <label className="text-xs text-inkDim font-medium block mb-1">대상 건물</label>
        <select className="max-w-xs" value={buildingId} onChange={(e) => changeBuilding(e.target.value)}>
          {buildings.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
        </select>
      </div>

      <div className="card mb-4">
        <div className="font-semibold text-sm mb-3">일괄 생성</div>
        <div className="grid grid-cols-2 gap-3 mb-3">
          <input placeholder="동 (예: 101동)" value={dong} onChange={(e) => setDong(e.target.value)} />
          <input type="number" placeholder="세대수 (예: 56)" value={count} onChange={(e) => setCount(e.target.value)} />
          <input type="number" placeholder="시작 호수 (예: 101)" value={start} onChange={(e) => setStart(e.target.value)} />
          <input type="number" placeholder="세대당 면적(㎡)" value={area} onChange={(e) => setArea(e.target.value)} />
        </div>
        <button className="btn" disabled={loading} onClick={bulkGenerate}>일괄 생성</button>
      </div>

      <div className="card">
        <div className="font-semibold text-sm mb-3">등록된 세대 ({units.length})</div>
        {units.length === 0 ? (
          <p className="text-sm text-inkDim">등록된 세대가 없습니다.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-inkDim border-b border-borderBright">
                  <th className="py-2">동</th><th className="py-2">호</th><th className="py-2">면적(㎡)</th>
                  <th className="py-2">임대현황</th><th className="py-2">연락처</th><th className="py-2">입주일</th>
                  <th className="py-2">차량정보</th><th className="py-2 w-16"></th>
                </tr>
              </thead>
              <tbody>
                {units.map((u) => (
                  <tr key={u.id} className="border-b border-border">
                    <td className="py-2"><input defaultValue={u.dong} className="w-20" onBlur={(e) => updateUnit(u.id, { dong: e.target.value })} /></td>
                    <td className="py-2"><input defaultValue={u.ho} className="w-20" onBlur={(e) => updateUnit(u.id, { ho: e.target.value })} /></td>
                    <td className="py-2"><input type="number" defaultValue={u.area || ""} className="w-24" onBlur={(e) => updateUnit(u.id, { area: Number(e.target.value) || null })} /></td>
                    <td className="py-2">
                      <select defaultValue={u.occupancy || "월세"} className="w-24" onChange={(e) => updateUnit(u.id, { occupancy: e.target.value })}>
                        {OCCUPANCY_OPTIONS.map((o) => <option key={o}>{o}</option>)}
                      </select>
                    </td>
                    <td className="py-2"><input defaultValue={u.phone || ""} placeholder="010-0000-0000" className="w-32" onBlur={(e) => updateUnit(u.id, { phone: e.target.value })} /></td>
                    <td className="py-2"><input defaultValue={u.move_in_date || ""} placeholder="2024-01-01" className="w-28" onBlur={(e) => updateUnit(u.id, { move_in_date: e.target.value })} /></td>
                    <td className="py-2"><input defaultValue={u.vehicle || ""} placeholder="차량번호" className="w-28" onBlur={(e) => updateUnit(u.id, { vehicle: e.target.value })} /></td>
                    <td className="py-2 text-right"><button onClick={() => removeUnit(u.id)} className="text-danger text-xs font-medium">삭제</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
