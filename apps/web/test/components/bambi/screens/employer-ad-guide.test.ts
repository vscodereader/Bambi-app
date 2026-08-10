import fs from "node:fs";
import { describe, expect, it } from "vitest";
import { srcPath } from "../../../src-path";

const source = fs.readFileSync(
	srcPath("components/bambi/screens/employer-ad-guide.tsx"),
	"utf8"
);

describe("employer ad guide screen", () => {
	it("shows the 금칙어·불량 업소 광고 삭제 warning in full", () => {
		expect(source).toContain(
			"광고 상품에 적용할 공고가 금칙어 또는 불량 업소의 경우 수정 중단 및 광고가 삭제됩니다."
		);
		// 경고는 muted가 아니라 눈에 띄는 상태 토큰으로 표기한다
		expect(source).toContain("text-destructive");
	});

	it("shares one grid template between the header row and product rows", () => {
		// 헤더와 상품 행 모두 동일한 PRODUCT_ROW_GRID 상수를 소비해야 정렬이 맞는다
		expect(source).toContain("PRODUCT_ROW_GRID");
		const usages = source.match(/PRODUCT_ROW_GRID/g) ?? [];
		// 정의 1 + 헤더 소비 1 + 상품 행 소비 1
		expect(usages.length).toBeGreaterThanOrEqual(3);
	});

	it("shows an auto-boost inclusion line when the product has auto boosts", () => {
		// 자동 횟수>0이면 수동 라인과 동일 스타일의 자동 포함 라인을 표기한다
		expect(source).toContain("product.autoBoostsPerDay > 0");
		expect(source).toContain("일일 자동 끌어올리기");
	});

	it("clarifies boosts are for listing ads only, not banner ads", () => {
		// 끌어올리기는 리스팅 전용·배너 제외임이 안내 문구로 드러나야 한다
		expect(source).toContain("리스팅 광고에만 제공되며");
		expect(source).toContain("배너 광고에는 제공되지 않습니다");
	});

	it("reflects per-option catalog discounts through the shared price tag", () => {
		// 할인은 상품이 아니라 가격 옵션(기간)마다 매겨진다 — 옵션별 값을 태그로 전달한다
		expect(source).toContain("AdPriceTag");
		expect(source).toContain("discountPercent={option.discountPercent ?? 0}");
		expect(source).toContain("amount={option.amount}");
		// 상품 레벨 할인 참조는 남지 않는다
		expect(source).not.toContain("product.discountPercent");
	});

	it("shows the active campaign period below its price", () => {
		expect(source).toContain("option.campaignStartsAt");
		expect(source).toContain("formatAdCampaignPeriod(");
		expect(source).toContain("option.campaignEndsAt ?? null");
	});

	it("uses only ratio tracks so column widths do not depend on content", () => {
		// 4개 열 전부 minmax(0,_fr) 비율 트랙 — 내용 의존 auto 트랙은 정렬을 깬다
		expect(source).toContain(
			"md:grid-cols-[minmax(0,1.1fr)_minmax(0,1.4fr)_minmax(0,1fr)_minmax(0,0.9fr)]"
		);
		// 헤더·행마다 폭이 달라지던 원인이던 auto_auto 트랙 조합이 없어야 한다
		expect(source).not.toContain("_auto_auto]");
	});
});
