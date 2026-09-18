import { cache } from "react";
import { createClient } from "./supabaseServer";

// 한 번의 페이지 요청(내비게이션) 안에서 layout.js와 각 page.js가 똑같이
// "로그인 확인 + 내 역할(role) 조회"를 중복 호출하던 것을 하나로 합칩니다.
// React의 cache()는 같은 요청 안에서 이 함수가 여러 번 호출되어도 실제로는
// 딱 한 번만 실행하고, 나머지 호출은 그 결과를 그대로 재사용합니다.
// (Supabase auth.getUser()는 매번 인증 서버에 네트워크로 확인하는 방식이라
//  느린 편인데, 페이지마다 이걸 또 부르던 게 체감 속도 저하의 주요 원인이었습니다.)
export const getCurrentUser = cache(async () => {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { user: null, role: "고객", displayName: "" };

  const { data: me } = await supabase
    .from("profiles")
    .select("display_name, role")
    .eq("id", user.id)
    .single();

  return {
    user,
    role: me?.role || "고객",
    displayName: me?.display_name || user.email,
  };
});
