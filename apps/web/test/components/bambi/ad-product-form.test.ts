import fs from "node:fs";
import { describe, expect, it } from "vitest";
import { srcPath } from "../../src-path";

const readComponent = (fileName: string) =>
	fs.readFileSync(srcPath(`components/bambi/${fileName}`), "utf8");

describe("ad product form", () => {
	it("maps the preview-template select to Korean labels via items", () => {
		const source = readComponent("ad-product-form.tsx");
		// base-ui Select는 items 매핑이 없으면 트리거에 enum 원값을 그대로 노출한다
		expect(source).toContain("items={AD_PREVIEW_TEMPLATE_LABELS}");
		expect(source).toContain("AD_PREVIEW_TEMPLATE_LABELS,");
	});

	it("blocks submitting duplicate price-option durations", () => {
		const source = readComponent("ad-product-form.tsx");
		expect(source).toContain(
			"같은 이용 기간이 중복됩니다. 기간별로 하나만 등록해주세요."
		);
		expect(source).toContain("new Set(dayValues).size !== dayValues.length");
	});

	it("lets the 0 default be cleared in day/amount number inputs", () => {
		const source = readComponent("ad-product-form.tsx");
		expect(source).toContain('value={option.days === 0 ? "" : option.days}');
		expect(source).toContain(
			'value={option.amount === 0 ? "" : option.amount}'
		);
	});

	it("collects manualBoostsPerDay with the zero-clearable input pattern", () => {
		const source = readComponent("ad-product-form.tsx");
		expect(source).toContain("manualBoostsPerDay: number;");
		expect(source).toContain(
			'value={manualBoostsPerDay === 0 ? "" : manualBoostsPerDay}'
		);
	});

	it("collects autoBoostsPerDay with the same zero-clearable input pattern", () => {
		const source = readComponent("ad-product-form.tsx");
		expect(source).toContain("autoBoostsPerDay: number;");
		expect(source).toContain(
			'value={autoBoostsPerDay === 0 ? "" : autoBoostsPerDay}'
		);
	});

	it("collects per-option discountPercent as an optional field, clamped 0~100", () => {
		const source = readComponent("ad-product-form.tsx");
		// 할인율은 상품이 아니라 가격 옵션(기간)마다 매긴다 — optional 정수
		expect(source).toContain("discountPercent?: number;");
		// 상품 레벨 할인 필드·상태는 제거됐다
		expect(source).not.toContain("setDiscountPercent");
		expect(source).not.toContain('htmlFor="p-discount"');
		// 행별 할인율 입력은 zero-clearable 패턴을 재사용한다
		expect(source).toContain(
			'value={option.discountPercent ? option.discountPercent : ""}'
		);
		// 0~100 정수로 클램프한다
		expect(source).toContain("Math.max(0, Math.min(100, Math.floor(value)))");
		expect(source).toContain(
			"discountPercent: clampPercent(Number(e.target.value) || 0)"
		);
		// 옵션 할인율이 0이면 필드를 생략, 1~100이면 포함해 저장한다
		expect(source).toContain("percent > 0");
		expect(source).toContain("{ amount, days, discountPercent: percent }");
		expect(source).toContain("{ amount, days }");
	});

	it("restores an active campaign before ended history", () => {
		const source = readComponent("ad-product-form.tsx");
		expect(source).toContain("selectEditableAdCampaign(");
		expect(source).not.toContain(
			"b.startsAt.getTime() - a.startsAt.getTime())[0]"
		);
	});
});

describe("광고 상품 폼 — 상세이미지 디자인 제작 가격", () => {
	it("폼이 가격 입력 필드와 draft 필드를 갖는다", () => {
		const source = readComponent("ad-product-form.tsx");

		expect(source).toContain("detailDesignPrice");
		expect(source).toContain("p-detail-design-price");
		expect(source).toContain("상세이미지 디자인 제작 가격");
	});

	it("등록·수정 페이지가 가격을 서버로 넘긴다", () => {
		for (const file of [
			"app/moderator/ad-products/[placementId]/new/page.tsx",
			"app/moderator/ad-products/[placementId]/[productId]/edit/page.tsx",
		]) {
			expect(fs.readFileSync(srcPath(file), "utf8")).toContain(
				"detailDesignPrice: draft.detailDesignPrice"
			);
		}
	});
});
