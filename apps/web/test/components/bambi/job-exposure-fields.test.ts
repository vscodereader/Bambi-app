import fs from "node:fs";
import { describe, expect, it } from "vitest";
import { srcPath } from "../../src-path";

const componentPath = (fileName: string) =>
	srcPath(`components/bambi/${fileName}`);

const readComponent = (fileName: string) =>
	fs.readFileSync(componentPath(fileName), "utf8");

describe("job exposure and payment fields", () => {
	it("wires the new job page to the exposure/payment section", () => {
		const source = readComponent("../../app/employer/new/page.tsx");

		// 노출·결제 섹션 컴포넌트를 렌더하고 폼 상태를 연결한다
		expect(source).toContain("JobExposureFields");
		expect(source).toContain("paymentMethod={form.paymentMethod}");
		expect(source).toContain(
			"exposureDurationDays={form.exposureDurationDays}"
		);
		expect(source).toContain(
			"onPaymentMethodChange={handlePaymentMethodChange}"
		);
	});

	it("blocks submit when a paid product is paired with the unsupported card method", () => {
		const source = readComponent("../../app/employer/new/page.tsx");
		const editSource = readComponent(
			"../../app/employer/jobs/[id]/edit/page.tsx"
		);

		// 신용카드면 등록/수정 제출을 막는다. 결제 축은 유료 공고면 공고 결제수단,
		// 무료 공고면 끌어올리기 옵션 결제수단이다(resolveActivePaymentMethod).
		for (const src of [source, editSource]) {
			expect(src).toContain("cardPaymentBlocked");
			expect(src).toContain('activePaymentMethod === "card"');
			expect(src).toContain("resolveActivePaymentMethod");
			expect(src).toContain("form.adProductId");
		}
	});

	it("무통장입금 계좌 0개면 제출을 막는 게이트가 new/edit에 있다", () => {
		for (const file of [
			"../../app/employer/new/page.tsx",
			"../../app/employer/jobs/[id]/edit/page.tsx",
		]) {
			const source = readComponent(file);
			expect(source).toContain("bankTransferBlocked");
			expect(source).toContain("getPaymentAccounts");
			expect(source).toContain('paymentMethod === "bank_transfer"');
		}
	});

	it("re-shows the bank transfer guide after a bank-transfer registration", () => {
		const source = readComponent("../../app/employer/new/page.tsx");

		expect(source).toContain("BankTransferGuide");
		expect(source).toContain("무통장입금 안내");
		expect(source).toContain('jobInput.paymentMethod === "bank_transfer"');
		// 무료 공고 + 끌어올리기 옵션은 입금이 게시 조건이 아니라 옵션 적용 조건이다.
		expect(source).toContain("끌어올리기 옵션은 입금 확인 후 적용됩니다");
		expect(source).toContain("공고는 검수 후 공개됩니다");
	});

	it("offers card and bank transfer payment methods", () => {
		const source = readComponent("job-exposure-fields.tsx");

		expect(source).toContain("export function JobExposureFields");
		expect(source).toContain('value: "card"');
		expect(source).toContain('value: "bank_transfer"');
		expect(source).toContain("신용카드");
		expect(source).toContain("무통장입금");
		// 기존 결제 안내문은 유지한다
		expect(source).toContain(
			"결제는 운영자 확인 후 완료되며, 검수·결제완료 시 게시됩니다."
		);
	});

	it("warns for the unsupported card method and shows the account guide for bank transfer", () => {
		const source = readComponent("job-exposure-fields.tsx");

		// 신용카드 선택 시 준비중 안내
		expect(source).toContain('paymentMethod === "card"');
		expect(source).toContain("아직 지원하지 않는 결제 방법입니다");
		expect(source).toContain("곧 지원할");
		// 무통장입금 선택 시 계좌 안내
		expect(source).toContain('paymentMethod === "bank_transfer"');
		expect(source).toContain("BankTransferGuide");
	});

	it("reflects per-option catalog discounts in duration prices and the payable total", () => {
		const source = readComponent("job-exposure-fields.tsx");

		// 기간별 가격과 결제 예정 금액을 할인 반영 공용 태그로 렌더한다
		expect(source).toContain("AdPriceTag");
		// 트리거 라벨은 문자열이라 할인가+"N% 할인" 병기 포맷터를 쓴다
		expect(source).toContain("formatAdPriceLabel");
		// 결제 금액은 할인가로 확정해 서버 스냅샷과 같은 값으로 보낸다
		expect(source).toContain("resolveAdPrice");
		expect(source).toContain("discountedAmount");
		// 할인율은 선택된 상품이 아니라 각 가격 옵션(기간)에서 읽는다
		expect(source).toContain("priceOption.discountPercent ?? 0");
		expect(source).toContain("option.discountPercent ?? 0");
		// 상품 레벨 할인 참조는 남지 않는다
		expect(source).not.toContain("selectedProduct?.discountPercent");
		expect(source).not.toContain("product?.discountPercent");
	});

	it("옵션이 있는 상품에서만 체크박스를 그리고 총액에 합산한다", () => {
		const source = readComponent("job-exposure-fields.tsx");

		expect(source).toContain("selectedProduct?.detailDesignPrice");
		expect(source).toContain("sumJobPaymentAmount");
		expect(source).toContain("detail-design-requested");
	});

	it("무통장입금 안내 금액도 애드온을 합한 총액이다", () => {
		const source = readComponent("job-exposure-fields.tsx");

		// 노출 금액만 안내하면 애드온만큼 덜 입금된다.
		expect(source).toContain("amount={payableTotal}");
	});

	it("등록·수정 폼이 애드온 상태를 JobExposureFields에 잇는다", () => {
		for (const file of [
			"../../app/employer/new/page.tsx",
			"../../app/employer/jobs/[id]/edit/page.tsx",
		]) {
			const source = readComponent(file);

			expect(source).toContain(
				"detailDesignRequested={form.detailDesignRequested}"
			);
			expect(source).toContain(
				"onDetailDesignChange={handleDetailDesignChange}"
			);
		}
	});

	it("수정 폼 프리필이 애드온 상태를 복원한다", () => {
		for (const file of [
			"../../app/employer/jobs/[id]/edit/page.tsx",
			"../../app/moderator/jobs/[id]/edit/page.tsx",
		]) {
			const source = readComponent(file);

			// 프리필을 빠뜨리면 기본값(false)이 저장되어 구인자가 신청한 옵션이 조용히 풀린다.
			expect(source).toContain("detailDesignAmount: job.detailDesignAmount");
			expect(source).toContain(
				"detailDesignRequested: job.detailDesignStatus !== null"
			);
		}
	});

	it("완료 건 애드온을 동결한다(체크박스 비활성·자동 언체크 스킵)", () => {
		const source = readComponent("job-exposure-fields.tsx");

		// 완료 상태면 체크박스를 체크된 채 비활성으로 보여 주고 안내 한 줄을 단다.
		expect(source).toContain('status === "completed"');
		expect(source).toContain("disabled");
		expect(source).toContain("제작이 완료된 옵션은 변경할 수 없어요");
		// 완료 건은 자동 언체크·신가 덮어쓰기를 모두 스킵한다(강제 언체크 시 서버가 저장을 막는다).
		expect(source).toContain("onChange?.(false, null)");
	});

	it("수정 폼이 애드온 진행 상태를 JobExposureFields에 잇는다", () => {
		for (const file of [
			"../../app/employer/jobs/[id]/edit/page.tsx",
			"../../app/moderator/jobs/[id]/edit/page.tsx",
		]) {
			const source = readComponent(file);

			// 완료 건 동결 판정에 필요한 진행 상태를 넘긴다.
			expect(source).toContain("detailDesignStatus={job.detailDesignStatus}");
		}
	});

	it("bank transfer guide lists accounts with copy and deposit instructions", () => {
		const source = readComponent("bank-transfer-guide.tsx");

		expect(source).toContain("getPaymentAccounts");
		expect(source).toContain("navigator.clipboard.writeText");
		expect(source).toContain("계좌번호를 복사했어요");
		expect(source).toContain("예금주");
		expect(source).toContain(
			"입금자명은 업체명(상호)과 동일하게 입금해 주세요"
		);
		expect(source).toContain("입금 확인 후 공고가 게시됩니다");
		// 계좌 미설정 시 고객센터 문의 폴백
		expect(source).toContain("고객센터");
	});
});
