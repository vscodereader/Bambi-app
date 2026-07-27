// 밤비 운영 주체·연락처. 푸터와 약관·개인정보 처리방침 페이지가 공유한다.
//
// ⚠️ TODO(운영): 아래 `TODO_` 접두 값은 임시 자리표시자다. 서비스 오픈 전
// 실제 법인·사업자 정보(사업자등록번호·대표자·주소·고객센터 번호)와
// 실제 본인인증 수탁사로 반드시 교체한다. 다른 사이트 문안을
// 이식한 것이라 이 값들을 그대로 노출하면 안 된다.

export const BAMBI_COMPANY = {
	// 서비스 식별
	serviceName: "밤비",
	domain: "bambialba.com",
	url: "https://bambialba.com",

	// 운영 주체(법인) — TODO: 실제 값으로 교체
	operator: "밤비",
	ceo: "TODO_대표자",
	bizRegNo: "TODO_사업자등록번호",
	address: "TODO_사업장 주소",

	// 고객센터·문의
	tel: "TODO_고객센터 전화",
	email: "help@bambialba.com",

	// 푸터 서비스 소개 문구(운영자 콘솔 미설정 시 폴백)
	footerIntro:
		"밤비는 유흥·접객 구인구직 정보를 1:1 채팅으로 안전하게 연결하는 플랫폼입니다.",

	// 개인정보 보호책임자
	privacyOfficer: {
		dept: "개인정보보호팀",
		tel: "TODO_개인정보 문의 전화",
		email: "privacy@bambialba.com",
	},
} as const;

// 개인정보 처리 위탁(수탁사) — TODO: 실제 계약사로 교체.
// 결제는 무통장입금만 운영해 PG 위탁이 없고, 문자(SMS) 발송 기능도 없어
// 현재 위탁은 휴대폰 본인인증 한 건뿐이다. 수탁사가 늘면 행을 추가한다.
export const BAMBI_PROCESSORS: ReadonlyArray<{
	name: string;
	task: string;
}> = [{ name: "TODO_본인인증 대행사", task: "휴대폰 본인인증" }] as const;
