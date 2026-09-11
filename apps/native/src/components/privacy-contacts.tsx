// 개인정보 처리방침의 동적 값(위탁사명·보호책임자 연락처·탈퇴 보존기간). 운영자 콘솔
// (/moderator/site-settings)에서 저장한 값을 쓰고, 미설정이면 코드 상수로 폴백한다.
// web components/bambi/privacy-contacts.tsx의 native 이식 — 조회 프로시저는 public이라
// 로그인 없이도 그대로 열린다(폴백 값을 먼저 그려 로딩 깜빡임 없음).

import {
	BAMBI_COMPANY,
	BAMBI_PROCESSORS,
} from "@bambi-app/api/services/bambi-company";
import { useQuery } from "@tanstack/react-query";

import { LegalParagraph, LegalTable } from "@/src/components/legal-doc";
import { orpc } from "@/src/lib/orpc";

// 위탁 수탁자 표. 위탁업무 내용은 고정이고, 첫 행(본인인증 대행사)의 수탁사명만
// 운영자 설정으로 치환한다 — 나머지 수탁사는 계약이 아니라 코드가 정하는 값이다.
export function PrivacyProcessorsTable() {
	const { data } = useQuery(
		orpc.bambi.siteSettings.getPrivacyContacts.queryOptions()
	);

	return (
		<LegalTable
			head={["수탁자", "위탁업무 내용"]}
			rows={BAMBI_PROCESSORS.map((processor, index) => [
				index === 0
					? (data?.privacyPaymentProcessor ?? processor.name)
					: processor.name,
				processor.task,
			])}
		/>
	);
}

// 개인정보 보호책임자 성명·전화·메일.
export function PrivacyContactLine() {
	const { data } = useQuery(
		orpc.bambi.siteSettings.getPrivacyContacts.queryOptions()
	);
	const name = data?.privacyOfficerName ?? BAMBI_COMPANY.privacyOfficer.name;
	const tel = data?.privacyContactPhone ?? BAMBI_COMPANY.privacyOfficer.tel;
	const email = data?.privacyContactEmail ?? BAMBI_COMPANY.privacyOfficer.email;

	return (
		<>
			<LegalParagraph>개인정보 보호책임자 : {name}</LegalParagraph>
			<LegalParagraph>
				전화 : {tel} · 메일 : {email}
			</LegalParagraph>
		</>
	);
}

// 탈퇴 후 본인확인 식별값 보존기간(일). 운영자 설정값을 그대로 문장에 끼워 넣어
// 처리방침·탈퇴 안내 화면이 같은 숫자를 말하게 한다(탈퇴 화면과 동일한 폴백 순서).
export function PrivacyRetentionDays() {
	const { data } = useQuery(
		orpc.bambi.siteSettings.getMemberPolicy.queryOptions()
	);

	return <>{data?.days ?? data?.defaultDays ?? 30}</>;
}
