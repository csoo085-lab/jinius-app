"use client";

// 관리비 고지서 작업: 한전 세대종합 + 수도 검침표 → 세대별 계산 → 고지서 출력 / 호실별 PDF
import { useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabaseClient";
import { computeBills, proposeWaterAdjust } from "@/lib/billing";
import { parseKepcoUnits, parseWaterMeter } from "@/lib/billingParsers";
import { InvoiceSheet } from "@/components/BillInvoice";
import MonthPick from "@/components/MonthPick";

const won = (n) => Math.round(Number(n) || 0).toLocaleString("ko-KR");
const DOW = ["일", "월", "화", "수", "목", "금", "토"];
const hoKey = (ho) => String(Number((String(ho || "").match(/\d{3,4}/) || [""])[0]) || "");
const daysIn = (month) => { const [y, m] = month.split("-").map(Number); return new Date(y, m, 0).getDate(); };
const shift = (month, d) => { const [y, m] = month.split("-").map(Number); const t = new Date(Date.UTC(y, m - 1 + d, 1)); return t.toISOString().slice(0, 7); };
const todayKST = () => new Date().toLocaleDateString("sv-SE", { timeZone: "Asia/Seoul" });
const ymd = (iso) => { const [y, m, d] = iso.split("-").map(Number); return { y, m, d, dow: DOW[new Date(y, m - 1, d).getDay()] }; };
const krDate = (iso) => { if (!iso) return ""; const t = ymd(iso); return `${t.y}년 ${t.m}월 ${t.d}일`; };
const spanDays = (a, b) => Math.round((new Date(b) - new Date(a)) / 86400000) + 1;
const periodLine = (label, mm, from, to) => (from && to ? `${label}(${mm}월분) : ${krDate(from)} ~ ${krDate(to)}(${spanDays(from, to)}일)` : "");
const n0 = (v) => (v === "" || v == null ? 0 : Number(v) || 0);

export const DEFAULT_BILL_SETTINGS = {
  elecMode: "세대전기", waterMode: "세대수도", tvFee: 2500,
  bank: "", account: "", holder: "", officeName: "", phone: "1551-9976",
  dueRule: "관리비 납부마감일은 매월 25일이며, 공휴일인 경우는 익일까지 입니다.",
  notice: "쾌적한 환경을 위하여 철저한 분리수거를 부탁드립니다.",
};

export default function BillingManager({ building, units, run, prevRun, deposits = [], setupNeeded, month }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const supabase = createClient();
  const settings = { ...DEFAULT_BILL_SETTINGS, officeName: `${building.name} 관리사무소`, ...(building.billing_settings || {}) };
  const mm = Number(month.slice(5));
  const locked = run?.status === "확정";
  const D = daysIn(month);

  // ---------- 입력값 ----------
  const defaultInputs = () => ({
    feeFrom: `${month}-01`, feeTo: `${month}-${String(D).padStart(2, "0")}`,
    elecFrom: "", elecTo: "", waterFrom: "", waterTo: "",
    due: `${shift(month, 1)}-${String(daysIn(shift(month, 1))).padStart(2, "0")}`,
    issue: todayKST(), elecAreaExtra: "", elecCommonTotal: "", waterBill: "", waterTons: "",
    kepco: null, water: null,
  });
  const [inputs, setInputs] = useState(() => ({ ...defaultInputs(), ...(run?.inputs || {}) }));

  // 이전 달 세대별 값 (지침 이월·미납 계산용)
  const prevByUnit = useMemo(() => Object.fromEntries((prevRun?.lines || []).map((l) => [l.unit_id, l])), [prevRun]);
  // 이전 고지 이후 들어온 호실별 입금
  const paidByUnit = useMemo(() => {
    const m = {};
    deposits.forEach((t) => { m[t.unit_id] = (m[t.unit_id] || 0) + Number(t.amount || 0); });
    return m;
  }, [deposits]);
  const autoUnpaid = (u) => {
    const p = prevByUnit[u.id];
    if (!p) return 0;
    return Math.max(0, Math.round(Number(p.total || 0) - (paidByUnit[u.id] || 0)));
  };

  const initLine = (u) => {
    const p = prevByUnit[u.id];
    return {
      feeUsed: D, feeTotal: D, parkUsed: u.parking_amount ? D : 0, parkTotal: D,
      elecClaim: "", elecDiscount: "", elecDiscountType: "", elecPrev: p?.elecCur ?? "", elecCur: "",
      waterPrev: p?.waterCur ?? "", waterCur: "", waterUse: "", waterDiscount: "",
      unpaid: autoUnpaid(u), deduct: "", repair: "",
    };
  };
  const [lines, setLines] = useState(() => {
    const saved = Object.fromEntries((run?.lines || []).map((l) => [l.unit_id, l.input || {}]));
    return Object.fromEntries(units.map((u) => [u.id, { ...initLine(u), ...(saved[u.id] || {}) }]));
  });
  const setLine = (id, k, v) => setLines((ls) => ({ ...ls, [id]: { ...ls[id], [k]: v } }));
  const setInput = (k, v) => setInputs((s) => ({ ...s, [k]: v }));

  const [busy, setBusy] = useState("");
  const [msg, setMsg] = useState("");
  const [unitOpen, setUnitOpen] = useState(false);
  const [settingOpen, setSettingOpen] = useState(false);
  const [printSel, setPrintSel] = useState(null); // 출력할 unit id 목록
  const [pdfProgress, setPdfProgress] = useState("");
  const kepcoRef = useRef(null);
  const waterRef = useRef(null);

  function goMonth(next) {
    const params = new URLSearchParams(searchParams.toString());
    params.set("month", next);
    router.push(`${pathname}?${params.toString()}`);
  }

  // ---------- 계산 ----------
  const calc = useMemo(() => {
    const us = units.map((u) => {
      const l = lines[u.id] || {};
      return {
        unit_id: u.id, ho: hoKey(u.ho) || u.ho, area: Number(u.area) || 0,
        fee: Number(u.fee_amount) || 0, parking: Number(u.parking_amount) || 0, tv: !!u.has_tv,
        feeDays: [n0(l.feeUsed), n0(l.feeTotal) || D], parkDays: [n0(l.parkUsed), n0(l.parkTotal) || D],
        elecClaim: n0(l.elecClaim), elecDiscount: n0(l.elecDiscount), elecDiscountType: l.elecDiscountType || "",
        elecPrev: l.elecPrev === "" ? null : n0(l.elecPrev), elecCur: l.elecCur === "" ? null : n0(l.elecCur),
        waterPrev: l.waterPrev === "" ? null : n0(l.waterPrev), waterCur: l.waterCur === "" ? null : n0(l.waterCur),
        waterUse: n0(l.waterUse), waterDiscount: n0(l.waterDiscount),
        unpaid: n0(l.unpaid), deduct: n0(l.deduct), repair: n0(l.repair),
      };
    });
    return computeBills(us, {
      elecMode: settings.elecMode, elecAreaExtra: n0(inputs.elecAreaExtra), elecCommonTotal: n0(inputs.elecCommonTotal),
      tvFee: n0(settings.tvFee), waterMode: settings.waterMode, waterBill: n0(inputs.waterBill),
    });
  }, [units, lines, inputs, settings.elecMode, settings.waterMode, settings.tvFee, D]); // eslint-disable-line react-hooks/exhaustive-deps

  const waterUseSum = calc.rows.reduce((s, r) => s + n0(r.waterUse), 0);
  const waterGap = n0(inputs.waterTons) ? n0(inputs.waterTons) - waterUseSum : 0;

  // ---------- 파일 올리기 ----------
  async function onKepco(file) {
    if (!file) return;
    setMsg("");
    try {
      const k = await parseKepcoUnits(file);
      const byHo = Object.fromEntries(k.units.map((x) => [x.ho, x]));
      let matched = 0;
      setLines((ls) => {
        const next = { ...ls };
        units.forEach((u) => {
          const x = byHo[hoKey(u.ho)];
          if (!x) return;
          matched++;
          const l = { ...next[u.id] };
          l.elecClaim = x.claim; l.elecDiscount = x.discount || ""; l.elecDiscountType = x.discountType || "";
          if (l.elecPrev !== "" && l.elecPrev != null) l.elecCur = n0(l.elecPrev) + x.usage;
          l.elecUsageKepco = x.usage;
          next[u.id] = l;
        });
        return next;
      });
      setInput("kepco", {
        file: file.name, units: k.units.length, claim: k.units.reduce((s, x) => s + x.claim, 0),
        discount: k.units.reduce((s, x) => s + (x.discount || 0), 0), common: k.common?.claim || 0, baseMonth: k.baseMonth,
      });
      setMsg(`한전 세대종합: ${k.units.length}세대 읽음${k.units.length !== units.length ? ` (호실 ${units.length}개 중 ${matched}개 연결)` : ""}`);
    } catch (e) { alert(e.message); }
  }

  async function onWater(file) {
    if (!file) return;
    setMsg("");
    try {
      const w = await parseWaterMeter(file);
      const byHo = Object.fromEntries(w.rows.map((x) => [x.ho, x]));
      setLines((ls) => {
        const next = { ...ls };
        units.forEach((u) => {
          const x = byHo[hoKey(u.ho)];
          if (!x) return;
          next[u.id] = { ...next[u.id], waterPrev: x.prevAdj, waterCur: x.curAdj, waterUse: x.use2, waterPrevUse: x.prevUse ?? "" };
        });
        return next;
      });
      setInputs((s) => ({ ...s, water: { file: file.name, sheet: w.sheet, rows: w.rows.length }, waterTons: w.billTons ?? s.waterTons }));
      setMsg(`수도 검침표 [${w.sheet}] ${w.rows.length}세대 읽음`);
    } catch (e) { alert(e.message); }
  }

  function applyWaterAdjust() {
    const target = n0(inputs.waterTons);
    if (!target) return;
    const res = proposeWaterAdjust(units.map((u) => ({
      id: u.id, ho: u.ho, use: n0(lines[u.id]?.waterUse), prevUse: n0(lines[u.id]?.waterPrevUse), vacant: false,
    })), target);
    const changed = res.rows.filter((r) => r.adj);
    if (!changed.length) { alert("조정할 세대가 없습니다."); return; }
    const txt = changed.map((r) => `${r.ho} ${r.use}→${r.use + r.adj}톤`).join("\n");
    if (!confirm(`고지서 ${target}톤에 맞추는 조정안입니다.\n(전월보다 적게 쓴 세대부터 1톤씩)\n\n${txt}\n\n적용할까요?`)) return;
    setLines((ls) => {
      const next = { ...ls };
      changed.forEach((r) => {
        const l = { ...next[r.id] };
        l.waterUse = n0(l.waterUse) + r.adj;
        if (l.waterCur !== "" && l.waterCur != null) l.waterCur = n0(l.waterCur) + r.adj;
        next[r.id] = l;
      });
      return next;
    });
  }

  function refreshUnpaid() {
    if (!prevRun) { alert("지난달 고지서가 앱에 없어서 자동 계산할 수 없어요. 처음 한 번은 누적 미납을 직접 넣어주세요."); return; }
    if (!confirm("미납금을 다시 계산할까요?\n지난달 청구 합계 − 지난달 고지 이후 그 호실로 지정된 입금")) return;
    setLines((ls) => Object.fromEntries(units.map((u) => [u.id, { ...ls[u.id], unpaid: autoUnpaid(u) }])));
  }

  // ---------- 저장 ----------
  async function save(status) {
    setBusy("saving");
    const payloadLines = calc.rows.map((r) => ({
      unit_id: r.unit_id, ho: r.ho, input: lines[r.unit_id],
      charge: r.charge, unpaid: r.unpaid, total: r.total, elecCur: r.elecCur, waterCur: r.waterCur, result: r,
    }));
    const row = {
      building_id: building.id, month, status: status || run?.status || "작성중",
      inputs, lines: payloadLines, totals: calc.totals, updated_at: new Date().toISOString(),
    };
    const { error } = await supabase.from("bill_runs").upsert(row, { onConflict: "building_id,month" });
    if (error) { setBusy(""); alert("저장 실패: " + error.message); return; }

    // 확정하면 회계 장부의 관리비 부과(미수관리비)로 넘김, 확정 취소하면 뺌
    if (status === "확정") {
      const tt = calc.totals;
      const sumOf = (k) => calc.rows.reduce((s2, r) => s2 + (Number(r[k]) || 0), 0);
      const items = [
        { name: "관리비", total: tt.fee }, { name: "주차비", total: tt.parking },
        { name: settings.elecMode === "공용전기" ? "공용전기료" : "세대전기료", total: tt.elec },
        { name: "세대수도료", total: tt.water },
        { name: "차감액", total: -sumOf("deduct") }, { name: "추가금액", total: sumOf("repair") },
      ].filter((i) => Math.round(i.total)).map((i) => ({ ...i, total: Math.round(i.total * 100) / 100 }));
      const itemsTotal = items.reduce((s2, i) => s2 + i.total, 0);
      const { error: fe } = await supabase.from("fee_charges").upsert({
        building_id: building.id, month, charge_date: `${month}-${String(D).padStart(2, "0")}`, source: "고지서 작업", source_file: "",
        items, units: calc.rows.map((r) => ({ ho: r.ho, charge: r.charge, unpaid: r.unpaid, unpaidLate: 0, area: r.area })),
        totals: { charge: tt.charge, unpaid: tt.unpaid, unpaidLate: 0, items: itemsTotal, rounding: Math.round((tt.charge - itemsTotal) * 100) / 100, units: calc.rows.length },
        late_fee_charged: false,
      }, { onConflict: "building_id,month" });
      if (fe && !/fee_charges/.test(fe.message)) alert("회계 장부로 넘기지 못했어요: " + fe.message);
    } else if (locked) {
      await supabase.from("fee_charges").delete().eq("building_id", building.id).eq("month", month).eq("source", "고지서 작업");
    }
    setBusy("");
    setMsg(status === "확정" ? "확정했습니다." : status === "작성중" && locked ? "확정을 취소했습니다." : "저장했습니다.");
    router.refresh();
  }

  // ---------- 고지서 문구 ----------
  const due = inputs.due ? ymd(inputs.due) : null;
  const info = {
    buildingName: building.name, officeName: settings.officeName, phone: settings.phone,
    periodLabel: `${month.slice(0, 4)}년 ${mm}월분`,
    dueLong: due ? `${due.y}년 ${due.m}월 ${due.d}일(${due.dow}요일)` : "",
    dueShort: due ? `${due.m}월 ${due.d}일까지` : "",
    dueRule: settings.dueRule,
    periods: [
      periodLine("관리비", mm, inputs.feeFrom, inputs.feeTo),
      settings.elecMode !== "없음" ? periodLine("전  기", mm, inputs.elecFrom, inputs.elecTo) : "",
      settings.waterMode !== "없음" ? periodLine("수  도", mm, inputs.waterFrom, inputs.waterTo) : "",
    ].filter(Boolean),
    issueDate: inputs.issue ? inputs.issue.replaceAll("-", ". ") : "",
    bank: settings.bank, account: settings.account, holder: settings.holder,
    elecLabel: settings.elecMode === "공용전기" ? "공용전기료" : "세대전기료",
  };
  const infoFor = (r) => ({
    ...info,
    notice: [settings.notice, r.unpaid ? "관리비가 미납 중입니다. 확인 후 납부를 부탁드립니다." : ""].filter(Boolean),
  });

  // ---------- 출력 ----------
  function printUnits(ids) {
    setPrintSel(ids);
    setTimeout(() => window.print(), 200);
  }

  async function downloadPdfs() {
    if (!confirm(`호실별 고지서 PDF ${calc.rows.length}개를 만들어 압축파일(zip)로 내려받을까요?\n세대 수에 따라 1~2분 걸릴 수 있어요.`)) return;
    setPdfProgress("준비 중…");
    try {
      const [{ default: html2canvas }, { jsPDF }, { default: JSZip }] = await Promise.all([
        import("html2canvas"), import("jspdf"), import("jszip"),
      ]);
      const zip = new JSZip();
      const nodes = Array.from(document.querySelectorAll("#bill-pdf-stage .invoice-sheet"));
      const next = shift(month, 1);
      for (let i = 0; i < nodes.length; i++) {
        const r = calc.rows[i];
        setPdfProgress(`${i + 1} / ${nodes.length} · ${r.ho}호`);
        const canvas = await html2canvas(nodes[i], { scale: 2, backgroundColor: "#ffffff", useCORS: true, logging: false });
        const pdf = new jsPDF({ unit: "mm", format: "a4", orientation: "portrait", compress: true });
        pdf.addImage(canvas.toDataURL("image/jpeg", 0.92), "JPEG", 10, 10, 190, 277);
        zip.file(`${building.name}_${r.ho}호_${month.slice(0, 4)}년${mm}월분(${next.slice(0, 4)}년${Number(next.slice(5))}월고지서).pdf`, pdf.output("blob"));
      }
      setPdfProgress("압축 중…");
      const blob = await zip.generateAsync({ type: "blob" });
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = `${building.name}_${month.slice(0, 4)}년${mm}월분_고지서.zip`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 5000);
    } catch (e) {
      alert("PDF를 만들지 못했어요: " + (e.message || e));
    }
    setPdfProgress("");
  }

  if (setupNeeded) {
    return <div className="card text-sm">고지서 작업 기능을 쓰려면 Supabase에서 <strong>billing.sql</strong>을 한 번 실행해야 합니다.</div>;
  }

  const t = calc.totals;
  const ro = locked;
  const cellIn = "w-full text-right text-xs py-1 px-1.5";
  const noUnits = units.length === 0;
  const missingFee = units.filter((u) => !Number(u.fee_amount)).length;

  return (
    <div>
      <div className="print:hidden">
        {/* 머리 */}
        <div className="flex flex-wrap items-end justify-between gap-3 mb-4">
          <div>
            <div className="text-sm text-inkDim font-medium">{building.name}</div>
            <h1 className="font-display font-bold text-xl">관리비 고지서 작업</h1>
          </div>
          <div className="flex flex-wrap gap-2">
            <button className="btn-ghost" onClick={() => setSettingOpen(true)}>⚙ 고지 설정</button>
            <button className="btn-ghost" onClick={() => setUnitOpen(true)}>🏠 호실 정보</button>
          </div>
        </div>

        <div className="card mb-4">
          <div className="flex items-center justify-between">
            <button className="btn-ghost text-xs" onClick={() => goMonth(shift(month, -1))}>‹ 이전</button>
            <div className="text-center">
              <div className="font-bold text-base"><MonthPick month={month} onChange={goMonth}>{month.slice(0, 4)}년 {mm}월분</MonthPick></div>
              <div className="text-xs text-inkDim">{Number(shift(month, 1).slice(5))}월 고지 · {run ? (locked ? "확정됨" : "작성 중") : "새로 작성"}</div>
            </div>
            <button className="btn-ghost text-xs" onClick={() => goMonth(shift(month, 1))}>다음 ›</button>
          </div>
          {(noUnits || missingFee > 0) && (
            <div className="mt-3 rounded-xl bg-warn/10 text-warn text-xs p-3">
              {noUnits ? "호실이 없습니다. 세대(호실) 설정 메뉴에서 호실을 먼저 등록해주세요."
                : `관리비 금액이 없는 호실이 ${missingFee}개 있어요. [🏠 호실 정보]에서 관리비·주차비·TV 여부를 넣어주세요.`}
            </div>
          )}
          {!settings.account && (
            <div className="mt-3 rounded-xl bg-surface2 text-xs p-3 text-inkDim">고지서에 들어갈 납부 계좌를 [⚙ 고지 설정]에서 넣어주세요.</div>
          )}
        </div>

        {/* 1. 이번 달 자료 */}
        <div className="grid md:grid-cols-2 gap-4 mb-4">
          {settings.elecMode !== "없음" && (
            <div className="card">
              <div className="font-semibold mb-2">⚡ 전기 <span className="text-xs text-inkDim font-normal">{settings.elecMode}</span></div>
              {settings.elecMode === "세대전기" ? (
                <>
                  <button className="btn-ghost text-xs" disabled={ro} onClick={() => kepcoRef.current?.click()}>한전 세대종합 엑셀 올리기</button>
                  <input ref={kepcoRef} type="file" accept=".xls,.xlsx" className="hidden" onChange={(e) => { onKepco(e.target.files?.[0]); e.target.value = ""; }} />
                  {inputs.kepco && (
                    <div className="text-xs text-inkDim mt-2 leading-relaxed">
                      {inputs.kepco.file}<br />
                      세대 {inputs.kepco.units} · 청구 합계 {won(inputs.kepco.claim)}원 · 감면 {won(inputs.kepco.discount)}원 · 공용 {won(inputs.kepco.common)}원(정액관리비에서 지급)
                    </div>
                  )}
                  <Field label="한전 연체료·가산금 (세대 면적으로 나눔)">
                    <Money value={inputs.elecAreaExtra} disabled={ro} onChange={(v) => setInput("elecAreaExtra", v)} />
                  </Field>
                </>
              ) : (
                <Field label="공용전기 청구금액 (세대 면적으로 나눔)">
                  <Money value={inputs.elecCommonTotal} disabled={ro} onChange={(v) => setInput("elecCommonTotal", v)} />
                </Field>
              )}
              <div className="grid grid-cols-2 gap-2 mt-2">
                <Field label="전기 사용기간 시작"><input type="date" disabled={ro} value={inputs.elecFrom} onChange={(e) => setInput("elecFrom", e.target.value)} /></Field>
                <Field label="끝"><input type="date" disabled={ro} value={inputs.elecTo} onChange={(e) => setInput("elecTo", e.target.value)} /></Field>
              </div>
            </div>
          )}
          {settings.waterMode !== "없음" && (
            <div className="card">
              <div className="font-semibold mb-2">💧 수도 <span className="text-xs text-inkDim font-normal">세대수도 · 부산 4구간 단가</span></div>
              <button className="btn-ghost text-xs" disabled={ro} onClick={() => waterRef.current?.click()}>수도 검침표 엑셀 올리기</button>
              <input ref={waterRef} type="file" accept=".xls,.xlsx" className="hidden" onChange={(e) => { onWater(e.target.files?.[0]); e.target.value = ""; }} />
              {inputs.water && <div className="text-xs text-inkDim mt-2">{inputs.water.file} · [{inputs.water.sheet}] 시트</div>}
              <div className="grid grid-cols-2 gap-2 mt-2">
                <Field label="수도 고지서 청구액"><Money value={inputs.waterBill} disabled={ro} onChange={(v) => setInput("waterBill", v)} /></Field>
                <Field label="고지서 사용량 (톤)"><input inputMode="numeric" disabled={ro} value={inputs.waterTons} onChange={(e) => setInput("waterTons", e.target.value.replace(/[^\d]/g, ""))} /></Field>
              </div>
              {n0(inputs.waterTons) > 0 && (
                <div className={"mt-2 rounded-xl p-2.5 text-xs flex items-center gap-2 " + (waterGap ? "bg-warn/10 text-warn" : "bg-ok/10 text-ok")}>
                  <span className="flex-1">세대 사용량 합계 {waterUseSum}톤 / 고지서 {n0(inputs.waterTons)}톤 {waterGap ? `→ ${waterGap > 0 ? "+" : ""}${waterGap}톤 차이` : "✓ 일치"}</span>
                  {waterGap !== 0 && !ro && <button className="btn-ghost text-xs" onClick={applyWaterAdjust}>조정안 보기</button>}
                </div>
              )}
              <div className="grid grid-cols-2 gap-2 mt-2">
                <Field label="수도 사용기간 시작"><input type="date" disabled={ro} value={inputs.waterFrom} onChange={(e) => setInput("waterFrom", e.target.value)} /></Field>
                <Field label="끝"><input type="date" disabled={ro} value={inputs.waterTo} onChange={(e) => setInput("waterTo", e.target.value)} /></Field>
              </div>
            </div>
          )}
          <div className="card">
            <div className="font-semibold mb-2">📅 고지 정보</div>
            <div className="grid grid-cols-2 gap-2">
              <Field label="관리비 부과기간 시작"><input type="date" disabled={ro} value={inputs.feeFrom} onChange={(e) => setInput("feeFrom", e.target.value)} /></Field>
              <Field label="끝"><input type="date" disabled={ro} value={inputs.feeTo} onChange={(e) => setInput("feeTo", e.target.value)} /></Field>
              <Field label="납부마감일"><input type="date" disabled={ro} value={inputs.due} onChange={(e) => setInput("due", e.target.value)} /></Field>
              <Field label="발행일"><input type="date" disabled={ro} value={inputs.issue} onChange={(e) => setInput("issue", e.target.value)} /></Field>
            </div>
          </div>
          <div className="card">
            <div className="font-semibold mb-2">🧾 합계</div>
            <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
              <span className="text-inkDim">관리비·주차비</span><span className="text-right">{won(t.fee + t.parking)}</span>
              <span className="text-inkDim">전기료</span><span className="text-right">{won(t.elec)}</span>
              <span className="text-inkDim">수도료</span><span className="text-right">{won(t.water)}</span>
              <span className="text-inkDim">10원 절사</span><span className="text-right text-inkDim">−{won(t.cut)}</span>
              <span className="font-semibold">당월 부과</span><span className="text-right font-bold">{won(t.charge)}</span>
              <span className="text-inkDim">미납금</span><span className="text-right">{won(t.unpaid)}</span>
              <span className="font-semibold">청구 합계</span><span className="text-right font-bold text-accent">{won(t.total)}</span>
            </div>
            {settings.waterMode !== "없음" && n0(inputs.waterBill) > 0 && (
              <div className={"text-xs mt-2 " + (t.waterBase < 0 ? "text-warn" : "text-inkDim")}>
                수도 세대당 기본료 {won(t.waterBase)}원{t.waterBase < 0 ? " — 사용요금이 청구액보다 많아요. 단가나 청구액을 확인해주세요." : ""}
              </div>
            )}
          </div>
        </div>

        {/* 2. 세대별 */}
        <div className="card mb-4">
          <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
            <div className="font-semibold">세대별 확인 <span className="text-xs text-inkDim font-normal">{units.length}세대 · 회색 칸은 고칠 수 있어요</span></div>
            {!ro && <button className="btn-ghost text-xs" onClick={refreshUnpaid}>미납금 다시 계산</button>}
          </div>
          <div className="overflow-x-auto">
            <table className="text-xs whitespace-nowrap min-w-full">
              <thead>
                <tr className="border-b text-left">
                  <th>호</th><th className="text-right">관리비</th><th>일수</th><th className="text-right">주차비</th>
                  <th className="text-right">한전 청구</th><th className="text-right">감면</th><th className="text-right">전기료</th>
                  <th className="text-right">수도 전월</th><th className="text-right">당월</th><th className="text-right">톤</th><th className="text-right">수도 감면</th><th className="text-right">수도료</th>
                  <th className="text-right">차감</th><th className="text-right">추가</th><th className="text-right">부과</th><th className="text-right">미납</th><th className="text-right">합계</th><th />
                </tr>
              </thead>
              <tbody>
                {calc.rows.map((r) => {
                  const l = lines[r.unit_id];
                  const inp = (k, w = "w-16") => (
                    <input className={cellIn + " " + w} disabled={ro} inputMode="numeric" value={l[k] ?? ""}
                      onChange={(e) => setLine(r.unit_id, k, e.target.value.replace(/[^\d-]/g, ""))} />
                  );
                  return (
                    <tr key={r.unit_id} className="border-b">
                      <td className="font-semibold">{r.ho}호</td>
                      <td className="text-right">{won(r.fee)}</td>
                      <td><div className="flex items-center gap-0.5">{inp("feeUsed", "w-9")}<span className="text-inkDim">/</span>{inp("feeTotal", "w-9")}</div></td>
                      <td className="text-right">{r.parking ? won(r.parking) : "-"}</td>
                      <td className="text-right">{inp("elecClaim", "w-20")}</td>
                      <td className="text-right">{inp("elecDiscount", "w-16")}</td>
                      <td className="text-right font-semibold">{won(r.elec)}</td>
                      <td className="text-right">{inp("waterPrev", "w-14")}</td>
                      <td className="text-right">{inp("waterCur", "w-14")}</td>
                      <td className="text-right">{inp("waterUse", "w-10")}</td>
                      <td className="text-right">{inp("waterDiscount", "w-14")}</td>
                      <td className="text-right font-semibold">{won(r.water)}</td>
                      <td className="text-right">{inp("deduct", "w-16")}</td>
                      <td className="text-right">{inp("repair", "w-16")}</td>
                      <td className="text-right font-bold">{won(r.charge)}</td>
                      <td className="text-right">{inp("unpaid", "w-20")}</td>
                      <td className="text-right font-bold text-accent">{won(r.total)}</td>
                      <td><button className="text-accent underline" onClick={() => printUnits([r.unit_id])}>출력</button></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div className="text-[11px] text-inkDim mt-2 leading-relaxed">
            수도 사용량을 바꾸면 당월지침도 같이 맞춰주세요. 미납금은 지난달 청구 합계에서 그 호실로 지정된 입금을 뺀 값입니다.
            (통장·지출 → 거래내역에서 입금마다 호실을 지정해주세요)
          </div>
        </div>

        {/* 3. 저장 · 출력 */}
        <div className="card mb-4 flex flex-wrap items-center gap-2">
          {msg && <span className="text-sm text-ok mr-auto">{msg}</span>}
          {!msg && <span className="text-xs text-inkDim mr-auto">저장하면 다음에 이어서 작업할 수 있어요. 확정하면 고칠 수 없게 잠깁니다.</span>}
          {!ro && <button className="btn-ghost" disabled={!!busy} onClick={() => save()}>{busy ? "저장 중…" : "저장"}</button>}
          {!ro && <button className="btn-ghost" disabled={!!busy} onClick={() => confirm("이번 달 고지서를 확정할까요?") && save("확정")}>확정</button>}
          {ro && <button className="btn-ghost" disabled={!!busy} onClick={() => confirm("확정을 취소하고 다시 고칠까요?") && save("작성중")}>확정 취소</button>}
          <button className="btn-ghost" disabled={!units.length} onClick={() => printUnits(units.map((u) => u.id))}>🖨 전체 출력</button>
          <button className="btn" disabled={!units.length || !!pdfProgress} onClick={downloadPdfs}>{pdfProgress || "📦 호실별 PDF 내려받기"}</button>
        </div>
      </div>

      {/* 출력용 */}
      {printSel && (
        <div className="hidden print:block">
          <style>{"@page { size: A4; margin: 10mm; }"}</style>
          {calc.rows.filter((r) => printSel.includes(r.unit_id)).map((r, i, arr) => (
            <InvoiceSheet key={r.unit_id} bill={r} info={infoFor(r)} last={i === arr.length - 1} />
          ))}
        </div>
      )}

      {/* PDF 만들기용 (화면 밖) */}
      {pdfProgress && (
        <div id="bill-pdf-stage" style={{ position: "fixed", left: -10000, top: 0, width: "190mm" }} aria-hidden>
          {calc.rows.map((r) => <InvoiceSheet key={r.unit_id} bill={r} info={infoFor(r)} last />)}
        </div>
      )}

      {unitOpen && <UnitEditor units={units} onClose={() => setUnitOpen(false)} />}
      {settingOpen && <SettingsEditor building={building} settings={settings} onClose={() => setSettingOpen(false)} />}
    </div>
  );
}

function Field({ label, children }) {
  return (
    <label className="block mt-2">
      <span className="block text-[11px] text-inkDim mb-0.5">{label}</span>
      {children}
    </label>
  );
}

function Money({ value, onChange, disabled }) {
  return (
    <input inputMode="numeric" disabled={disabled} value={value === "" || value == null ? "" : won(value)}
      onChange={(e) => onChange(e.target.value.replace(/[^\d]/g, ""))} />
  );
}

// 호실별 관리비·주차비·TV·면적
function UnitEditor({ units, onClose }) {
  const router = useRouter();
  const [rows, setRows] = useState(() => units.map((u) => ({ ...u })));
  const [busy, setBusy] = useState(false);
  const set = (id, k, v) => setRows((rs) => rs.map((r) => (r.id === id ? { ...r, [k]: v, _dirty: true } : r)));
  const [bulk, setBulk] = useState("");

  async function save() {
    setBusy(true);
    const supabase = createClient();
    for (const r of rows.filter((x) => x._dirty)) {
      const { error } = await supabase.from("units").update({
        area: r.area === "" ? null : Number(r.area), fee_amount: Number(r.fee_amount) || 0,
        parking_amount: Number(r.parking_amount) || 0, has_tv: !!r.has_tv,
      }).eq("id", r.id);
      if (error) { alert(error.message); setBusy(false); return; }
    }
    setBusy(false);
    onClose();
    router.refresh();
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-end sm:items-center justify-center sm:p-4 z-50" onClick={() => !busy && onClose()}>
      <div className="bg-surface w-full sm:max-w-2xl max-h-[92vh] overflow-y-auto p-5 rounded-t-3xl sm:rounded-3xl" onClick={(e) => e.stopPropagation()}>
        <div className="font-bold text-lg mb-1">호실 정보</div>
        <div className="text-xs text-inkDim mb-3">매달 같은 금액으로 부과하는 관리비·주차비와 TV수신료 부과 여부입니다. 면적은 공용전기·연체료 배분에 쓰입니다.</div>
        <div className="flex items-center gap-2 mb-3">
          <input className="w-32" inputMode="numeric" placeholder="관리비 일괄" value={bulk ? won(bulk) : ""} onChange={(e) => setBulk(e.target.value.replace(/[^\d]/g, ""))} />
          <button className="btn-ghost text-xs" disabled={!bulk} onClick={() => setRows((rs) => rs.map((r) => (Number(r.fee_amount) ? r : { ...r, fee_amount: bulk, _dirty: true })))}>빈 칸에 넣기</button>
        </div>
        <table className="w-full text-sm">
          <thead><tr className="border-b text-left"><th>호실</th><th>면적(㎡)</th><th>관리비</th><th>주차비</th><th>TV</th></tr></thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className="border-b">
                <td className="font-semibold whitespace-nowrap">{`${r.dong || ""} ${r.ho || ""}`.trim()}</td>
                <td><input className="w-20" inputMode="decimal" value={r.area ?? ""} onChange={(e) => set(r.id, "area", e.target.value.replace(/[^\d.]/g, ""))} /></td>
                <td><input className="w-28" inputMode="numeric" value={r.fee_amount ? won(r.fee_amount) : ""} onChange={(e) => set(r.id, "fee_amount", e.target.value.replace(/[^\d]/g, ""))} /></td>
                <td><input className="w-24" inputMode="numeric" value={r.parking_amount ? won(r.parking_amount) : ""} onChange={(e) => set(r.id, "parking_amount", e.target.value.replace(/[^\d]/g, ""))} /></td>
                <td><input type="checkbox" checked={!!r.has_tv} onChange={(e) => set(r.id, "has_tv", e.target.checked)} /></td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="flex gap-2 justify-end mt-4">
          <button className="btn-ghost" disabled={busy} onClick={onClose}>닫기</button>
          <button className="btn" disabled={busy} onClick={save}>{busy ? "저장 중…" : "저장"}</button>
        </div>
      </div>
    </div>
  );
}

// 건물별 고지 설정
function SettingsEditor({ building, settings, onClose }) {
  const router = useRouter();
  const [s, setS] = useState(settings);
  const [busy, setBusy] = useState(false);
  const set = (k, v) => setS((x) => ({ ...x, [k]: v }));
  async function save() {
    setBusy(true);
    const supabase = createClient();
    const { error } = await supabase.from("buildings").update({ billing_settings: s }).eq("id", building.id);
    setBusy(false);
    if (error) { alert(error.message); return; }
    onClose();
    router.refresh();
  }
  return (
    <div className="fixed inset-0 bg-black/50 flex items-end sm:items-center justify-center sm:p-4 z-50" onClick={() => !busy && onClose()}>
      <div className="bg-surface w-full sm:max-w-lg max-h-[92vh] overflow-y-auto p-5 rounded-t-3xl sm:rounded-3xl" onClick={(e) => e.stopPropagation()}>
        <div className="font-bold text-lg mb-3">고지 설정 · {building.name}</div>
        <div className="grid grid-cols-2 gap-2">
          <Field label="전기">
            <select value={s.elecMode} onChange={(e) => set("elecMode", e.target.value)}>
              <option value="세대전기">세대전기 (한전 세대종합)</option>
              <option value="공용전기">공용전기 (면적 배분)</option>
              <option value="없음">부과 없음</option>
            </select>
          </Field>
          <Field label="수도">
            <select value={s.waterMode} onChange={(e) => set("waterMode", e.target.value)}>
              <option value="세대수도">세대수도</option>
              <option value="없음">부과 없음</option>
            </select>
          </Field>
          <Field label="TV수신료 (세대당)"><input inputMode="numeric" value={s.tvFee} onChange={(e) => set("tvFee", e.target.value.replace(/[^\d]/g, ""))} /></Field>
          <Field label="문의전화"><input value={s.phone} onChange={(e) => set("phone", e.target.value)} /></Field>
          <Field label="은행"><input value={s.bank} placeholder="카카오뱅크" onChange={(e) => set("bank", e.target.value)} /></Field>
          <Field label="예금주"><input value={s.holder} onChange={(e) => set("holder", e.target.value)} /></Field>
        </div>
        <Field label="계좌번호"><input value={s.account} onChange={(e) => set("account", e.target.value)} /></Field>
        <Field label="관리사무소 이름"><input value={s.officeName} onChange={(e) => set("officeName", e.target.value)} /></Field>
        <Field label="납부마감 안내"><input value={s.dueRule} onChange={(e) => set("dueRule", e.target.value)} /></Field>
        <Field label="안내문"><input value={s.notice} onChange={(e) => set("notice", e.target.value)} /></Field>
        <div className="flex gap-2 justify-end mt-4">
          <button className="btn-ghost" disabled={busy} onClick={onClose}>닫기</button>
          <button className="btn" disabled={busy} onClick={save}>{busy ? "저장 중…" : "저장"}</button>
        </div>
      </div>
    </div>
  );
}
