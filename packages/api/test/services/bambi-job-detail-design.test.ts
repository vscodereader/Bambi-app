import { describe, expect, it } from "vitest";

import {
	keepOrClearJobDetailDesign,
	resolveJobDetailDesign,
	sumJobPaymentAmount,
	toJobDetailDesignWrite,
} from "@/services/bambi-job-detail-design";

describe("sumJobPaymentAmount", () => {
	it("둘 다 null이면 null이다(무료 공고)", () => {
		expect(sumJobPaymentAmount(null, null)).toBeNull();
	});

	it("노출 금액만 있으면 그대로 반환한다", () => {
		expect(sumJobPaymentAmount(50_000, null)).toBe(50_000);
	});

	it("노출 금액과 옵션 금액을 더한다", () => {
		expect(sumJobPaymentAmount(50_000, 30_000)).toBe(80_000);
	});

	it("옵션 금액만 있으면 그 값만 반환한다", () => {
		expect(sumJobPaymentAmount(null, 30_000)).toBe(30_000);
	});
});

describe("resolveJobDetailDesign", () => {
	it("신청하면 상품 가격을 스냅샷하고 requested로 시작한다", () => {
		expect(
			resolveJobDetailDesign({
				currentStatus: null,
				productDetailDesignPrice: 30_000,
				requested: true,
			})
		).toEqual({
			ok: true,
			snapshot: { detailDesignAmount: 30_000, detailDesignStatus: "requested" },
		});
	});

	it("옵션이 없는 상품(가격 null)에 신청하면 not_offered로 거절한다", () => {
		expect(
			resolveJobDetailDesign({
				currentStatus: null,
				productDetailDesignPrice: null,
				requested: true,
			})
		).toEqual({ code: "not_offered", ok: false });
	});

	it("클라이언트가 본 가격과 서버 가격이 다르면 amount_changed로 거절한다", () => {
		expect(
			resolveJobDetailDesign({
				currentStatus: null,
				expectedAmount: 20_000,
				productDetailDesignPrice: 30_000,
				requested: true,
			})
		).toEqual({
			code: "amount_changed",
			expectedAmount: 20_000,
			ok: false,
			price: 30_000,
		});
	});

	it("이미 completed면 상태를 requested로 되돌리지 않는다", () => {
		expect(
			resolveJobDetailDesign({
				currentStatus: "completed",
				productDetailDesignPrice: 30_000,
				requested: true,
			})
		).toEqual({
			ok: true,
			snapshot: { detailDesignAmount: 30_000, detailDesignStatus: "completed" },
		});
	});

	it("해제하면 금액·상태를 모두 null로 되돌린다", () => {
		expect(
			resolveJobDetailDesign({
				currentStatus: "requested",
				productDetailDesignPrice: 30_000,
				requested: false,
			})
		).toEqual({
			ok: true,
			snapshot: { detailDesignAmount: null, detailDesignStatus: null },
		});
	});

	it("completed인 공고는 해제할 수 없다", () => {
		expect(
			resolveJobDetailDesign({
				currentStatus: "completed",
				productDetailDesignPrice: 30_000,
				requested: false,
			})
		).toEqual({ code: "completed_locked", ok: false });
	});

	it("completed + 상품 옵션 미제공(가격 null) + requested=true면 막지 않고 보존한다", () => {
		// 운영자가 옵션가를 제거해도 완료 건의 저장이 봉쇄되면 안 된다. not_offered로
		// 던지지 않고 completed 상태를 유지한다(금액 키 스킵은 toJobDetailDesignWrite 몫).
		expect(
			resolveJobDetailDesign({
				currentStatus: "completed",
				productDetailDesignPrice: null,
				requested: true,
			})
		).toEqual({
			ok: true,
			snapshot: { detailDesignAmount: null, detailDesignStatus: "completed" },
		});
	});

	it("completed + 옵션 미제공이어도 requested=false면 completed_locked이다", () => {
		// 해제 시도는 옵션 제공 여부와 무관하게 완료 건 동결 규칙(스펙)을 그대로 따른다.
		expect(
			resolveJobDetailDesign({
				currentStatus: "completed",
				productDetailDesignPrice: null,
				requested: false,
			})
		).toEqual({ code: "completed_locked", ok: false });
	});

	it("completed 건은 상품가가 바뀌어도 amount_changed로 막지 않는다", () => {
		// 완료 건까지 막으면 상품가가 한 번 오른 뒤로 본문 수정조차 못 하게 된다.
		expect(
			resolveJobDetailDesign({
				currentStatus: "completed",
				expectedAmount: 30_000,
				productDetailDesignPrice: 50_000,
				requested: true,
			})
		).toEqual({
			ok: true,
			snapshot: { detailDesignAmount: 50_000, detailDesignStatus: "completed" },
		});
	});
});

