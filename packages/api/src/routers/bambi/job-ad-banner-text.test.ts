import { describe, expect, it } from "vitest";

// jobs.ts는 라우터라 import 시점에 @bambi-app/db → 서버 env 검증을 끌고 온다. 이 테스트는
// 순수 함수만 보고 DB에 붙지 않으므로(pg Pool은 지연 연결), 다른 라우터 테스트처럼 실제
// .env를 요구하는 대신 최소 값만 채워 모듈 로드를 통과시킨다.
process.env.DATABASE_URL ??= "postgres://bambi:bambi@127.0.0.1:5432/bambi_test";
process.env.BETTER_AUTH_SECRET ??= "test-secret-for-module-load-only-32chars";
process.env.BETTER_AUTH_URL ??= "http://localhost:3000";
process.env.CORS_ORIGIN ??= "http://localhost:3001";

const { normalizeAdBannerText } = await import("./jobs");

const filled = {
	adBannerAnimation: "blur-in" as const,
	adBannerHeadline: "주말 알바 급구",
	adBannerSubline: "당일 지급",
	adBannerTheme: "dark" as const,
	adBannerVerticalText: "급구",
};

describe("normalizeAdBannerText", () => {
	it("keeps the banner text for premium exposure", () => {
		expect(normalizeAdBannerText(filled, "premium-banner")).toEqual(filled);
	});

	it("keeps the banner text for legacy side-banner exposure", () => {
		// 레거시 left/right-banner 공고도 프리미엄 풀에서 함께 노출되므로 문구를 유지한다.
		expect(normalizeAdBannerText(filled, "left-banner")).toEqual(filled);
		expect(normalizeAdBannerText(filled, "right-banner")).toEqual(filled);
	});

	it("drops the banner text for non-banner exposure", () => {
		// 리스팅 상품·무료 공고는 배너 슬롯을 쓰지 않는다. 문구를 저장해두면 나중에
		// 배너 상품으로 바뀔 때 검수받지 않은 문구가 조용히 노출된다.
		expect(normalizeAdBannerText(filled, "special")).toEqual({
			adBannerAnimation: null,
			adBannerHeadline: null,
			adBannerSubline: null,
			adBannerTheme: null,
			adBannerVerticalText: null,
		});
		expect(normalizeAdBannerText(filled, "standard")).toEqual({
			adBannerAnimation: null,
			adBannerHeadline: null,
			adBannerSubline: null,
			adBannerTheme: null,
			adBannerVerticalText: null,
		});
	});

	it("treats blank text as unset", () => {
		const blank = normalizeAdBannerText(
			{ ...filled, adBannerHeadline: "   ", adBannerVerticalText: "" },
			"premium-banner"
		);

		expect(blank.adBannerHeadline).toBeNull();
		expect(blank.adBannerVerticalText).toBeNull();
	});
});
