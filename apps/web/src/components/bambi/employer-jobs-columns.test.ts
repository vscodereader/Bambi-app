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
		expect(source).toContain("기간");

		// 노출·결제 라벨/유틸 재사용
		expect(source).toContain("EXPOSURE_TYPE_LABELS");
		expect(source).toContain("PAYMENT_STATUS_LABELS");

		// 기존 라벨/포맷/배지 재사용
		expect(source).toContain("formatPay");
		expect(source).toContain("formatDate");
		expect(source).toContain("StatusBadge");

		// 만료 날짜 컬럼: 만료일 텍스트 표시, null(무기한)은 muted "-"
		expect(source).toContain("formatDate(job.exposureEndsAt)");
		expect(source).toContain(
			'return <span className="text-muted-foreground">-</span>'
		);
		// 만료가 지난 경우 날짜를 danger 톤으로 시각 구분(뱃지 미사용)
		expect(source).toContain("text-destructive");
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
