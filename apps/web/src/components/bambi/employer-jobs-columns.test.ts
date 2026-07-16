import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const read = (relative: string) =>
	fs.readFileSync(path.join(import.meta.dirname, relative), "utf8");

describe("employer jobs DataTable columns", () => {
	it("keeps the content-axis columns and drops the ad-axis columns", () => {
		const source = read("employer-jobs-columns.tsx");

		// 컬럼 팩토리 + 삭제 위임 콜백 (raw shadcn DataColumn 기반)
		expect(source).toContain("export function getEmployerJobsColumns");
		expect(source).toContain("DataColumn<EmployerJob>");
		expect(source).toContain("onRequestDelete");
		expect(source).toContain("deletingJobId");

		// 광고 노출·결제 축 컬럼은 광고 관리 페이지로 이관 — 여기선 제거
		expect(source).not.toContain("노출 상품");
		expect(source).not.toContain("결제 상태");
		expect(source).not.toContain("기간");

		// 이관에 따라 노출·결제 라벨/날짜 유틸도 미사용 → import 제거
		expect(source).not.toContain("EXPOSURE_TYPE_LABELS");
		expect(source).not.toContain("PAYMENT_STATUS_LABELS");
		expect(source).not.toContain("formatDate");
		// 만료 danger 톤 시각 구분도 기간 컬럼과 함께 제거
		expect(source).not.toContain("text-destructive");

		// 공고 콘텐츠 축 컬럼은 유지 — 공고 상태는 파생 배지(published+미결제 "미공개" 신호)
		expect(source).toContain("공고 상태");
		expect(source).toContain("getJobDisplayStatus");
		expect(source).toContain("formatPay");
		expect(source).toContain("StatusBadge");
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
