// 국가승강기정보센터 '승강기 정보 조회' 화면을 복사(Ctrl+A → Ctrl+C)한 텍스트에서
// 시설 상세 항목 값을 뽑아내는 함수. 화면 라벨 → 앱 항목명 매핑.

// 가로형 표 (라벨 | 값 | 라벨 | 값)
const PAIR_LABELS = {
  "승강기번호": "승강기번호",
  "제조업체": "제조사",
  "모델명": "모델명",
  "종류": "종류",
  "상태": "상태",
  "적재하중": "적재하중",
  "최대정원": "정원(인승)",
  "운행구간": "운행구간",
  "운행층수": "운행층수",
  "정격속도": "정격속도",
  "최종검사일": "최종검사일",
  "검사유효기간": "검사유효기간",
  "설치일/최초설치일": "설치일",
  "다음정기검사주기": "정기검사주기",
  "유지관리업체명": "유지보수업체",
  "유지관리업체연락처": "유지보수업체 연락처",
  "최종검사기관": "검사기관",
};

// 세로형 표 (머리글 줄 다음 줄이 값) — 첫 번째 데이터 줄(가장 최근)만 사용
const TABLE_LABELS = {
  "보험사명": "보험사",
  "보험상품명": "보험상품",
  "보장기간": "보험 보장기간",
  "안전관리자명": "안전관리자",
  "안전관리자선임일": "안전관리자 선임일",
  "교육유효기간": "안전관리자 교육 유효기간",
  "합격유무": "최근 검사결과",
  "점검업체": "자체점검업체",
  "점검일자": "최근 자체점검일",
  "자체점검결과": "최근 자체점검결과",
};

// 공백·괄호 설명 제거 후 비교 ("검사유효기간 (보완기간)" → "검사유효기간")
function norm(s) {
  return String(s || "").replace(/\(.*?\)/g, "").replace(/\s+/g, "").trim();
}

function cleanValue(key, v) {
  let s = String(v || "").replace(/\s+/g, " ").trim();
  if (key === "설치일") s = s.split("/")[0].trim(); // "2019-09-05 / 2019-09-05" → 앞 날짜
  if (key === "종류") s = s.replace(/\(\s*/g, "(").replace(/\s*\)/g, ")");
  if (/^[-–]$/.test(s)) s = "";
  return s;
}

/**
 * @param {string} text 붙여넣은 원문
 * @returns {{ key: string, value: string }[]} 찾은 값 목록 (빈 값 제외)
 */
export function parseElevatorText(text) {
  const found = {};
  const set = (key, value) => {
    const v = cleanValue(key, value);
    if (v && !found[key]) found[key] = v;
  };

  const lines = String(text || "").replace(/\r/g, "").split("\n");
  const rows = lines.map((l) => l.split("\t").map((c) => c.trim())).filter((r) => r.some(Boolean));

  // 칸 안의 줄바꿈(예: 점검반 "전***<br>김***") 때문에 한 행이 여러 줄로 쪼개진 경우 다시 합침
  function joinRow(start, wantCells) {
    let row = rows[start] ? [...rows[start]] : null;
    let k = start + 1;
    while (row && row.length < wantCells && rows[k]) {
      const more = rows[k];
      row[row.length - 1] = (row[row.length - 1] + " " + more[0]).trim();
      row = row.concat(more.slice(1));
      k++;
    }
    return row && row.length === wantCells ? row : null;
  }

  rows.forEach((cells, i) => {
    // 1) 세로형 표: 이 줄의 칸 중 2개 이상이 알려진 머리글이면 다음 행을 값으로 매핑
    const headerHits = cells.filter((c) => TABLE_LABELS[norm(c)]).length;
    if (headerHits >= 2) {
      const next = joinRow(i + 1, cells.length);
      if (next) {
        cells.forEach((c, j) => {
          const key = TABLE_LABELS[norm(c)];
          if (key) set(key, next[j]);
        });
      }
      return;
    }
    // 2) 가로형 표: 라벨 바로 다음 칸이 값
    cells.forEach((c, j) => {
      const key = PAIR_LABELS[norm(c)];
      if (!key) return;
      if (j + 1 < cells.length) {
        if (!PAIR_LABELS[norm(cells[j + 1])]) set(key, cells[j + 1]);
      } else if (rows[i + 1]) {
        // 라벨 칸 안의 줄바꿈("검사유효기간<br>(보완기간)")으로 값이 다음 줄로 밀린 경우
        const value = rows[i + 1].find((x) => norm(x));
        if (value && !PAIR_LABELS[norm(value)] && !TABLE_LABELS[norm(value)]) set(key, value);
      }
    });
  });

  // 3) 탭 없이 줄바꿈으로만 복사된 경우: 라벨 줄 다음 줄을 값으로
  if (Object.keys(found).length < 3) {
    const flat = lines.map((l) => l.trim()).filter(Boolean);
    flat.forEach((l, i) => {
      const key = PAIR_LABELS[norm(l)];
      const nextLine = flat[i + 1];
      if (key && nextLine && !PAIR_LABELS[norm(nextLine)] && !TABLE_LABELS[norm(nextLine)]) set(key, nextLine);
    });
  }

  // 승강기번호 "8105187" → "8105-187" (정보센터 표기)
  if (found["승강기번호"] && /^\d{7}$/.test(found["승강기번호"])) {
    found["승강기번호"] = found["승강기번호"].replace(/^(\d{4})(\d{3})$/, "$1-$2");
  }

  return Object.entries(found).map(([key, value]) => ({ key, value }));
}
