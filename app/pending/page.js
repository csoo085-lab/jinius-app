import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/session";
import LogoutButton from "@/components/LogoutButton";

export const dynamic = "force-dynamic";

export default async function PendingPage() {
  const { user, approved } = await getCurrentUser();
  if (!user) redirect("/login");
  if (approved) redirect("/dashboard");

  return (
    <div className="min-h-screen flex items-center justify-center bg-surface p-8">
      <div className="w-full max-w-sm text-center">
        <img src="/jinius_logo.png" alt="지니어스 JINIUS" className="w-40 h-auto mx-auto mb-6" />
        <div className="font-display font-bold text-xl mb-3">가입 승인 대기중입니다</div>
        <p className="text-sm text-inkDim leading-relaxed mb-8">
          회원가입이 접수되었습니다. 관리자가 확인 후 승인하면
          <br />
          서비스를 이용하실 수 있습니다. 잠시만 기다려주세요.
        </p>
        <LogoutButton className="btn w-full justify-center" />
      </div>
    </div>
  );
}
