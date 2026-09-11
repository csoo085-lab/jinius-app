export const NAV_GROUPS = [
  {
    label: null,
    items: [
      { href: "/dashboard", label: "전체 현황", roles: ["관리자", "담당자", "고객"] },
      { href: "/dashboard/buildings", label: "건물 정보", roles: ["관리자"] },
      // 고객은 건물별 하위 메뉴가 없으므로 본인 관련 메뉴를 최상위에 그대로 노출
      { href: "/dashboard/complaints", label: "민원·고장신고", roles: ["고객"] },
      { href: "/dashboard/fees", label: "관리비 고지서", roles: ["고객"] },
    ],
  },
  {
    label: "회사",
    items: [
      { href: "/dashboard/regulations", label: "법령 자료실", roles: ["관리자", "담당자"] },
      { href: "/dashboard/users", label: "사용자 설정", roles: ["관리자"] },
    ],
  },
];

// 건물마다 반복되는 업무 메뉴 (관리자·담당자 전용) — 사이드바에서 건물별로 중첩 렌더링됨.
// 실제 링크는 `${hrefBase}?building=<건물ID>` 형태로 만들어짐 (각 페이지가 이미 지원하는 방식)
export const BUILDING_SUB_ITEMS = [
  { hrefBase: "/dashboard/units", label: "세대(호실) 설정", roles: ["관리자"] },
  { hrefBase: "/dashboard/facilities", label: "시설현황", roles: ["관리자", "담당자"] },
  { hrefBase: "/dashboard/inspections", label: "시설점검", roles: ["관리자", "담당자"] },
  { hrefBase: "/dashboard/institutions", label: "기관·업체", roles: ["관리자", "담당자"] },
  { hrefBase: "/dashboard/complaints", label: "민원·고장신고", roles: ["관리자", "담당자"] },
  { hrefBase: "/dashboard/fees", label: "관리비 고지서", roles: ["관리자", "담당자"] },
  { hrefBase: "/dashboard/meters", label: "검침 관리", roles: ["관리자", "담당자"] },
];

export const NAV_ITEMS = [
  ...NAV_GROUPS.flatMap((g) => g.items),
  ...BUILDING_SUB_ITEMS.map((i) => ({ href: i.hrefBase, label: i.label, roles: i.roles })),
];

export function canAccess(role, href) {
  const item = NAV_ITEMS.find((n) => n.href === href);
  return item ? item.roles.includes(role) : true;
}
