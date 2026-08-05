import { describe, expect, it } from "vitest";

// api-job-mapper는 import 시점에 @bambi-app/env/web를 검증한다. 테스트 러너에는 .env가
// 없으므로 정적 import 대신 최소 환경을 채운 뒤 동적 import한다(api-job-mapper.test.ts와 동일).
process.env.NEXT_PUBLIC_SERVER_URL = "http://localhost:3000";
process.env.NEXT_PUBLIC_GCS_PUBLIC_BASE_URL = "https://cdn.bambi.test";

const { toMarketplaceJob } = await import("./api-job-mapper");

describe("toMarketplaceJob", () => {
	it("maps API rating aggregates onto marketplace jobs", () => {
		const job = toMarketplaceJob({
			description: "후기 집계가 반영되는 공고입니다.",
			employerVerificationStatus: "verified",
			id: "11111111-1111-4111-8111-111111111111",
			industryCategory: "룸싸롱",
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
			industryCategory: "룸싸롱",
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
			industryCategory: "룸싸롱",
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
			industryCategory: "룸싸롱",
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
			industryCategory: "룸싸롱",
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

	it("maps region/district onto fields, location and tags", () => {
		const job = toMarketplaceJob({
			district: "강남구",
			districtCode: "1168000000",
			id: "44444444-4444-4444-8444-444444444401",
			industryCategory: "룸싸롱",
			payAmount: 150_000,
			payUnit: "일급",
			region: "서울",
			regionCode: "1100000000",
			status: "published",
			title: "세부지역 공고",
		});

		expect(job.region).toBe("서울");
		expect(job.district).toBe("강남구");
		// 표시 문자열과 별개로 코드가 실려야 필터가 코드 비교를 할 수 있다.
		expect(job.regionCode).toBe("1100000000");
		expect(job.districtCode).toBe("1168000000");
		expect(job.location).toBe("서울 · 강남구");
		expect(job.tags).toContain("강남구");
	});

	it("falls back to region alone when the job has no district", () => {
		const job = toMarketplaceJob({
			id: "44444444-4444-4444-8444-444444444402",
			industryCategory: "룸싸롱",
			payAmount: 150_000,
			payUnit: "일급",
			region: "기타",
			status: "published",
			title: "세부지역 없는 공고",
		});

		expect(job.district).toBe("");
		// 코드를 못 받은 공고(수집 원문 매칭 실패)는 빈 문자열이라 코드 필터에 걸리지 않는다.
		expect(job.districtCode).toBe("");
		expect(job.regionCode).toBe("");
		expect(job.location).toBe("기타");
		// 빈 세부지역이 태그로 새면 칩이 빈 칸으로 렌더된다.
		expect(job.tags).not.toContain("");
	});
});
