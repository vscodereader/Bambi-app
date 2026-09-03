import { describe, expect, it } from "vitest";

import {
	businessErrorMessage,
	getBiznumCheckText,
	getBiznumStatusLabel,
	getEmployerGateNotice,
	resolveBusinessScreenState,
	validateBusinessForm,
} from "@/src/lib/employer/business";

describe("getBiznumStatusLabel", () => {
	it("코드별 라벨과 미상 폴백", () => {
		expect(getBiznumStatusLabel("01")).toBe("계속사업자");
		expect(getBiznumStatusLabel("03")).toBe("폐업자");
		expect(getBiznumStatusLabel(null)).toBe("상태 미상");
		expect(getBiznumStatusLabel("99")).toBe("상태 미상");
	});
});

describe("getBiznumCheckText", () => {
	it("확인 전이고 기능 있으면 미확인", () => {
		expect(
			getBiznumCheckText({
				biznumCheckEnabled: true,
				biznumCheckedAt: null,
				biznumStatusCode: null,
			})
		).toBe("미확인");
	});

	it("확인 전이고 기능 없으면 준비 안내", () => {
		expect(
			getBiznumCheckText({
				biznumCheckEnabled: false,
				biznumCheckedAt: null,
				biznumStatusCode: null,
			})
		).toBe("곧 준비될 기능입니다");
	});

	it("확인 완료면 상태·시각을 붙인다", () => {
		const text = getBiznumCheckText({
			biznumCheckEnabled: true,
			biznumCheckedAt: "2026-09-01T00:00:00.000Z",
			biznumStatusCode: "01",
		});

		expect(text.startsWith("확인 완료(계속사업자) · ")).toBe(true);
	});
});

describe("validateBusinessForm", () => {
	it("정상 입력을 통과시킨다", () => {
		const result = validateBusinessForm({
			businessRegistrationNumber: "123-45-67890",
			businessStartDate: "2020-01-01",
			displayName: "밤비 라운지",
			representativeName: "홍길동",
		});

		expect(result.ok).toBe(true);
	});

	it("형식이 틀린 사업자등록번호를 막는다", () => {
		const result = validateBusinessForm({
			businessRegistrationNumber: "12345",
			businessStartDate: "2020-01-01",
			displayName: "밤비",
			representativeName: "홍길동",
		});

		expect(result.ok).toBe(false);
		if (!result.ok) {
			expect(result.errors.businessRegistrationNumber).toBe(
				"사업자등록번호는 000-00-00000 형식으로 입력해 주세요."
			);
		}
	});
});

describe("resolveBusinessScreenState", () => {
	it("pending은 입력·삭제 잠금", () => {
		const state = resolveBusinessScreenState("pending");
		expect(state.inputsLocked).toBe(true);
		expect(state.canDeleteDocuments).toBe(false);
	});

	it("verified/changes_unsubmitted는 변경 시 확인 필요", () => {
		expect(resolveBusinessScreenState("verified").requiresConfirmation).toBe(
			true
		);
		expect(
			resolveBusinessScreenState("changes_unsubmitted").requiresConfirmation
		).toBe(true);
	});

	it("rejected는 재제출 라벨", () => {
		expect(resolveBusinessScreenState("rejected").submitLabel).toBe(
			"업체 정보 재제출"
		);
	});

	it("none은 제출 라벨·잠금 없음", () => {
		const state = resolveBusinessScreenState("none");
		expect(state.submitLabel).toBe("업체 정보 제출");
		expect(state.inputsLocked).toBe(false);
	});
});

describe("getEmployerGateNotice", () => {
	it("verified면 null", () => {
		expect(getEmployerGateNotice("verified", "공고를 등록")).toBeNull();
	});

	it("none은 입력 유도 + action 보간", () => {
		const notice = getEmployerGateNotice("none", "공고를 등록");
		expect(notice?.title).toBe("업체 정보 등록이 필요합니다");
		expect(notice?.description).toBe(
			"공고를 등록하려면 업체명과 사업자등록번호를 입력하세요."
		);
		expect(notice?.actionLabel).toBe("업체 정보 입력");
	});

	it("pending은 버튼 없음", () => {
		expect(
			getEmployerGateNotice("pending", "공고를 등록")?.actionLabel
		).toBeNull();
	});
});

describe("businessErrorMessage", () => {
	it("서버 한국어 message는 그대로", () => {
		expect(
			businessErrorMessage(
				Object.assign(
					new Error("국세청에 등록된 사업자등록정보와 일치하지 않습니다."),
					{
						code: "BAD_REQUEST",
					}
				)
			)
		).toBe("국세청에 등록된 사업자등록정보와 일치하지 않습니다.");
	});

	it("영어 기본 message는 코드 맵으로 대체", () => {
		expect(
			businessErrorMessage(
				Object.assign(new Error("Forbidden"), { code: "FORBIDDEN" })
			)
		).toBe("지금은 업체 정보를 변경할 수 없어요.");
	});

	it("코드 없으면 일반 문구", () => {
		expect(businessErrorMessage(new Error("boom"))).toBe(
			"요청을 처리하지 못했어요. 잠시 후 다시 시도해 주세요."
		);
	});
});
