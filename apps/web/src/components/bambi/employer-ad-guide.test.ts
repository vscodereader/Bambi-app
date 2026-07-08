import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const readFrom = (relativePath: string) =>
	fs.readFileSync(path.join(import.meta.dirname, relativePath), "utf8");

describe("employer ad guide (광고 상품 안내)", () => {
	it("defines three promotion-tier ad products with period prices", () => {
		const source = readFrom("../../lib/bambi/ad-products.ts");

		// 백엔드 promotionTier와 정합하는 3등급
		expect(source).toContain('tier: "premium"');
		expect(source).toContain('tier: "recommended"');
		expect(source).toContain('tier: "standard"');
		expect(source).toContain("프리미엄 광고");
		expect(source).toContain("추천 광고");
		expect(source).toContain("일반 광고");
		// 30/60/90일 기간별 가격표(플레이스홀더 상수)
		expect(source).toContain("days: 30");
		expect(source).toContain("days: 60");
		expect(source).toContain("days: 90");
		expect(source).toContain("330_000");
		// 천단위 포맷터(로케일 고정)
		expect(source).toContain("export function formatAdPrice");
		expect(source).toContain('"ko-KR"');
	});

	it("renders reference-style product rows with placement, benefits, price, and apply", () => {
		const source = readFrom("screens/employer-ad-guide.tsx");

		expect(source).toContain("export function EmployerAdGuideScreen");
		expect(source).toContain("<PageShell");
		expect(source).toContain("광고 상품 안내");
		// 4영역: 노출 위치 다이어그램 · 서비스 내용 · 이용 요금 · 신청
		expect(source).toContain("<AdPlacementDiagram");
		expect(source).toContain("노출 위치");
		expect(source).toContain("서비스 내용");
		expect(source).toContain("이용 요금");
		expect(source).toContain("신청하기");
		// 신청은 공고 등록으로 이동
		expect(source).toContain('const APPLY_HREF = "/employer/new"');
		// primary 위계: 상품 신청 버튼은 outline, 상단 문의 CTA만 primary
		expect(source).toContain('buttonVariants({ variant: "outline" })');
	});

	it("provides an ad placement mini diagram", () => {
		const source = readFrom("ad-placement-diagram.tsx");

		expect(source).toContain("export function AdPlacementDiagram");
		expect(source).toContain("highlightRows");
		expect(source).toContain("accentClassName");
	});

	it("adds a route and entry points for the ad guide", () => {
		const route = readFrom("../../app/employer/ad-guide/page.tsx");
		const layout = readFrom("../../app/employer/layout.tsx");
		const dashboard = readFrom("../../app/employer/page.tsx");

		expect(route).toContain("EmployerAdGuideScreen");
		// 헤더 nav 항목
		expect(layout).toContain("/employer/ad-guide");
		expect(layout).toContain("광고 안내");
		// 대시보드 바로가기 타일
		expect(dashboard).toContain("/employer/ad-guide");
		expect(dashboard).toContain("광고 상품 안내");
	});
});
