// 세대별 관리비 고지서 (A4 세로 한 장)
//  ① 관리비 부과 내역서 (입주민 보관)  ✂  ② 입금확인증  ✂  ③ 납입영수증 (관리사무소용)

const NAVY = "#1f2a44";
const BLUE = "#2563eb";
const RED = "#e11d48";
const LINE = "#d9dee8";
const SOFT = "#f3f5f9";
const ZOOM = 1.45;

const won = (n) => Math.round(Number(n) || 0).toLocaleString("ko-KR");
const num = (n) => (n == null || n === "" ? "-" : Math.round(Number(n)).toLocaleString("ko-KR"));

function Cut({ label }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 6, margin: "7px 0", color: "#8a93a6", fontSize: 7.5 }}>
      <span style={{ fontSize: 10 }}>✂</span>
      <div style={{ flex: 1, borderTop: "1px dashed #b8c0cf" }} />
      <span style={{ letterSpacing: 2 }}>{label}</span>
      <div style={{ flex: 1, borderTop: "1px dashed #b8c0cf" }} />
    </div>
  );
}

function Band({ title, sub, right }) {
  return (
    <div style={{ background: NAVY, color: "#fff", padding: "7px 12px", display: "flex", alignItems: "center", justifyContent: "space-between", borderRadius: "6px 6px 0 0" }}>
      <div>
        <div style={{ fontSize: 13, fontWeight: 800, letterSpacing: -0.2 }}>{title}</div>
        {sub && <div style={{ fontSize: 7.5, opacity: 0.8, marginTop: 1 }}>{sub}</div>}
      </div>
      <div style={{ textAlign: "right" }}>{right}</div>
    </div>
  );
}

function Unit({ info, bill, light }) {
  return (
    <div style={{ fontSize: 8, color: light ? "rgba(255,255,255,.8)" : "#555" }}>
      {info.buildingName}
      <span style={{ fontSize: 14, fontWeight: 800, marginLeft: 6, color: light ? "#fff" : NAVY }}>{bill.ho}호</span>
      <span style={{ marginLeft: 3 }}>귀하</span>
    </div>
  );
}

// 비용 한 줄
function Item({ label, value, sub, minus, strong, indent }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", padding: indent ? "1.5px 0 1.5px 10px" : "4px 0",
      borderBottom: indent ? "none" : `1px solid ${LINE}`, fontSize: indent ? 7.8 : 9, color: indent ? "#667085" : "#111", fontWeight: strong ? 700 : 400 }}>
      <span>{label}{sub && <span style={{ fontSize: 7.3, color: "#8a93a6", marginLeft: 4 }}>{sub}</span>}</span>
      <span style={{ color: minus ? RED : undefined, fontVariantNumeric: "tabular-nums" }}>{minus ? "−" : ""}{won(Math.abs(value))}</span>
    </div>
  );
}

function Account({ info, compact }) {
  return (
    <div style={{ border: `1.5px solid ${NAVY}`, borderRadius: 6, padding: compact ? "4px 8px" : "6px 10px", background: "#fff" }}>
      <div style={{ fontSize: 7.3, color: "#667085", marginBottom: 1 }}>납부 계좌</div>
      <div style={{ display: "flex", alignItems: "baseline", gap: 6, flexWrap: "wrap" }}>
        <span style={{ fontWeight: 700, fontSize: compact ? 8.5 : 9.5 }}>{info.bank}</span>
        <span style={{ fontWeight: 800, fontSize: compact ? 10 : 12, color: NAVY, letterSpacing: 0.3 }}>{info.account}</span>
        <span style={{ fontSize: 8, color: "#555" }}>예금주 {info.holder}</span>
      </div>
    </div>
  );
}

function Stamp({ labels }) {
  return (
    <div style={{ display: "flex", gap: 4 }}>
      {labels.map((l) => (
        <div key={l} style={{ border: `1px solid ${LINE}`, borderRadius: 4, width: 54, textAlign: "center" }}>
          <div style={{ background: SOFT, fontSize: 7, padding: "1.5px 0", borderBottom: `1px solid ${LINE}` }}>{l}</div>
          <div style={{ height: 34 }} />
        </div>
      ))}
    </div>
  );
}

// 관리사무소용 · 입금확인증 공통 요약
function Mini({ bill }) {
  const row = (k, v, strong, color) => (
    <div style={{ display: "flex", justifyContent: "space-between", padding: "2.5px 0", borderBottom: `1px solid ${LINE}`, fontWeight: strong ? 800 : 400, fontSize: strong ? 10 : 8.5, color }}>
      <span>{k}</span><span style={{ fontVariantNumeric: "tabular-nums" }}>{won(v)}</span>
    </div>
  );
  return (
    <div>
      {row("당월 관리비", bill.charge)}
      {row("미납금", bill.unpaid)}
      {row("납부하실 금액", bill.total, true, BLUE)}
    </div>
  );
}

