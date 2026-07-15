import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const componentPath = (fileName: string) =>
	path.join(import.meta.dirname, fileName);

const readComponent = (fileName: string) =>
	fs.readFileSync(componentPath(fileName), "utf8");

describe("job exposure and payment fields", () => {
	it("wires the new job page to the exposure/payment section", () => {
		const source = readComponent("../../app/employer/new/page.tsx");

		// 노출·결제 섹션 컴포넌트를 렌더한다
		expect(source).toContain("JobExposureFields");
		// 폼 상태(노출 상품·결제 방법)를 컴포넌트에 연결한다
		expect(source).toContain("exposureType={form.exposureType}");
		expect(source).toContain("paymentMethod={form.paymentMethod}");
		expect(source).toContain(
			"exposureDurationDays={form.exposureDurationDays}"
		);
		// 유료 노출 결제 안내 문구를 검수 안내에 보강한다
		expect(source).toContain("운영자 결제 확인 후");
	});

	it("renders seven exposure products and two payment methods", () => {
		const source = readComponent("job-exposure-fields.tsx");

		expect(source).toContain("export function JobExposureFields");
		// 노출 상품 7종 값
		for (const value of [
			"premium-banner",
			"left-banner",
			"right-banner",
			"special",
			"urgent",
			"recommended",
			"standard",
		]) {
			expect(source).toContain(`value: "${value}"`);
		}
		// 노출 상품 라벨
		for (const label of [
			"프리미엄 배너",
			"좌측 배너",
			"우측 배너",
			"스페셜 채용",
			"급구 채용",
			"추천 채용",
			"일반 구인",
		]) {
			expect(source).toContain(label);
		}
		// 결제 방법 2종
		expect(source).toContain('value: "card"');
		expect(source).toContain('value: "bank_transfer"');
		expect(source).toContain("신용카드");
		expect(source).toContain("무통장입금");
	});

	it("shows the duration select only for paid exposure and keeps the payment notice", () => {
		const source = readComponent("job-exposure-fields.tsx");

		// standard가 아닐 때만 이용 기간·결제 방법 노출
		expect(source).toContain('exposureType !== "standard"');
		expect(source).toContain("showPaidOptions");
		// 이용 기간 30/60/90일
		expect(source).toContain("[30, 60, 90]");
		// 결제 안내문
		expect(source).toContain(
			"결제는 운영자 확인 후 완료되며, 검수·결제완료 시 게시됩니다."
		);
	});

	it("maps the duration select to labeled items so the trigger shows the label", () => {
		const source = readComponent("job-exposure-fields.tsx");
		// base-ui Select는 items 매핑이 있어야 트리거에 원값(일수) 대신 라벨을 표시한다
		expect(source).toContain("items={(selectedProduct?.priceOptions");
	});
});
