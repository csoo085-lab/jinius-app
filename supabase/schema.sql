-- ============================================================
-- 지니어스(JINIUS) 정식 웹앱 데이터베이스 스키마
-- Supabase 프로젝트의 SQL Editor에 이 파일 전체를 붙여넣고 실행하세요.
-- (Supabase 대시보드 좌측 메뉴 "SQL Editor" > "New query")
-- ============================================================

-- 1. 회원 프로필 (역할 포함) ----------------------------------
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null default '',
  role text not null default '고객' check (role in ('관리자', '담당자', '고객')),
  created_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

-- 내 role을 안전하게 조회하는 함수 (RLS 정책에서 재사용, 재귀 방지를 위해 SECURITY DEFINER)
create or replace function public.get_my_role()
returns text
language sql
security definer
stable
as $$
  select role from public.profiles where id = auth.uid();
$$;

-- 신규 가입 시 프로필 자동 생성 트리거 (최초 가입자는 자동으로 관리자)
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
as $$
declare
  is_first boolean;
begin
  select not exists(select 1 from public.profiles) into is_first;
  insert into public.profiles (id, display_name, role)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'display_name', split_part(new.email, '@', 1)),
    case when is_first then '관리자' else coalesce(new.raw_user_meta_data->>'role', '고객') end
  );
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- 역할(role)은 본인이 임의로 못 바꾸도록 보호 (관리자만 변경 가능)
create or replace function public.protect_role_change()
returns trigger
language plpgsql
security definer
as $$
begin
  if new.role <> old.role and public.get_my_role() <> '관리자' then
    new.role := old.role;
  end if;
  return new;
end;
$$;

drop trigger if exists protect_role_change_trigger on public.profiles;
create trigger protect_role_change_trigger
  before update on public.profiles
  for each row execute function public.protect_role_change();

create policy "profiles_select" on public.profiles
  for select using (id = auth.uid() or public.get_my_role() = '관리자');
create policy "profiles_update" on public.profiles
  for update using (id = auth.uid() or public.get_my_role() = '관리자');


-- 2. 건물 ------------------------------------------------------
create table if not exists public.buildings (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  company_name text default '',
  company_phone text default '',
  bank_name text default '',
  bank_account text default '',
  account_holder text default '',
  due_date_text text default '',
  late_fee_rate numeric default 10,
  land_address text default '',
  road_address text default '',
  main_use text default '',
  structure text default '',
  floors_above int default 0,
  floors_below int default 0,
  total_area numeric default 0,
  approval_date text default '',
  unit_summary text default '',
  elevator_count int default 0,
  parking_info text default '',
  owner_name text default '',
  designer_name text default '',
  supervisor_name text default '',
  contractor_name text default '',
  periodic_inspection_required boolean default false,
  periodic_inspection_valid_until text default '',
  floor_details jsonb default '[]',
  created_at timestamptz not null default now()
);
alter table public.buildings enable row level security;
create policy "buildings_read" on public.buildings for select using (auth.uid() is not null);
create policy "buildings_write" on public.buildings for all
  using (public.get_my_role() in ('관리자', '담당자'))
  with check (public.get_my_role() in ('관리자', '담당자'));


-- 3. 세대(호실) --------------------------------------------------
create table if not exists public.units (
  id uuid primary key default gen_random_uuid(),
  building_id uuid not null references public.buildings(id) on delete cascade,
  dong text not null default '',
  ho text not null default '',
  area numeric,
  occupancy text default '월세',
  phone text default '',
  move_in_date text default '',
  vehicle text default '',
  note text default '',
  created_at timestamptz not null default now()
);
alter table public.units enable row level security;
create policy "units_read" on public.units for select using (auth.uid() is not null);
create policy "units_write" on public.units for all
  using (public.get_my_role() in ('관리자', '담당자'))
  with check (public.get_my_role() in ('관리자', '담당자'));


