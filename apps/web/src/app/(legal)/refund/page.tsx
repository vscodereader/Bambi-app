import type { Metadata } from "next";
import {
	LegalDoc,
	LegalParagraph,
	LegalSection,
} from "@/components/bambi/legal-doc";

export const metadata: Metadata = {
	title: "환불 정책 | 밤비",
	description: "밤비 환불 정책",
};

export default function RefundPage() {
	return (
		<LegalDoc effectiveDate="2026년 7월 21일" title="환불 정책">
			<LegalSection heading="무통장 입금 환불 기준">
				<LegalParagraph>
					무통장: 수수료 5% + 광고 게재 기간을 제외한 금액
				</LegalParagraph>
			</LegalSection>
		</LegalDoc>
	);
}
