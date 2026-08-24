import { describe, expect, it } from "vitest";
import {
	JOB_LANDING_INDUSTRIES,
	JOB_LANDING_REGIONS,
} from "@/lib/bambi/job-landing";
import {
	jobLandingIndustryDefinition,
	jobLandingIndustryFaqs,
	jobLandingPlatformFaqs,
	jobLandingRegionNote,
	jobLandingServiceDefinition,
} from "@/lib/bambi/job-landing-content";

const WHITESPACE = /\s+/;

// 공백 기준 어절 수 — 감사가 지적한 도어웨이(고유 텍스트 부족)를 막는 최소 가드다.
const wordCount = (text: string): number =>
	text.trim().split(WHITESPACE).filter(Boolean).length;

describe("job landing content", () => {
	it("gives every industry a definition with a substantial body", () => {
		for (const industry of JOB_LANDING_INDUSTRIES) {
			const definition = jobLandingIndustryDefinition(industry);

			expect(definition.title.length).toBeGreaterThan(0);
			expect(definition.body.length).toBeGreaterThan(0);
			// 정의 본문은 130어절 이상이어야 색인용 진입점이 빈껍데기가 아니다(AEO 분량 하한).
			expect(wordCount(definition.body.join(" "))).toBeGreaterThanOrEqual(130);
			// body[0]은 헤딩 직하 완결 직답 — 발췌 단위로 쓰이도록 40어절 이상을 강제한다.
			expect(wordCount(definition.body[0] ?? "")).toBeGreaterThanOrEqual(40);
		}
	});

	it("gives every industry at least two differentiated FAQs", () => {
		const firstAnswers = new Set<string>();

		for (const industry of JOB_LANDING_INDUSTRIES) {
			const faqs = jobLandingIndustryFaqs(industry);

			expect(faqs.length).toBeGreaterThanOrEqual(2);
			for (const faq of faqs) {
				expect(faq.question.length).toBeGreaterThan(0);
				expect(faq.answer.length).toBeGreaterThan(0);
			}
			firstAnswers.add(faqs[0]?.answer ?? "");
		}
		// 9종 정의 직답이 전부 다른 답이어야 한다(동일 답 재사용 금지).
		expect(firstAnswers.size).toBe(JOB_LANDING_INDUSTRIES.length);
	});

	it("covers platform copy and every region note", () => {
		expect(jobLandingPlatformFaqs().length).toBeGreaterThanOrEqual(3);
		expect(
			wordCount(jobLandingServiceDefinition().body.join(" "))
		).toBeGreaterThanOrEqual(50);
		for (const region of JOB_LANDING_REGIONS) {
			expect(jobLandingRegionNote(region).length).toBeGreaterThan(0);
		}
	});
});