-- 4. 시설 점검 항목 ------------------------------------------------
create table if not exists public.facility_items (
  id uuid primary key default gen_random_uuid(),
  building_id uuid not null references public.buildings(id) on delete cascade,
  name text not null,
  category text not null default '기타',
  location text default '',
  cycle text default '월간',
  specs jsonb not null default '[]',
  created_at timestamptz not null default now()
);
alter table public.facility_items enable row level security;
create policy "facility_items_rw" on public.facility_items for all
  using (public.get_my_role() in ('관리자', '담당자'))
  with check (public.get_my_role() in ('관리자', '담당자'));


-- 5. 점검 기록 (+ 사진은 Storage에 저장하고 경로만 기록) -----------------
create table if not exists public.inspection_logs (
  id uuid primary key default gen_random_uuid(),
  item_id uuid not null references public.facility_items(id) on delete cascade,
  log_date date not null default current_date,
  inspector text default '',
  status text not null default '정상' check (status in ('정상', '이상')),
  note text default '',
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now()
);
alter table public.inspection_logs enable row level security;
create policy "inspection_logs_rw" on public.inspection_logs for all
  using (public.get_my_role() in ('관리자', '담당자'))
  with check (public.get_my_role() in ('관리자', '담당자'));

create table if not exists public.inspection_photos (
  id uuid primary key default gen_random_uuid(),
  log_id uuid not null references public.inspection_logs(id) on delete cascade,
  storage_path text not null,
  created_at timestamptz not null default now()
);
alter table public.inspection_photos enable row level security;
create policy "inspection_photos_rw" on public.inspection_photos for all
  using (public.get_my_role() in ('관리자', '담당자'))
  with check (public.get_my_role() in ('관리자', '담당자'));


-- 6. 민원·고장 신고 ------------------------------------------------
create table if not exists public.complaints (
  id uuid primary key default gen_random_uuid(),
  building_id uuid references public.buildings(id) on delete set null,
  unit_text text default '',
  type text not null default '기타' check (type in ('고장', '민원', '기타')),
  content text not null,
  reporter text default '',
  received_date date not null default current_date,
  status text not null default '접수' check (status in ('접수', '처리중', '완료')),
  assignee text default '',
  resolution text default '',
  resolved_date date,
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now()
);
alter table public.complaints enable row level security;
create policy "complaints_select" on public.complaints for select
  using (public.get_my_role() in ('관리자', '담당자') or created_by = auth.uid());
create policy "complaints_insert" on public.complaints for insert
  with check (created_by = auth.uid());
create policy "complaints_update" on public.complaints for update
  using (public.get_my_role() in ('관리자', '담당자'));
create policy "complaints_delete" on public.complaints for delete
  using (public.get_my_role() in ('관리자', '담당자'));


-- 7. 관리비 항목 / 고지 데이터 ---------------------------------------
create table if not exists public.fee_items (
  id uuid primary key default gen_random_uuid(),
  building_id uuid not null references public.buildings(id) on delete cascade,
  name text not null,
  created_at timestamptz not null default now()
);
alter table public.fee_items enable row level security;
create policy "fee_items_read" on public.fee_items for select using (auth.uid() is not null);
create policy "fee_items_write" on public.fee_items for all
  using (public.get_my_role() in ('관리자', '담당자'))
  with check (public.get_my_role() in ('관리자', '담당자'));

create table if not exists public.fee_invoices (
  id uuid primary key default gen_random_uuid(),
  building_id uuid not null references public.buildings(id) on delete cascade,
  month text not null,
  unit_text text not null default '',
  values jsonb not null default '{}',
  items_total numeric not null default 0,
  prev_unpaid numeric not null default 0,
  late_fee numeric not null default 0,
  total numeric not null default 0,
  created_at timestamptz not null default now()
);
alter table public.fee_invoices enable row level security;
create policy "fee_invoices_read" on public.fee_invoices for select using (auth.uid() is not null);
create policy "fee_invoices_write" on public.fee_invoices for all
  using (public.get_my_role() in ('관리자', '담당자'))
  with check (public.get_my_role() in ('관리자', '담당자'));


