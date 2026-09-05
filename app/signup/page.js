"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabaseClient";

const ROLES = ["관리자", "담당자", "고객"];

export default function SignupPage() {
  const router = useRouter();
  const supabase = createClient();
  const [displayName, setDisplayName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [password2, setPassword2] = useState("");
  const [role, setRole] = useState("고객");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");
    setNotice("");
    if (password.length < 6) {
      setError("비밀번호는 6자 이상 입력해주세요.");
      return;
    }
    if (password !== password2) {
      setError("비밀번호가 일치하지 않습니다.");
      return;
    }
    setLoading(true);
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { display_name: displayName || email.split("@")[0], role } },
    });
    setLoading(false);
    if (error) {
      setError(error.message);
      return;
    }
    if (data.session) {
      router.push("/dashboard");
      router.refresh();
    } else {
      setNotice("가입 확인 이메일을 보냈습니다. 메일함을 확인한 뒤 로그인해주세요. (관리자가 이메일 확인을 껐다면 바로 로그인하셔도 됩니다.)");
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-surface p-8">
      <form onSubmit={handleSubmit} className="w-full max-w-sm">
        <div className="font-display font-bold text-accent tracking-widest text-center mb-6">회원가입</div>
        {error && <div className="border border-warn text-warn bg-warn/10 text-sm rounded-lg px-3 py-2 mb-3">{error}</div>}
        {notice && <div className="border border-ok text-ok bg-ok/10 text-sm rounded-lg px-3 py-2 mb-3">{notice}</div>}
        <div className="mb-3">
          <input placeholder="이름 (표시용)" value={displayName} onChange={(e) => setDisplayName(e.target.value)} />
        </div>
        <div className="mb-3">
          <input type="email" required placeholder="이메일" value={email} onChange={(e) => setEmail(e.target.value)} />
        </div>
        <div className="mb-3">
          <input type="password" required placeholder="비밀번호 (6자 이상)" value={password} onChange={(e) => setPassword(e.target.value)} />
        </div>
        <div className="mb-4">
          <input type="password" required placeholder="비밀번호 확인" value={password2} onChange={(e) => setPassword2(e.target.value)} />
        </div>
        <label className="text-xs text-inkDim font-medium block mb-1">역할</label>
        <div className="flex gap-2 mb-5">
          {ROLES.map((r) => (
            <button
              type="button"
              key={r}
              onClick={() => setRole(r)}
              className={
                "flex-1 py-2 rounded-lg text-sm border " +
                (role === r ? "bg-accent text-white border-accent font-semibold" : "bg-surface2 border-border text-inkDim")
              }
            >
              {r}
            </button>
          ))}
        </div>
        <button className="btn w-full justify-center" disabled={loading} type="submit">
          {loading ? "가입 중…" : "가입 완료"}
        </button>
        <p className="text-xs text-inkDim text-center mt-3 leading-relaxed">
          가장 먼저 가입하는 계정은 역할과 관계없이 자동으로 관리자가 됩니다.
        </p>
        <div className="text-center text-sm mt-4">
          <Link href="/login" className="text-accent font-medium">로그인 화면으로</Link>
        </div>
      </form>
    </div>
  );
}
