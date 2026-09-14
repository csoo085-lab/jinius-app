// app/account-deletion/page.js
export const dynamic = 'force-dynamic';

export default function AccountDeletion() {
  return (
    <main style={{ maxWidth: 800, margin: "0 auto", padding: "40px 20px", lineHeight: 1.7 }}>
      <h1>계정 및 데이터 삭제 안내</h1>
      <p>지니어스(JINIUS)를 이용해 주셔서 감사합니다. 계정 삭제 또는 데이터 삭제를 원하시는 경우 아래 절차를 따라주세요.</p>

      <h2>삭제 요청 방법</h2>
      <p>아래 이메일로 계정 삭제를 요청해 주시기 바랍니다.</p>
      <ul>
        <li>담당자: 최수영</li>
        <li>이메일: jinius_estate@naver.com</li>
        <li>요청 시 포함할 정보: 가입 시 사용한 이메일 주소, 소속 건물명</li>
      </ul>

      <h2>처리 절차 및 소요 기간</h2>
      <p>요청 접수 후 본인 확인을 거쳐 영업일 기준 7일 이내에 계정 및 관련 데이터를 삭제 처리합니다.</p>

      <h2>삭제되는 데이터</h2>
      <ul>
        <li>이름, 연락처, 이메일 주소 등 계정 정보</li>
        <li>해당 계정으로 등록된 민원·고장신고 이력</li>
      </ul>

      <h2>보관되는 데이터 및 사유</h2>
      <p>관계 법령(전자상거래법, 통신비밀보호법 등)에 따라 일정 기간 보관이 의무화된 정보(관리비 고지 및 결제 관련 기록 등)는 관련 법령에서 정한 기간 동안 별도 보관 후 파기됩니다.</p>
    </main>
  );
}
