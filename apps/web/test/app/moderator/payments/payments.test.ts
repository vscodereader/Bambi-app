import fs from "node:fs";
import { describe, expect, it } from "vitest";
import { srcPath } from "../../../src-path";

const readSource = (relativePath: string) =>
	fs.readFileSync(srcPath(`app/moderator/payments/${relativePath}`), "utf8");

describe("moderator payments management page", () => {
	const source = readSource("page.tsx");

	it("loads the payment queue and processes bulk payments via bulkSetJobPostPayment", () => {
		// 결제 대상 목록 조회 + 일괄 결제 상태 전환 뮤테이션 연결
		expect(source).toContain(
			"orpc.bambi.moderation.listJobsForPayment.queryOptions"
		);
		expect(source).toContain(
			"orpc.bambi.moderation.bulkSetJobPostPayment.mutationOptions()"
		);
		expect(source).toContain("bulkSetPayment(");
		expect(source).toContain("{ jobPostIds, paymentStatus }");

		// 성공 시 목록 무효화 + 토스트
		expect(source).toContain(
			"orpc.bambi.moderation.listJobsForPayment.queryKey"
		);
		expect(source).toContain("invalidateQueries");
		expect(source).toContain('from "sonner"');
		expect(source).toContain("처리했어요");
		expect(source).toContain("미결제로 되돌리기");
	});

	it("renders payment/exposure badges and the paid toggle buttons", () => {
		expect(source).toContain("StatusBadge");
		expect(source).toContain("PAYMENT_STATUS_LABELS[job.paymentStatus]");
		expect(source).toContain("EXPOSURE_TYPE_LABELS[job.exposureType]");
		expect(source).toContain("결제완료 처리");
		expect(source).toContain("미결제로 되돌리기");
	});

	it("derives the 공고 상태 column from real exposure (published+unpaid → 미공개)", () => {
		// 검수 축(status)만 보면 published가 "공개"로 오표기되므로, paymentStatus까지 반영하는
		// getJobDisplayStatus로 실제 공개 여부를 파생한다(published+미결제 → "미공개").
		expect(source).toContain("getJobDisplayStatus");
		expect(source).toContain("paymentStatus: job.paymentStatus");
		expect(source).not.toContain("getJobStatusTone");
		expect(source).not.toContain("jobStatusLabels");
	});

	it("lists rows in a DataTable with an unpaid-only filter", () => {
		expect(source).toContain("DataTable");
		expect(source).toContain("DataColumn<PaymentJob>");
		expect(source).toContain("getRowKey={(job) => job.id}");
		expect(source).toContain("Switch");
		expect(source).toContain("onlyUnpaid");
		expect(source).toContain("미결제만 보기");
	});

	it("aligns to the shared moderator content width via header-matched padding", () => {
		// 폭은 ModeratorShell이 단일 권한으로 담당하므로, 페이지는 자체 max-width 없이
		// 헤더와 맞춘 좌우 여백(px-5 md:px-6)만 사용한다.
		expect(source).toContain("px-5");
		expect(source).toContain("md:px-6");
		expect(source).not.toContain("APP_CONTENT_WIDTH");
	});
});

describe("moderator navigation", () => {
	it("registers the payments entry", () => {
		const layout = readSource("../layout.tsx");

		expect(layout).toContain('href: "/moderator/payments"');
		expect(layout).toContain("결제 관리");
	});
});