-- 8. 검침 데이터 ----------------------------------------------------
create table if not exists public.meter_readings (
  id uuid primary key default gen_random_uuid(),
  building_id uuid not null references public.buildings(id) on delete cascade,
  month text not null,
  utility text not null default '전기' check (utility in ('전기', '수도')),
  dong text default '',
  ho text default '',
  prev_reading numeric not null default 0,
  curr_reading numeric not null default 0,
  note text default '',
  created_at timestamptz not null default now()
);
alter table public.meter_readings enable row level security;
create policy "meter_readings_rw" on public.meter_readings for all
  using (public.get_my_role() in ('관리자', '담당자'))
  with check (public.get_my_role() in ('관리자', '담당자'));


-- 9. 첨부 서류 (시설 항목용, 실제 파일은 Storage 버킷 'attachments'에 저장) ---
create table if not exists public.documents (
  id uuid primary key default gen_random_uuid(),
  item_id uuid references public.facility_items(id) on delete cascade,
  file_name text not null,
  storage_path text not null,
  size_bytes bigint default 0,
  created_at timestamptz not null default now()
);
alter table public.documents enable row level security;
create policy "documents_read" on public.documents for select using (auth.uid() is not null);
create policy "documents_write" on public.documents for all
  using (public.get_my_role() in ('관리자', '담당자'))
  with check (public.get_my_role() in ('관리자', '담당자'));

-- ============================================================
-- 완료! 다음으로 Storage 메뉴에서 "attachments" 라는 이름의
-- 버킷(bucket)을 새로 만들어주세요 (Public 여부는 Private 권장).
-- 버킷을 만든 뒤, 아래 정책도 이어서 실행하세요.
-- ============================================================

create policy "attachments_read" on storage.objects for select
  using (bucket_id = 'attachments' and auth.uid() is not null);
create policy "attachments_write" on storage.objects for insert
  with check (bucket_id = 'attachments' and public.get_my_role() in ('관리자', '담당자'));
create policy "attachments_update" on storage.objects for update
  using (bucket_id = 'attachments' and public.get_my_role() in ('관리자', '담당자'));
create policy "attachments_delete" on storage.objects for delete
  using (bucket_id = 'attachments' and public.get_my_role() in ('관리자', '담당자'));


-- ============================================================
-- [마이그레이션] 건축물대장 상세 정보 추가 (2026-09)
-- 이미 buildings 테이블이 생성되어 있는 경우, Supabase SQL Editor에서
-- 아래 구문만 실행하면 기존 데이터를 유지한 채 컬럼이 추가됩니다.
-- ============================================================
alter table public.buildings add column if not exists owner_name text default '';
alter table public.buildings add column if not exists designer_name text default '';
alter table public.buildings add column if not exists supervisor_name text default '';
alter table public.buildings add column if not exists contractor_name text default '';
alter table public.buildings add column if not exists periodic_inspection_required boolean default false;
alter table public.buildings add column if not exists periodic_inspection_valid_until text default '';
alter table public.buildings add column if not exists floor_details jsonb default '[]';

-- ============================================================
-- [마이그레이션] 기관·업체 관리 (2026-09)
-- 공통 기관·업체 목록(institutions) + 건물별 연결정보(building_institutions)
-- + 고지서·점검보고서 첨부(institution_documents)
-- ============================================================

-- 10. 기관·업체 공통 목록 (한국전력, 상수도사업본부, 협력업체 등) -------
create table if not exists public.institutions (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  org_type text default '공공기관',
  category text default '',
  phone text default '',
  address text default '',
  notes text default '',
  created_at timestamptz not null default now()
);
alter table public.institutions enable row level security;
create policy "institutions_read" on public.institutions for select using (auth.uid() is not null);
create policy "institutions_write" on public.institutions for all
  using (public.get_my_role() in ('관리자', '담당자'))
  with check (public.get_my_role() in ('관리자', '담당자'));

-- 11. 건물별 기관·업체 연결 (고객번호/계약정보) --------------------
create table if not exists public.building_institutions (
  id uuid primary key default gen_random_uuid(),
  building_id uuid not null references public.buildings(id) on delete cascade,
  institution_id uuid not null references public.institutions(id) on delete cascade,
  customer_number text default '',
  contract_info text default '',
  notes text default '',
  created_at timestamptz not null default now(),
  unique (building_id, institution_id)
);
alter table public.building_institutions enable row level security;
create policy "building_institutions_read" on public.building_institutions for select using (auth.uid() is not null);
create policy "building_institutions_write" on public.building_institutions for all
  using (public.get_my_role() in ('관리자', '담당자'))
  with check (public.get_my_role() in ('관리자', '담당자'));

