"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabaseClient";

export default function LoginPage() {
  const router = useRouter();
  const supabase = createClient();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");
    setLoading(true);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setLoading(false);
    if (error) {
      setError(
        error.message.includes("Invalid login")
          ? "이메일 또는 비밀번호가 올바르지 않습니다."
          : error.message
      );
      return;
    }
    router.push("/dashboard");
    router.refresh();
  }

  return (
    <div className="min-h-screen flex flex-col md:flex-row">
      <div className="flex-1 hidden md:flex flex-col justify-center px-16 border-r border-border bg-gradient-to-br from-white to-bg">
        <img src="/jinius_logo.png" alt="지니어스 JINIUS" className="w-48 h-auto mb-10" />
        <div className="font-display text-2xl text-inkDim leading-relaxed">
          건물·시설 관리업무의 스마트한 시작<br />
          <strong className="text-ink text-4xl block mt-1">지니어스</strong>
        </div>
      </div>
      <div className="flex-1 flex flex-col items-center justify-center p-8 bg-surface">
        <form onSubmit={handleSubmit} className="w-full max-w-sm">
          <img src="/jinius_logo.png" alt="지니어스 JINIUS" className="w-40 h-auto mx-auto mb-4" />
          <div className="text-center text-sm text-inkDim mb-6">
            안녕하세요! 지니어스와 함께 건물을 더 스마트하게 관리해보세요.
          </div>
          {error && (
            <div className="border border-warn text-warn bg-warn/10 text-sm rounded-lg px-3 py-2 mb-3">{error}</div>
          )}
          <div className="mb-3">
            <input type="email" required placeholder="이메일" value={email} onChange={(e) => setEmail(e.target.value)} />
          </div>
          <div className="mb-4">
            <input type="password" required placeholder="비밀번호" value={password} onChange={(e) => setPassword(e.target.value)} />
          </div>
          <button className="btn w-full justify-center" disabled={loading} type="submit">
            {loading ? "로그인 중…" : "로그인"}
          </button>
          <div className="text-center text-sm mt-4">
            <Link href="/signup" className="text-accent font-medium">회원가입</Link>
          </div>
        </form>
      </div>
    </div>
  );
}
