// 개인정보 처리방침의 동적 값(위탁사명·관리부서 연락처). 운영자 콘솔
// (/moderator/site-settings)에서 저장한 값을 쓰고, 미설정이면 코드 상수로 폴백한다.
// 처리방침 페이지는 metadata를 export 하는 서버 컴포넌트라 "use client"가 될 수 없어,
// 값이 들어가는 두 지점만 클라이언트 컴포넌트로 분리해 푸터와 같은 방식으로 조회한다
// (폴백 값을 먼저 그려 로딩 깜빡임 없음).
"use client";

import { useQuery } from "@tanstack/react-query";
import { LegalParagraph, LegalTable } from "@/components/bambi/legal-doc";
import { BAMBI_COMPANY, BAMBI_PROCESSORS } from "@/lib/bambi/company";
import { orpc } from "@/utils/orpc";

// 위탁 수탁자 표. 위탁업무 내용은 고정이고 수탁사명만 운영자 설정으로 치환한다.
export function PrivacyProcessorsTable() {
	const { data } = useQuery(
		orpc.bambi.siteSettings.getPrivacyContacts.queryOptions()
	);
	const processorName =
		data?.privacyPaymentProcessor ?? BAMBI_PROCESSORS[0].name;

	return (
		<LegalTable
			head={["수탁자", "위탁업무 내용"]}
			rows={[[processorName, BAMBI_PROCESSORS[0].task]]}
		/>
	);
}

// 개인정보 관리부서 전화·메일.
export function PrivacyContactLine() {
	const { data } = useQuery(
		orpc.bambi.siteSettings.getPrivacyContacts.queryOptions()
	);
	const tel = data?.privacyContactPhone ?? BAMBI_COMPANY.privacyOfficer.tel;
	const email = data?.privacyContactEmail ?? BAMBI_COMPANY.privacyOfficer.email;

	return (
		<LegalParagraph>
			전화 : {tel} · 메일 : {email}
		</LegalParagraph>
	);
}
