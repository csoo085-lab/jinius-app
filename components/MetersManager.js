"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabaseClient";

export default function MetersManager({ buildings, buildingId, month, utility, readings }) {
  const supabase = createClient();
  const router = useRouter();
  const [dong, setDong] = useState("");
  const [ho, setHo] = useState("");

  function goto(b, m, u) {
    router.push(`/dashboard/meters?building=${b}&month=${m}&utility=${u}`);
  }

  async function addRow() {
    const { error } = await supabase.from("meter_readings").insert({
      building_id: buildingId, month, utility, dong: dong.trim(), ho: ho.trim(), prev_reading: 0, curr_reading: 0,
    });
    if (error) { alert("추가 실패: " + error.message); return; }
    setDong(""); setHo("");
    router.refresh();
  }

  async function updateRow(id, patch) {
    const { error } = await supabase.from("meter_readings").update(patch).eq("id", id);
    if (error) alert("수정 실패: " + error.message);
    router.refresh();
  }

  async function removeRow(id) {
    if (!confirm("삭제할까요?")) return;
    await supabase.from("meter_readings").delete().eq("id", id);
    router.refresh();
  }

  function handlePrint() {
    window.print();
  }

  const usage = (r) => Math.max(0, (r.curr_reading || 0) - (r.prev_reading || 0));
  const unitLabel = utility === "수도" ? "㎥" : "kWh";
  const buildingName = buildings.find((b) => b.id === buildingId)?.name || "";

  return (
    <div>
      <div className="flex items-center justify-between mb-5 print:hidden">
        <h1 className="font-display font-bold text-xl">검침 관리</h1>
        <button className="btn" onClick={handlePrint}>인쇄 / PDF 저장</button>
      </div>

      <div className="card mb-4 print:hidden">
        <div className="grid grid-cols-3 gap-3">
          <select value={buildingId} onChange={(e) => goto(e.target.value, month, utility)}>
            {buildings.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
          </select>
          <input type="month" value={month} onChange={(e) => goto(buildingId, e.target.value, utility)} />
          <div className="flex gap-1">
            {["전기", "수도"].map((u) => (
              <button key={u} type="button" onClick={() => goto(buildingId, month, u)}
                className={"flex-1 py-2 rounded-lg text-sm border " + (utility === u ? "bg-accent text-white border-accent" : "bg-surface2 border-border text-inkDim")}>
                {u}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="card mb-4 print:hidden">
        <div className="font-semibold text-sm mb-3">세대 추가</div>
        <div className="flex gap-2">
          <input placeholder="동" value={dong} onChange={(e) => setDong(e.target.value)} />
          <input placeholder="호" value={ho} onChange={(e) => setHo(e.target.value)} />
          <button className="btn shrink-0" onClick={addRow}>추가</button>
        </div>
      </div>

      <div className="card">
        <div className="hidden print:block mb-4">
          <div className="font-display font-bold text-lg">{buildingName} · {utility}검침등록표</div>
          <div className="text-xs text-inkDim">{month}</div>
        </div>
        <div className="font-semibold text-sm mb-3 print:hidden">{month} {utility} 검침 데이터 ({readings.length})</div>
        {readings.length === 0 ? (
          <p className="text-sm text-inkDim">등록된 데이터가 없습니다.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-inkDim border-b border-borderBright">
                  <th className="py-2">동</th><th className="py-2">호</th><th className="py-2">전월지침</th>
                  <th className="py-2">당월지침</th><th className="py-2">사용량</th><th className="py-2 w-16 print:hidden"></th>
                </tr>
              </thead>
              <tbody>
                {readings.map((r) => (
                  <tr key={r.id} className="border-b border-border">
                    <td className="py-2">{r.dong}</td>
                    <td className="py-2">{r.ho}</td>
                    <td className="py-2">
                      <input type="number" defaultValue={r.prev_reading} className="w-24 print:border-none print:bg-transparent print:p-0"
                        onBlur={(e) => updateRow(r.id, { prev_reading: Number(e.target.value) || 0 })} />
                    </td>
                    <td className="py-2">
                      <input type="number" defaultValue={r.curr_reading} className="w-24 print:border-none print:bg-transparent print:p-0"
                        onBlur={(e) => updateRow(r.id, { curr_reading: Number(e.target.value) || 0 })} />
                    </td>
                    <td className="py-2 font-mono">{usage(r)} {unitLabel}</td>
                    <td className="py-2 text-right print:hidden">
                      <button onClick={() => removeRow(r.id)} className="text-danger text-xs font-medium">삭제</button>
                    </td>
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
