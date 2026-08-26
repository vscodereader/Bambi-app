import { describe, expect, it } from "vitest";
import {
	findGuide,
	GUIDE_CONTENTS,
	type GuideContent,
} from "@/lib/bambi/guide";
import {
	findJobLandingIndustry,
	findJobLandingRegion,
} from "@/lib/bambi/job-landing";

const WHITESPACE = /\s+/;

// 공백 기준 어절 수 — 랜딩 content 가드와 같은 방식(도어웨이·빈껍데기 색인 방지).
const wordCount = (text: string): number =>
	text.trim().split(WHITESPACE).filter(Boolean).length;

// 본문 = 섹션 문단 + FAQ 질문·답변. 어절 하한과 금칙 검사 모두 이 텍스트를 본다
// (title/description/keywords는 경쟁사명 정책 예외라 검사 대상이 아니다).
const bodyText = (guide: GuideContent): string =>
	[
		...guide.sections.flatMap((section) => section.paragraphs),
		...guide.faqs.flatMap((faq) => [faq.question, faq.answer]),
	].join(" ");

// 본문 금칙: 경쟁사명·로그인 유도·원화 금액 표기.
const FORBIDDEN = ["퀸알바", "여우알바", "하루알바", "로그인"];
const MONEY = /\d+\s*만\s*원|\d+원/;

describe("job guide content", () => {
	it("registers exactly five guides with unique slugs", () => {
		expect(GUIDE_CONTENTS).toHaveLength(5);
		const slugs = GUIDE_CONTENTS.map((guide) => guide.slug);
		expect(new Set(slugs).size).toBe(slugs.length);
	});

	// 스텁 단계에선 아래 어절·금칙 검사가 실패할 수 있다(집필 후 통과 목표).
	for (const guide of GUIDE_CONTENTS) {
		describe(guide.slug, () => {
			it("has a body between 1,100 and 1,600 words", () => {
				const words = wordCount(bodyText(guide));

				expect(words).toBeGreaterThanOrEqual(1100);
				expect(words).toBeLessThanOrEqual(1600);
			});

			it("has at least three FAQs", () => {
				expect(guide.faqs.length).toBeGreaterThanOrEqual(3);
				for (const faq of guide.faqs) {
					expect(faq.question.length).toBeGreaterThan(0);
					expect(faq.answer.length).toBeGreaterThan(0);
				}
			});

			it("keeps forbidden strings out of the body", () => {
				const body = bodyText(guide);

				for (const term of FORBIDDEN) {
					expect(body).not.toContain(term);
				}
				expect(body).not.toMatch(MONEY);
			});

			it("links only to existing landings", () => {
				expect(guide.relatedLandings.length).toBeGreaterThan(0);
				for (const link of guide.relatedLandings) {
					expect(findJobLandingRegion(link.region)).toBeTruthy();
					if (link.industry) {
						expect(findJobLandingIndustry(link.industry)).toBeTruthy();
					}
				}
			});

			it("cross-links only to registered guides", () => {
				for (const slug of guide.relatedGuides) {
					expect(findGuide(slug)).toBeTruthy();
					// 자기 자신을 관련 가이드로 걸지 않는다.
					expect(slug).not.toBe(guide.slug);
				}
			});
		});
	}
});
