import { describe, expect, it } from "vitest";

import type { AdBannerLayoutInput } from "@/services/bambi-ad-banner-layout";

// jobs.ts는 라우터라 import 시점에 @bambi-app/db → 서버 env 검증을 끌고 온다. 이 테스트는
// 순수 함수만 보고 DB에 붙지 않으므로(pg Pool은 지연 연결), 다른 라우터 테스트처럼 실제
// .env를 요구하는 대신 최소 값만 채워 모듈 로드를 통과시킨다.
process.env.DATABASE_URL ??= "postgres://bambi:bambi@127.0.0.1:5432/bambi_test";
process.env.BETTER_AUTH_SECRET ??= "test-secret-for-module-load-only-32chars";
process.env.BETTER_AUTH_URL ??= "http://localhost:3000";
process.env.CORS_ORIGIN ??= "http://localhost:3001";

const { normalizeAdBannerLayout } = await import("@/routers/bambi/jobs");

const layout: AdBannerLayoutInput = {
	horizontal: {
		background: { type: "image" },
		scrim: { enabled: true, opacity: 65 },
		texts: [
			{
				align: "center",
				animation: "blur",
				color: "#ffffff",
				content: "주말 알바 급구",
				fontSize: 8,
				id: "block-1",
				weight: "bold",
				width: 60,
				x: 50,
				y: 50,
			},
		],
	},
	version: 1,
	vertical: {
		background: { type: "image" },
		scrim: { enabled: true, opacity: 65 },
		texts: [],
	},
};

describe("normalizeAdBannerLayout", () => {
	it("upserts the layout for premium exposure", () => {
		expect(
			normalizeAdBannerLayout({ adBannerLayout: layout }, "premium-banner")
		).toEqual({ kind: "upsert", layout });
	});

	it("upserts the layout for legacy side-banner exposure", () => {
		// 레거시 left/right-banner 공고도 프리미엄 풀에서 함께 노출되므로 레이아웃을 유지한다.
		expect(
			normalizeAdBannerLayout({ adBannerLayout: layout }, "left-banner")
		).toEqual({ kind: "upsert", layout });
		expect(
			normalizeAdBannerLayout({ adBannerLayout: layout }, "right-banner")
		).toEqual({ kind: "upsert", layout });
	});

	it("drops the layout for non-banner exposure", () => {
		// 리스팅 상품·무료 공고는 배너 슬롯을 쓰지 않는다. 레이아웃을 저장해두면 나중에
		// 배너 상품으로 바뀔 때 검수받지 않은 문구가 조용히 노출된다.
		expect(
			normalizeAdBannerLayout({ adBannerLayout: layout }, "special")
		).toEqual({ kind: "delete" });
		expect(
			normalizeAdBannerLayout({ adBannerLayout: layout }, "standard")
		).toEqual({ kind: "delete" });
	});

	it("drops the layout for non-banner exposure even when the key is omitted", () => {
		// 배너형에서 리스팅 상품으로 내려오는 수정에서도 남은 편집물을 지워야 한다.
		expect(normalizeAdBannerLayout({}, "standard")).toEqual({ kind: "delete" });
	});

	it("deletes the layout when the client sends an explicit null", () => {
		expect(
			normalizeAdBannerLayout({ adBannerLayout: null }, "premium-banner")
		).toEqual({ kind: "delete" });
	});

	it("keeps the stored layout when the key is omitted", () => {
		// 생략을 null로 취급해 무조건 덮으면, 다른 옵셔널 필드는 생략 시 보존되는데 배너
		// 편집물만 저장 한 번에 사라지는 비대칭이 생긴다.
		expect(normalizeAdBannerLayout({}, "premium-banner")).toEqual({
			kind: "keep",
		});
		expect(
			normalizeAdBannerLayout({ adBannerLayout: undefined }, "premium-banner")
		).toEqual({ kind: "keep" });
	});
});
