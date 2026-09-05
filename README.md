# 지니어스(JINIUS) 정식 웹앱 — 배포 가이드

개발 경험이 없어도 아래 순서대로 따라 하시면 실제 인터넷 주소를 가진 웹앱을 만들 수 있어요.
전체 과정은 두 개의 무료 서비스를 사용합니다.

- **Supabase**: 데이터베이스 + 회원 로그인(인증) + 파일 저장을 담당
- **Vercel**: 화면(웹사이트)을 실제로 인터넷에 띄우는 역할

---

## 1단계. Supabase 프로젝트 만들기

1. https://supabase.com 접속 → 회원가입 (GitHub 계정으로 가입하면 이후 Vercel 연동이 쉬워요)
2. "New Project" 클릭
3. 프로젝트 이름: `jinius` (아무 이름이나 가능)
4. Database Password: 임의의 비밀번호 입력 후 **꼭 별도로 메모**해두세요
5. Region: `Northeast Asia (Seoul)` 선택 (한국에서 가장 빠릅니다)
6. "Create new project" 클릭 후 1~2분 대기

## 2단계. 데이터베이스 테이블 만들기

1. 왼쪽 메뉴에서 **SQL Editor** 클릭 → **New query**
2. 이 프로젝트 폴더 안의 `supabase/schema.sql` 파일을 열어서 **전체 내용을 복사**
3. SQL Editor에 붙여넣고 우측 하단 **Run** 클릭
4. "Success. No rows returned" 메시지가 뜨면 성공입니다

## 3단계. 파일 저장 공간(Storage) 만들기

1. 왼쪽 메뉴에서 **Storage** 클릭
2. **New bucket** 클릭 → 이름을 정확히 `attachments` 로 입력 → Public bucket은 **체크 해제(Private)** → Create bucket

## 4단계. 이메일 확인 절차 끄기 (선택, 내부용으로 편하게 쓰려면 권장)

1. 왼쪽 메뉴 **Authentication** → **Providers** → **Email**
2. "Confirm email" 옵션을 꺼주세요 (꺼두면 회원가입 즉시 로그인 가능)
3. Save

## 5단계. API 키 확인하기

1. 왼쪽 메뉴 **Project Settings** (톱니바퀴) → **API**
2. **Project URL**과 **anon public** 키, 이 두 개를 메모장에 복사해두세요 (곧 사용합니다)

---

## 6단계. GitHub에 코드 올리기 (배포를 위해 필요)

1. https://github.com 접속 → 회원가입/로그인
2. 우측 상단 **+** → **New repository** → 이름: `jinius-app` → Create repository
3. 방금 만든 빈 저장소 화면에서 **uploading an existing file** 링크 클릭
4. 이 프로젝트 폴더 안의 파일/폴더를 **전부 드래그 앤 드롭**으로 업로드
   - 단, `node_modules` 폴더가 있다면 그건 올리지 마세요 (있다면 제외)
5. 하단 **Commit changes** 클릭

## 7단계. Vercel로 배포하기

1. https://vercel.com 접속 → **GitHub 계정으로 로그인**
2. **Add New** → **Project** 클릭
3. 방금 만든 `jinius-app` 저장소를 찾아서 **Import** 클릭
4. **Environment Variables** 항목을 펼쳐서 아래 두 개를 추가:
   - `NEXT_PUBLIC_SUPABASE_URL` = (5단계에서 복사한 Project URL)
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY` = (5단계에서 복사한 anon public 키)
5. **Deploy** 클릭 → 1~2분 대기
6. 완료되면 `https://jinius-app-xxxx.vercel.app` 같은 주소가 생성됩니다. 이 주소가 실제 서비스 링크예요!

---

## 처음 사용 순서

1. 위에서 받은 Vercel 주소로 접속 → **회원가입**
2. **가장 먼저 가입하는 계정은 자동으로 "관리자"** 역할이 됩니다
3. 로그인 후 왼쪽 메뉴 **건물 설정**에서 건물을 등록
4. **세대(호실) 설정**에서 세대를 일괄 생성
5. **사용자 설정**에서 이후 가입하는 담당자·고객 계정의 역할을 지정

---

## 문제가 생기면

- 로그인이 안 될 때: Supabase Authentication → Users 메뉴에서 가입된 계정이 보이는지 확인
- 데이터가 안 보일 때: Supabase Table Editor에서 해당 테이블에 데이터가 실제로 저장됐는지 확인
- 코드를 수정하고 싶을 때: GitHub 저장소에서 파일을 다시 업로드하면 Vercel이 자동으로 재배포합니다

궁금한 점은 언제든 다시 물어봐주세요. 화면을 캡처해서 보여주시면 더 정확히 도와드릴 수 있어요.