describe("toJobDetailDesignWrite", () => {
	it("completed 건은 상품가가 올라도 장부 금액을 건드리지 않는다", () => {
		// 상품가가 30,000 → 50,000으로 오른 상황. 스냅샷은 새 가격을 들고 오지만
		// 저장 값에서는 금액 키가 빠져야 한다(=컬럼 미변경 → 구매 시점 금액 유지).
		const write = toJobDetailDesignWrite({
			currentStatus: "completed",
			snapshot: {
				detailDesignAmount: 50_000,
				detailDesignStatus: "completed",
			},
		});

		expect(write).toStrictEqual({ detailDesignStatus: "completed" });
		expect(Object.hasOwn(write, "detailDesignAmount")).toBe(false);
	});

	it("완료 전이면 스냅샷 금액을 그대로 저장한다", () => {
		expect(
			toJobDetailDesignWrite({
				currentStatus: "requested",
				snapshot: {
					detailDesignAmount: 50_000,
					detailDesignStatus: "requested",
				},
			})
		).toStrictEqual({
			detailDesignAmount: 50_000,
			detailDesignStatus: "requested",
		});
	});

	it("미신청 스냅샷(해제)은 금액 키를 남겨 null로 지운다", () => {
		expect(
			toJobDetailDesignWrite({
				currentStatus: "requested",
				snapshot: { detailDesignAmount: null, detailDesignStatus: null },
			})
		).toStrictEqual({ detailDesignAmount: null, detailDesignStatus: null });
	});
});

describe("keepOrClearJobDetailDesign", () => {
	it("상품 변경으로 옵션이 사라지면 스냅샷을 정리한다", () => {
		// 유료 상품+신청 상태에서 무료(상품 미선택)나 옵션 없는 상품으로 바꾼 경우.
		// 금액을 안 지우면 결제 합산이 있지도 않은 옵션을 청구 예정으로 띄운다.
		expect(
			keepOrClearJobDetailDesign({
				currentStatus: "requested",
				productOffersDetailDesign: false,
			})
		).toStrictEqual({ detailDesignAmount: null, detailDesignStatus: null });
	});

	it("completed 건은 옵션이 사라져도 제작 이력을 지우지 않는다", () => {
		expect(
			keepOrClearJobDetailDesign({
				currentStatus: "completed",
				productOffersDetailDesign: false,
			})
		).toStrictEqual({ detailDesignStatus: "completed" });
	});

	it("상품이 여전히 옵션을 제공하면 금액을 건드리지 않는다", () => {
		expect(
			keepOrClearJobDetailDesign({
				currentStatus: "requested",
				productOffersDetailDesign: true,
			})
		).toStrictEqual({ detailDesignStatus: "requested" });
	});

	it("미신청 공고는 정리해도 변화가 없다(결제 리셋 유발 금지)", () => {
		expect(
			keepOrClearJobDetailDesign({
				currentStatus: null,
				productOffersDetailDesign: false,
			})
		).toStrictEqual({ detailDesignAmount: null, detailDesignStatus: null });
	});
});