-- 12. 기관·업체 첨부 서류 (고지서/점검보고서, Storage 'attachments' 버킷 재사용) ---
create table if not exists public.institution_documents (
  id uuid primary key default gen_random_uuid(),
  building_institution_id uuid not null references public.building_institutions(id) on delete cascade,
  doc_type text default '고지서',
  issued_date text default '',
  file_name text not null,
  storage_path text not null,
  size_bytes bigint default 0,
  created_at timestamptz not null default now()
);
alter table public.institution_documents enable row level security;
create policy "institution_documents_read" on public.institution_documents for select using (auth.uid() is not null);
create policy "institution_documents_write" on public.institution_documents for all
  using (public.get_my_role() in ('관리자', '담당자'))
  with check (public.get_my_role() in ('관리자', '담당자'));

-- ============================================================
-- [마이그레이션] 시설 항목에 담당 업체(기관·업체) 연결 (2026-09)
-- ============================================================
alter table public.facility_items
  add column if not exists vendor_id uuid references public.building_institutions(id) on delete set null;

-- ============================================================
-- [마이그레이션] 건물 총괄계량기 검침 (2026-09)
-- 세대별 검침(meter_readings)과 별도로, 건물 전체 총괄계량기 검침을 기록
-- ============================================================
create table if not exists public.building_meter_readings (
  id uuid primary key default gen_random_uuid(),
  building_id uuid not null references public.buildings(id) on delete cascade,
  month text not null,
  utility text not null default '전기' check (utility in ('전기', '수도')),
  prev_reading numeric not null default 0,
  curr_reading numeric not null default 0,
  note text default '',
  created_at timestamptz not null default now(),
  unique (building_id, month, utility)
);
alter table public.building_meter_readings enable row level security;
create policy "building_meter_readings_read" on public.building_meter_readings for select using (auth.uid() is not null);
create policy "building_meter_readings_write" on public.building_meter_readings for all
  using (public.get_my_role() in ('관리자', '담당자'))
  with check (public.get_my_role() in ('관리자', '담당자'));

-- ============================================================
-- [마이그레이션] 세대별 검침 보정값 (2026-09)
-- 건물 총괄계량기 사용량과 세대 실측 합계의 차이를 세대별로 비례 배분해 기록
-- ============================================================
alter table public.meter_readings
  add column if not exists adjustment numeric not null default 0;

-- ============================================================
-- [마이그레이션] 관리업 관련 법령 자료실 (2026-09)
-- 공동주택관리법, 집합건물법, 승강기, 소방, 경비업, 주차장법 등 카테고리별로
-- 개정 이력을 누적해서 기록. 원문 파일도 첨부 가능 (Storage 'attachments' 재사용)
-- ============================================================
create table if not exists public.regulations (
  id uuid primary key default gen_random_uuid(),
  category text not null default '기타',
  title text not null,
  effective_date text default '',
  summary text default '',
  source_url text default '',
  notes text default '',
  created_at timestamptz not null default now()
);
alter table public.regulations enable row level security;
create policy "regulations_rw" on public.regulations for all
  using (public.get_my_role() in ('관리자', '담당자'))
  with check (public.get_my_role() in ('관리자', '담당자'));

create table if not exists public.regulation_documents (
  id uuid primary key default gen_random_uuid(),
  regulation_id uuid not null references public.regulations(id) on delete cascade,
  file_name text not null,
  storage_path text not null,
  size_bytes bigint default 0,
  created_at timestamptz not null default now()
);
alter table public.regulation_documents enable row level security;
create policy "regulation_documents_rw" on public.regulation_documents for all
  using (public.get_my_role() in ('관리자', '담당자'))
  with check (public.get_my_role() in ('관리자', '담당자'));
