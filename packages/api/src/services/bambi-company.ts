// 밤비 운영 주체·연락처. web 푸터·약관·개인정보 처리방침과 native 약관 화면이 공유한다
// (web은 lib/bambi/company.ts에서 재export).
//
// ⚠️ TODO(운영): 아래 `TODO_` 접두 값은 임시 자리표시자다. 서비스 오픈 전
// 실제 법인·사업자 정보(사업자등록번호·대표자·주소·고객센터 번호)와
// 실제 본인인증 수탁사로 반드시 교체한다. 다른 사이트 문안을
// 이식한 것이라 이 값들을 그대로 노출하면 안 된다.

export const BAMBI_COMPANY = {
	// 서비스 식별
	serviceName: "밤비알바",
	domain: "bambialba.com",
	url: "https://bambialba.com",

	// 운영 주체(법인) — TODO: 실제 값으로 교체
	operator: "밤비알바",
	ceo: "TODO_대표자",
	bizRegNo: "TODO_사업자등록번호",
	// 직업정보제공사업 신고번호. 사업자등록번호와 달리 운영자 콘솔에서 편집하지 않고
	// 코드에 고정한다 — 사업 신고 단위로 발급되는 값이라 사이트 설정으로 바뀔 일이 없다.
	jobInfoProviderNo: "J1803020260010",
	address: "TODO_사업장 주소",

	// 고객센터·문의
	tel: "TODO_고객센터 전화",
	email: "help@bambialba.com",

	// 푸터 서비스 소개 문구(운영자 콘솔 미설정 시 폴백)
	footerIntro:
		"밤비알바는 유흥·접객 구인구직 정보를 1:1 채팅으로 안전하게 연결하는 플랫폼입니다.",

	// 개인정보 보호책임자 — 성명·전화·메일은 운영자 콘솔에서 편집하고 여기는 폴백이다.
	privacyOfficer: {
		dept: "개인정보보호팀",
		name: "TODO_보호책임자 성명",
		tel: "TODO_개인정보 문의 전화",
		email: "privacy@bambialba.com",
	},
} as const;

// 개인정보 처리 위탁(수탁사). 결제는 무통장입금만 운영해 PG 위탁이 없고 문자(SMS)
// 발송 기능도 없다. 첫 행의 수탁사명만 운영자 콘솔에서 편집한다(나머지는 코드 고정).
// 미사용 엔드포인트(server /ai, Google Gemini)는 화면에 붙는 시점에 행을 추가한다.
export const BAMBI_PROCESSORS: ReadonlyArray<{
	name: string;
	task: string;
}> = [
	// TODO: 실제 계약사로 교체(운영자 콘솔 입력이 우선).
	{ name: "TODO_본인인증 대행사", task: "휴대폰 본인인증" },
	{
		name: "Google LLC",
		task: "공고·게시글 이미지 저장(Google Cloud Storage), 웹 이용 통계 분석(Google Analytics)",
	},
	{ name: "Vercel Inc.", task: "웹 서비스 호스팅" },
] as const;
