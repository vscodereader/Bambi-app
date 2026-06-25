import { describe, expect, it } from "vitest";
import { toMarketplaceJob } from "./api-job-mapper";

describe("toMarketplaceJob", () => {
	it("maps API rating aggregates onto marketplace jobs", () => {
		const job = toMarketplaceJob({
			description: "후기 집계가 반영되는 공고입니다.",
			employerVerificationStatus: "verified",
			id: "11111111-1111-4111-8111-111111111111",
			industryCategory: "라운지",
			payAmount: 180_000,
			payUnit: "일급",
			ratingAverage: 4.75,
			ratingCount: 12,
			region: "서울 강남구",
			status: "published",
			teamDisplayName: "후기 테스트 팀",
			title: "후기 테스트 공고",
			workSchedule: "20:00-02:00",
		});

		expect(job.rating).toBe(4.8);
		expect(job.reviews).toBe(12);
	});
});
