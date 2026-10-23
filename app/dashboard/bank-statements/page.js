import { redirect } from "next/navigation";

// 통장내역은 "통장·지출" 메뉴의 [통장 파일] 탭으로 통합되었습니다.
// 예전 주소(즐겨찾기 등)로 들어오면 새 화면으로 자동 이동합니다.
export default function BankStatementsPage({ searchParams }) {
  const params = new URLSearchParams();
  params.set("tab", "files");
  if (searchParams?.building) params.set("building", searchParams.building);
  redirect(`/dashboard/expenses?${params.toString()}`);
}
