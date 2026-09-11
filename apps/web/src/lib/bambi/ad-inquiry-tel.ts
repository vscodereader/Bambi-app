import { BAMBI_COMPANY } from "@bambi-app/api/services/bambi-company";

// 광고 문의 번호 폴백 체인. 운영자가 광고 전용 번호를 두지 않았으면 고객센터 번호를,
// 사이트 설정 행 자체가 없으면 코드 상수를 쓴다 — 자리표시에 번호가 비면 안 된다.
// ad-banner.tsx가 아니라 순수 모듈에 두는 이유: 거기서 export 하면 테스트가 React·oRPC를 끌고 온다.
export const resolveAdInquiryTel = ({
	adInquiryTel,
	tel,
}: {
	adInquiryTel: string | null | undefined;
	tel: string | null | undefined;
}): string => adInquiryTel?.trim() || tel?.trim() || BAMBI_COMPANY.tel;
