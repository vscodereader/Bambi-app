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

	it("passes API performance metrics onto the mapped job", () => {
		const job = toMarketplaceJob({
			description: "성과가 있는 공고입니다.",
			employerVerificationStatus: "verified",
			id: "22222222-2222-4222-8222-222222222201",
			industryCategory: "라운지",
			payAmount: 180_000,
			payUnit: "일급",
			performance: { detailViews: 100, impressions: 1000 },
			region: "서울 강남구",
			status: "published",
			title: "성과 공고",
			workSchedule: "20:00-02:00",
		});

		expect(job.performance).toEqual({ detailViews: 100, impressions: 1000 });
	});

	it("keeps performance undefined when the API omits it", () => {
		const job = toMarketplaceJob({
			description: "성과가 없는 공고입니다.",
			employerVerificationStatus: "verified",
			id: "22222222-2222-4222-8222-222222222299",
			industryCategory: "라운지",
			payAmount: 150_000,
			payUnit: "일급",
			region: "서울 강남구",
			status: "published",
			title: "성과 없는 공고",
			workSchedule: "20:00-02:00",
		});

		expect(job.performance).toBeUndefined();
	});

	it("carries the server exposureType and isPromoted flag onto the mapped job", () => {
		const job = toMarketplaceJob({
			exposureType: "special",
			id: "33333333-3333-4333-8333-333333333301",
			industryCategory: "라운지",
			isPromoted: true,
			payAmount: 200_000,
			payUnit: "일급",
			promotionLabel: "스페셜",
			region: "서울 강남구",
			status: "published",
			title: "노출 섹션 공고",
			workSchedule: "20:00-02:00",
		});

		expect(job.exposureType).toBe("special");
		expect(job.isPromoted).toBe(true);
	});

	it("defaults exposureType to null and derives isPromoted from promotionTier for mock jobs", () => {
		const job = toMarketplaceJob({
			id: "33333333-3333-4333-8333-333333333302",
			industryCategory: "라운지",
			payAmount: 150_000,
			payUnit: "일급",
			promotionTier: "premium",
			region: "서울 강남구",
			status: "published",
			title: "폴백 프로모션 공고",
			workSchedule: "20:00-02:00",
		});

		expect(job.exposureType).toBeNull();
		expect(job.isPromoted).toBe(true);
	});
});
