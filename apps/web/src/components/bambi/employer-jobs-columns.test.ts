import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const read = (relative: string) =>
	fs.readFileSync(path.join(import.meta.dirname, relative), "utf8");

describe("employer jobs DataTable columns", () => {
	it("defines the exposure/payment/duration/expiry columns via a factory", () => {
		const source = read("employer-jobs-columns.tsx");

		// 컬럼 팩토리 + 삭제 위임 콜백 (raw shadcn DataColumn 기반)
		expect(source).toContain("export function getEmployerJobsColumns");
		expect(source).toContain("DataColumn<EmployerJob>");
		expect(source).toContain("onRequestDelete");
		expect(source).toContain("deletingJobId");

		// 헤더 라벨
		expect(source).toContain("노출 상품");
		expect(source).toContain("결제 상태");
		expect(source).toContain("남은 기간");
		expect(source).toContain("만료 상태");
		expect(source).toContain("사업자 인증");

		// 노출·결제·기간 라벨/유틸 재사용
		expect(source).toContain("EXPOSURE_TYPE_LABELS");
		expect(source).toContain("PAYMENT_STATUS_LABELS");
		expect(source).toContain("remainingDays");
		expect(source).toContain("expiryLabel");

		// 기존 라벨/포맷/배지 재사용
		expect(source).toContain("formatPay");
		expect(source).toContain("formatDateTime");
		expect(source).toContain("StatusBadge");

		// null 남은 기간은 "-"
		expect(source).toContain(
			'return <span className="text-muted-foreground">-</span>'
		);
	});

	it("wires the employer page to render the jobs DataTable", () => {
		const source = read("../../app/employer/page.tsx");

		expect(source).toContain("DataTable");
		expect(source).toContain("getEmployerJobsColumns");
		// 행 key 전달
		expect(source).toContain("getRowKey={(job) => job.id}");
		// 모바일 가로 스크롤 래퍼
		expect(source).toContain("overflow-x-auto");
		// 삭제 확인 흐름 유지
		expect(source).toContain("deleteMutation.mutate");
		expect(source).toContain("setDeletingJobId");
	});
});
