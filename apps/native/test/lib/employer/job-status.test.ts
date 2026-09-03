import { describe, expect, it } from "vitest";

import {
	countJobStatuses,
	getDeleteRefundDescription,
	getJobDisplayStatus,
	getJobStatusNote,
} from "@/src/lib/employer/job-status";

describe("countJobStatuses", () => {
	it("게시·검수대기·반려만 센다", () => {
		expect(
			countJobStatuses([
				{ status: "published" },
				{ status: "published" },
				{ status: "pending_review" },
				{ status: "rejected" },
				{ status: "hidden" },
			])
		).toEqual({ pendingReview: 1, published: 2, rejected: 1 });
	});
});

describe("getJobDisplayStatus", () => {
	it("게시됐지만 미결제면 미공개/warning", () => {
		expect(
			getJobDisplayStatus({ paymentStatus: "unpaid", status: "published" })
		).toEqual({ label: "미공개", tone: "warning" });
	});

	it("게시 완료는 공개/success", () => {
		expect(
			getJobDisplayStatus({ paymentStatus: "paid", status: "published" })
		).toEqual({ label: "공개", tone: "success" });
	});

	it("반려는 danger, 검수대기는 warning", () => {
		expect(
			getJobDisplayStatus({ paymentStatus: "paid", status: "rejected" }).tone
		).toBe("danger");
		expect(
			getJobDisplayStatus({ paymentStatus: "paid", status: "pending_review" })
				.tone
		).toBe("warning");
	});
});

describe("getJobStatusNote", () => {
	it("대기열이 최우선", () => {
		expect(
			getJobStatusNote({
				listingQueuePosition: 3,
				paymentStatus: "paid",
				rejectionReason: null,
				status: "published",
			})
		).toBe("자리가 나면 순서대로 자동 노출됩니다.");
	});

	it("반려 사유가 있으면 사유를 붙인다", () => {
		expect(
			getJobStatusNote({
				listingQueuePosition: null,
				paymentStatus: "paid",
				rejectionReason: "위험어 포함",
				status: "rejected",
			})
		).toBe("반려 사유: 위험어 포함");
	});

	it("반려 사유가 없으면 재검수 안내", () => {
		expect(
			getJobStatusNote({
				listingQueuePosition: null,
				paymentStatus: "paid",
				rejectionReason: null,
				status: "rejected",
			})
		).toBe("수정 후 제출하면 재검수를 거칩니다.");
	});

	it("미결제 게시는 입금 확인 안내", () => {
		expect(
			getJobStatusNote({
				listingQueuePosition: null,
				paymentStatus: "unpaid",
				rejectionReason: null,
				status: "published",
			})
		).toBe("입금 확인 후 노출됩니다.");
	});

	it("미결제 검수대기는 검수·입금 안내", () => {
		expect(
			getJobStatusNote({
				listingQueuePosition: null,
				paymentStatus: "unpaid",
				rejectionReason: null,
				status: "pending_review",
			})
		).toBe("검수 통과와 입금 확인을 모두 마쳐야 노출됩니다.");
	});

	it("정상 게시는 note 없음", () => {
		expect(
			getJobStatusNote({
				listingQueuePosition: null,
				paymentStatus: "paid",
				rejectionReason: null,
				status: "published",
			})
		).toBeNull();
	});
});

describe("getDeleteRefundDescription", () => {
	it("환급 잠금이 최우선", () => {
		expect(
			getDeleteRefundDescription({
				forfeitedAmount: 0,
				refundAmount: 0,
				refundLocked: true,
				usedAmount: 100,
			})
		).toBe(
			"한 번이라도 결제 완료가 되거나 공개 처리된 공고에 사용된 포인트는 환불이 어렵습니다. 삭제한 공고와 연결된 기록은 되돌릴 수 없어요."
		);
	});

	it("일부 소멸이면 캡·사용·소멸 금액을 안내한다", () => {
		expect(
			getDeleteRefundDescription({
				cap: 5000,
				forfeitedAmount: 200,
				refundAmount: 800,
				refundLocked: false,
				usedAmount: 1000,
			})
		).toBe(
			"지금 취소하시면 최대 보유 포인트는 5,000포인트까지 가능하므로 사용하신 1,000포인트 중 200포인트는 환급이 불가합니다. 그대로 하시겠습니까?"
		);
	});

	it("전액 환급이면 즉시 환급 안내", () => {
		expect(
			getDeleteRefundDescription({
				forfeitedAmount: 0,
				refundAmount: 800,
				refundLocked: false,
				usedAmount: 800,
			})
		).toBe("공고를 삭제하면 사용한 800포인트가 즉시 환급됩니다.");
	});

	it("환급 없음/미리보기 없음은 기본 문구", () => {
		expect(getDeleteRefundDescription(null)).toBe(
			"삭제한 공고와 연결된 광고·성과 기록은 되돌릴 수 없어요."
		);
	});
});
