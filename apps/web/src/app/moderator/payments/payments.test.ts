import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const readSource = (relativePath: string) =>
	fs.readFileSync(path.join(import.meta.dirname, relativePath), "utf8");

describe("moderator payments management page", () => {
	const source = readSource("page.tsx");

	it("loads the payment queue and toggles payment via setJobPostPayment", () => {
		// 결제 대상 목록 조회 + 결제 상태 전환 뮤테이션 연결
		expect(source).toContain(
			"orpc.bambi.moderation.listJobsForPayment.queryOptions"
		);
		expect(source).toContain(
			"orpc.bambi.moderation.setJobPostPayment.mutationOptions()"
		);
		expect(source).toContain("setPayment(");
		expect(source).toContain("paymentStatus: nextStatus");

		// 성공 시 목록 무효화 + 토스트
		expect(source).toContain(
			"orpc.bambi.moderation.listJobsForPayment.queryKey"
		);
		expect(source).toContain("invalidateQueries");
		expect(source).toContain('from "sonner"');
		expect(source).toContain("결제완료로 처리했어요");
		expect(source).toContain("미결제로 되돌렸어요");
	});

	it("renders payment/exposure badges and the paid toggle buttons", () => {
		expect(source).toContain("StatusBadge");
		expect(source).toContain("PAYMENT_STATUS_LABELS[job.paymentStatus]");
		expect(source).toContain("EXPOSURE_TYPE_LABELS[job.exposureType]");
		expect(source).toContain("결제완료 처리");
		expect(source).toContain("미결제로 되돌리기");
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
