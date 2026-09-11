import { BAMBI_COMPANY } from "@bambi-app/api/services/bambi-company";
import type { Metadata } from "next";
import { LegalParagraph, LegalSection } from "@/components/bambi/legal-doc";

export const metadata: Metadata = {
	title: "회사소개 | 밤비알바",
	description:
		"밤비알바를 운영하는 주체와 직업정보제공사업 신고번호, 연락처 안내입니다.",
	alternates: { canonical: "/about" },
};

// 회사소개. E-E-A-T(신뢰성) 보강용 정적 페이지로, 운영 주체·직업정보제공사업
// 신고번호·연락처를 공개한다. 대표자·사업자등록번호·주소·전화 등 아직 실제 값이
// 없는 항목(BAMBI_COMPANY의 TODO_ 자리표시자)은 SiteFooter와 같은 원칙으로 노출하지
// 않는다 — 자리표시자를 화면·색인에 싣지 않는다.
export default function AboutPage() {
	return (
		<article className="flex w-full flex-col gap-8 py-10 md:py-14">
			<header className="flex flex-col gap-2">
				<h1 className="font-bold text-2xl text-foreground tracking-tight md:text-3xl">
					회사소개
				</h1>
				<p className="text-muted-foreground text-sm md:text-base">
					{BAMBI_COMPANY.footerIntro}
				</p>
			</header>

			<div className="flex flex-col gap-10">
				<LegalSection heading="서비스 소개">
					<LegalParagraph>
						밤비알바({BAMBI_COMPANY.url})는 유흥·접객 분야의 구인자와 구직자를
						1:1 채팅으로 안전하게 연결하는 구인구직 정보제공 서비스입니다.
						지역과 업종별 채용 정보를 정리해 제공하며, 만 19세 이상만 이용할 수
						있는 성인 대상 서비스입니다.
					</LegalParagraph>
				</LegalSection>

				<LegalSection heading="운영 주체">
					<LegalParagraph>운영 주체 : {BAMBI_COMPANY.operator}</LegalParagraph>
					<LegalParagraph>
						직업정보제공사업 신고번호 : {BAMBI_COMPANY.jobInfoProviderNo}
					</LegalParagraph>
				</LegalSection>

				<LegalSection heading="연락처">
					<LegalParagraph>
						서비스 이용 문의는 아래 이메일로 접수할 수 있습니다.
					</LegalParagraph>
					<LegalParagraph>
						이메일 :{" "}
						<a
							className="underline-offset-2 transition-colors hover:text-foreground hover:underline"
							href={`mailto:${BAMBI_COMPANY.email}`}
						>
							{BAMBI_COMPANY.email}
						</a>
					</LegalParagraph>
				</LegalSection>
			</div>
		</article>
	);
}