-- ============================================================
-- [마이그레이션] 관리업 관련 법령 기본 항목 시딩 (2026-09)
-- 공동주택 관리업무에 적용되는 법령을 카테고리별 기본 참고 항목으로 등록
-- (이미 같은 제목의 항목이 있으면 건너뜀 — 여러 번 실행해도 안전)
-- ============================================================
insert into public.regulations (category, title, summary)
select '집합건물의 소유 및 관리에 관한 법률', '집합건물의 소유 및 관리에 관한 법률', '구분소유권, 공용부분 관리, 관리단·관리인 선임, 관리단집회, 관리규약, 관리비 등'
where not exists (select 1 from public.regulations where title = '집합건물의 소유 및 관리에 관한 법률');
insert into public.regulations (category, title, summary)
select '공동주택관리법', '공동주택관리법', '주거용 집합건물(아파트, 의무관리대상 등) 관리 기준 준용 및 지자체 감사 근거'
where not exists (select 1 from public.regulations where title = '공동주택관리법');
insert into public.regulations (category, title, summary)
select '민법', '민법', '관리위탁계약, 용역 도급계약, 불법행위 손해배상, 임대차 등 일반 사법 관계'
where not exists (select 1 from public.regulations where title = '민법');
insert into public.regulations (category, title, summary)
select '소방시설 설치 및 관리에 관한 법률', '소방시설 설치 및 관리에 관한 법률', '소방시설 설치 기준, 소방시설 자체점검(작동·종합점검) 실시'
where not exists (select 1 from public.regulations where title = '소방시설 설치 및 관리에 관한 법률');
insert into public.regulations (category, title, summary)
select '화재의 예방 및 안전관리에 관한 법률', '화재의 예방 및 안전관리에 관한 법률', '소방안전관리자 선임, 피난계획 수립, 의무 소방훈련 실시'
where not exists (select 1 from public.regulations where title = '화재의 예방 및 안전관리에 관한 법률');
insert into public.regulations (category, title, summary)
select '승강기 안전관리법', '승강기 안전관리법', '승강기안전관리자 선임, 월 1회 자체점검, 정기·정밀안전검사, 책임보험 가입'
where not exists (select 1 from public.regulations where title = '승강기 안전관리법');
insert into public.regulations (category, title, summary)
select '전기안전관리법', '전기안전관리법', '전기안전관리자 선임(상주 또는 대행), 자가용전기설비 정기검사'
where not exists (select 1 from public.regulations where title = '전기안전관리법');
insert into public.regulations (category, title, summary)
select '기계설비법', '기계설비법', '기계설비유지관리자 선임, 기계설비 성능점검 및 유지관리 점검표 작성'
where not exists (select 1 from public.regulations where title = '기계설비법');
insert into public.regulations (category, title, summary)
select '건축물관리법', '건축물관리법', '건축물 관리계획 수립, 다중이용건축물 등의 정기점검 및 긴급점검'
where not exists (select 1 from public.regulations where title = '건축물관리법');
insert into public.regulations (category, title, summary)
select '건축법', '건축법', '건축물 유지·관리 의무, 위반건축물(불법 증축, 무단 용도변경) 단속, 피난·방화구획 유지'
where not exists (select 1 from public.regulations where title = '건축법');
insert into public.regulations (category, title, summary)
select '시설물의 안전 및 유지관리에 관한 특별법', '시설물의 안전 및 유지관리에 관한 특별법', '1·2·3종 시설물 대상 정기안전점검, 정밀안전점검, 정밀안전진단 수행'
where not exists (select 1 from public.regulations where title = '시설물의 안전 및 유지관리에 관한 특별법');
insert into public.regulations (category, title, summary)
select '도시가스사업법 / 고압가스 안전관리법', '도시가스사업법 / 고압가스 안전관리법', '특정가스사용시설 안전관리자 선임, 정기검사, 가스 누출 점검'
where not exists (select 1 from public.regulations where title = '도시가스사업법 / 고압가스 안전관리법');
insert into public.regulations (category, title, summary)
select '수도법', '수도법', '저수조(물탱크) 청소(반기 1회), 먹는물 수질검사 실시 및 기록 보관'
where not exists (select 1 from public.regulations where title = '수도법');
insert into public.regulations (category, title, summary)
select '감염병의 예방 및 관리에 관한 법률', '감염병의 예방 및 관리에 관한 법률', '일정 규모 이상 건물에 대한 의무 정기 소독(방역) 실시'
where not exists (select 1 from public.regulations where title = '감염병의 예방 및 관리에 관한 법률');
insert into public.regulations (category, title, summary)
select '공중위생관리법', '공중위생관리법', '청소용역(위생관리용역업), 건물 위생환경 기준 준수'
where not exists (select 1 from public.regulations where title = '공중위생관리법');
insert into public.regulations (category, title, summary)
select '하수도법', '하수도법', '정화조(개인하수처리시설) 연 1회 이상 내부청소, 방류수 수질기준 준수'
where not exists (select 1 from public.regulations where title = '하수도법');
insert into public.regulations (category, title, summary)
select '실내공기질 관리법', '실내공기질 관리법', '연면적 기준 다중이용시설·지하역사·상가 등의 실내공기질 측정 및 보고'
where not exists (select 1 from public.regulations where title = '실내공기질 관리법');
insert into public.regulations (category, title, summary)
select '폐기물관리법 / 자원재활용법', '폐기물관리법 / 자원재활용법', '생활폐기물 분리수거, 폐기물 감량, 음식물류 폐기물 적법 처리'
where not exists (select 1 from public.regulations where title = '폐기물관리법 / 자원재활용법');
insert into public.regulations (category, title, summary)
select '개인정보 보호법', '개인정보 보호법', '공용구역 CCTV 설치 목적 제한, 안내판 부착, 영상 열람·파기 관리대장 작성'
where not exists (select 1 from public.regulations where title = '개인정보 보호법');
insert into public.regulations (category, title, summary)
select '경비업법', '경비업법', '경비용역 위탁 시 경비지도사 선임 및 경비원 신임교육 준수 여부 관리'
where not exists (select 1 from public.regulations where title = '경비업법');
insert into public.regulations (category, title, summary)
select '주차장법', '주차장법', '부설주차장 불법 용도변경 금지, 적치물 방치 금지, 기계식 주차설비 정기검사'
where not exists (select 1 from public.regulations where title = '주차장법');
insert into public.regulations (category, title, summary)
select '중대재해 처벌 등에 관한 법률', '중대재해 처벌 등에 관한 법률', '관리주체(위탁관리회사/관리단)의 종사자 안전보건확보의무, 중대시민재해 예방'
where not exists (select 1 from public.regulations where title = '중대재해 처벌 등에 관한 법률');
insert into public.regulations (category, title, summary)
select '산업안전보건법', '산업안전보건법', '시설관리·미화·경비 인력에 대한 안전보건교육, 위험성평가, 도급인의 안전조치'
where not exists (select 1 from public.regulations where title = '산업안전보건법');
insert into public.regulations (category, title, summary)
select '근로기준법 / 최저임금법', '근로기준법 / 최저임금법', '직접 고용 인력(관리소 직원 등)의 근로시간, 휴게시설 설치 의무, 휴게시간 보장'
where not exists (select 1 from public.regulations where title = '근로기준법 / 최저임금법');
insert into public.regulations (category, title, summary)
select '화재로 인한 재해보상과 보험가입에 관한 법률', '화재로 인한 재해보상과 보험가입에 관한 법률', '특수건물(16층 이상, 대형 판매시설 등) 화재배상책임보험 의무 가입'
where not exists (select 1 from public.regulations where title = '화재로 인한 재해보상과 보험가입에 관한 법률');
insert into public.regulations (category, title, summary)
select '재난 및 안전관리 기본법', '재난 및 안전관리 기본법', '재난배상책임보험 가입 의무 시설(1층 음식점, 숙박시설 등) 확인 및 관리'
where not exists (select 1 from public.regulations where title = '재난 및 안전관리 기본법');
insert into public.regulations (category, title, summary)
select '부가가치세법 / 법인세법 / 소득세법', '부가가치세법 / 법인세법 / 소득세법', '관리비 고지서 발행(면세/과세), 공용부분 잡수익(주차장, 중계기 등) 세금 신고'
where not exists (select 1 from public.regulations where title = '부가가치세법 / 법인세법 / 소득세법');

