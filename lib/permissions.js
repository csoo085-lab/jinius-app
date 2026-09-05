export const NAV_ITEMS = [
  { href: "/dashboard", label: "대시보드", roles: ["관리자", "담당자", "고객"] },
  { href: "/dashboard/inspections", label: "시설점검", roles: ["관리자", "담당자"] },
  { href: "/dashboard/facilities", label: "시설현황", roles: ["관리자", "담당자"] },
  { href: "/dashboard/complaints", label: "민원·고장신고", roles: ["관리자", "담당자", "고객"] },
  { href: "/dashboard/fees", label: "관리비 고지서", roles: ["관리자", "담당자", "고객"] },
  { href: "/dashboard/meters", label: "검침 관리", roles: ["관리자", "담당자"] },
  { href: "/dashboard/units", label: "세대(호실) 설정", roles: ["관리자"] },
  { href: "/dashboard/buildings", label: "건물 설정", roles: ["관리자"] },
  { href: "/dashboard/users", label: "사용자 설정", roles: ["관리자"] },
];

export function canAccess(role, href) {
  const item = NAV_ITEMS.find((n) => n.href === href);
  return item ? item.roles.includes(role) : true;
}