export function InvoiceSheet({ bill, info, last = false }) {
  const elecItems = [];
  if (bill.elecDiscount) {
    elecItems.push(["감면 전 금액", bill.elecGross], [`감면금액${bill.elecDiscountType ? `(${bill.elecDiscountType})` : ""}`, -bill.elecDiscount]);
  }
  const waterItems = [];
  if (bill.waterDiscount) {
    waterItems.push(["감면 전 금액", bill.waterGross], [`감면금액${bill.waterDiscountType ? `(${bill.waterDiscountType})` : ""}`, -bill.waterDiscount]);
  }
  const cut = Math.round(bill.net) - bill.charge;

  return (
    <section className="invoice-sheet" style={{
      width: "190mm", height: "277mm", overflow: "hidden", boxSizing: "border-box",
      breakAfter: last ? "auto" : "page", pageBreakAfter: last ? "auto" : "always", background: "#fff", WebkitPrintColorAdjust: "exact", printColorAdjust: "exact",
    }}>
    {/* 글자 크기를 한 번에 키우기 위해 확대 (A4 한 장을 채움) — PDF 파일 만들기에서도 그대로 보이도록 transform 사용 */}
    <div style={{
      transform: `scale(${ZOOM})`, transformOrigin: "top left", width: `${190 / ZOOM}mm`, height: `${277 / ZOOM}mm`,
      color: "#111", background: "#fff", fontSize: 8.5, fontFamily: "inherit", display: "flex", flexDirection: "column", justifyContent: "space-between",
    }}>
      {/* ① 부과 내역서 */}
      <div style={{ border: `1px solid ${LINE}`, borderRadius: 7 }}>
        <Band title={`${info.periodLabel} 관리비 부과 내역서`} sub={`${info.officeName} · 문의 ${info.phone}`} right={<Unit info={info} bill={bill} light />} />
        <div style={{ display: "flex", gap: 12, padding: "10px 12px 10px" }}>
          {/* 왼쪽: 금액 */}
          <div style={{ width: "52%" }}>
            <div style={{ background: SOFT, borderRadius: 6, padding: "8px 12px", display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
              <div>
                <div style={{ fontSize: 8, color: "#667085" }}>납부하실 금액</div>
                <div style={{ fontSize: 22, fontWeight: 800, color: BLUE, letterSpacing: -0.5, lineHeight: 1.15 }}>{won(bill.total)}<span style={{ fontSize: 11, marginLeft: 2 }}>원</span></div>
              </div>
              <div style={{ textAlign: "right" }}>
                <div style={{ fontSize: 7.5, color: "#667085" }}>납부마감</div>
                <div style={{ fontSize: 10.5, fontWeight: 800, color: NAVY }}>{info.dueShort}</div>
              </div>
            </div>
            <Item label="관리비" value={bill.fee} />
            {bill.parking ? <Item label="차량주차비" value={bill.parking} /> : null}
            <Item label={info.elecLabel || "세대전기료"} value={bill.elec} sub={bill.elecDiscount ? "감면 적용" : ""} />
            {elecItems.map(([k, v]) => <Item key={k} label={k} value={v} minus={v < 0} indent />)}
            <Item label={info.waterLabel || "세대수도료"} value={bill.water} sub={bill.waterUse != null ? `${num(bill.waterUse)}톤` : ""} />
            {waterItems.map(([k, v]) => <Item key={k} label={k} value={v} minus={v < 0} indent />)}
            {bill.deduct ? <Item label="차감금액" value={-bill.deduct} minus /> : null}
            {bill.repair ? <Item label="추가금액" value={bill.repair} /> : null}
            {cut > 0 && <Item label="10원 미만 절사" value={-cut} minus />}
            <div style={{ display: "flex", justifyContent: "space-between", padding: "5px 0", fontWeight: 800, fontSize: 10, color: NAVY, borderBottom: `1.5px solid ${NAVY}` }}>
              <span>당월 관리비</span><span>{won(bill.charge)}</span>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", padding: "4px 0", fontSize: 9, color: bill.unpaid ? RED : "#667085" }}>
              <span>미납금</span><span>{won(bill.unpaid)}</span>
            </div>
          </div>

          {/* 오른쪽: 검침 · 기간 · 계좌 · 안내 */}
          <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 8 }}>
            <div>
              <div style={{ fontSize: 8, fontWeight: 700, color: NAVY, marginBottom: 3 }}>검침 정보</div>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 8 }}>
                <thead>
                  <tr style={{ background: SOFT }}>
                    {["구분", "전월지침", "당월지침", "사용량"].map((h) => <th key={h} style={{ padding: "3px 4px", fontWeight: 600, textAlign: h === "구분" ? "left" : "right", borderBottom: `1px solid ${LINE}` }}>{h}</th>)}
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td style={{ padding: "3px 4px", borderBottom: `1px solid ${LINE}` }}>전기 (kWh)</td>
                    <td style={{ padding: "3px 4px", textAlign: "right", borderBottom: `1px solid ${LINE}` }}>{num(bill.elecPrev)}</td>
                    <td style={{ padding: "3px 4px", textAlign: "right", borderBottom: `1px solid ${LINE}` }}>{num(bill.elecCur)}</td>
                    <td style={{ padding: "3px 4px", textAlign: "right", fontWeight: 700, borderBottom: `1px solid ${LINE}` }}>{bill.elecCur != null && bill.elecPrev != null ? num(bill.elecCur - bill.elecPrev) : "-"}</td>
                  </tr>
                  <tr>
                    <td style={{ padding: "3px 4px" }}>수도 (톤)</td>
                    <td style={{ padding: "3px 4px", textAlign: "right" }}>{num(bill.waterPrev)}</td>
                    <td style={{ padding: "3px 4px", textAlign: "right" }}>{num(bill.waterCur)}</td>
                    <td style={{ padding: "3px 4px", textAlign: "right", fontWeight: 700 }}>{num(bill.waterUse)}</td>
                  </tr>
                </tbody>
              </table>
            </div>
            <div>
              <div style={{ fontSize: 8, fontWeight: 700, color: NAVY, marginBottom: 2 }}>부과 기간</div>
              {(info.periods || []).map((p, i) => <div key={i} style={{ fontSize: 7.8, lineHeight: 1.6, color: "#333" }}>· {p}</div>)}
            </div>
            <Account info={info} />
            <div style={{ fontSize: 7.4, lineHeight: 1.6, color: "#475467" }}>
              <div>· 납부마감 {info.dueLong}</div>
              <div>· {info.dueRule}</div>
              <div>· 입금하실 때 <b style={{ color: NAVY }}>송금인 이름 앞에 호수</b>를 꼭 적어주세요.</div>
              <div>· 연체 시 연체료가 부과됩니다. <span style={{ color: "#8a93a6" }}>(미납금 × 연 15% × 연체일수/365, 부산광역시공동주택관리규약 제66조)</span></div>
              {(info.notice || []).map((t, i) => <div key={i} style={{ color: /미납/.test(t) ? RED : undefined }}>· {t}</div>)}
            </div>
          </div>
        </div>
      </div>

      <Cut label="입주민 보관" />

      {/* ② 입금확인증 */}
      <div style={{ border: `1px solid ${LINE}`, borderRadius: 7, overflow: "hidden" }}>
        <Band title="입금확인증" sub={`${info.periodLabel} 관리비`} right={<Unit info={info} bill={bill} light />} />
        <div style={{ display: "flex", gap: 12, padding: "8px 12px", alignItems: "center" }}>
          <table style={{ flex: 1, borderCollapse: "collapse", fontSize: 8.5 }}>
            <tbody>
              <tr style={{ background: SOFT }}>
                {["입금일자", "납부형태", "입금금액"].map((h) => <th key={h} style={{ padding: "3px 6px", fontWeight: 600, border: `1px solid ${LINE}` }}>{h}</th>)}
              </tr>
              <tr>
                <td style={{ padding: "8px 6px", border: `1px solid ${LINE}`, width: "32%" }} />
                <td style={{ padding: "8px 6px", border: `1px solid ${LINE}`, textAlign: "center" }}>직접입금</td>
                <td style={{ padding: "8px 6px", border: `1px solid ${LINE}`, textAlign: "right", fontWeight: 800 }}>{won(bill.total)}원</td>
              </tr>
            </tbody>
          </table>
          <div style={{ width: "34%", textAlign: "center", fontSize: 8 }}>
            <div>위의 금액의 입금을 확인합니다.</div>
            <div style={{ marginTop: 4, color: "#667085" }}>발행일 {info.issueDate}</div>
            <div style={{ marginTop: 3, fontWeight: 800, color: NAVY }}>{info.officeName}</div>
          </div>
        </div>
      </div>

      <Cut label="관리사무소 보관" />

      {/* ③ 관리사무소용 */}
      <div style={{ border: `1px solid ${LINE}`, borderRadius: 7, overflow: "hidden" }}>
        <Band title="관리비 납입영수증 (관리사무소용)" sub={info.periodLabel} right={<Unit info={info} bill={bill} light />} />
        <div style={{ display: "flex", gap: 12, padding: "8px 12px", alignItems: "flex-start" }}>
          <div style={{ width: "40%" }}>
            <Mini bill={bill} />
            <div style={{ fontSize: 7.8, color: "#667085", marginTop: 4 }}>납부마감 <b style={{ color: NAVY }}>{info.dueShort}</b></div>
          </div>
          <div style={{ flex: 1 }}>
            <Account info={info} compact />
            <div style={{ fontSize: 7.5, color: "#667085", marginTop: 4 }}>
              관리비 {won(bill.fee)} · 주차 {won(bill.parking)} · 전기 {won(bill.elec)} · 수도 {won(bill.water)}
            </div>
          </div>
          <Stamp labels={["수납은행인", "취급자인"]} />
        </div>
      </div>
    </div>
    </section>
  );
}
