import { redirect } from "next/navigation";

// 시설점검은 시설관리 화면으로 합쳐짐 — 예전 주소로 들어오면 시설관리로 이동
export default function InspectionsPage({ searchParams }) {
  const building = searchParams?.building;
  redirect(building ? `/dashboard/facilities?building=${building}` : "/dashboard/facilities");
}
