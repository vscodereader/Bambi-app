import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const readComponent = (fileName: string) =>
	fs.readFileSync(path.join(import.meta.dirname, fileName), "utf8");

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
});
