import fs from "node:fs";
import { describe, expect, it } from "vitest";
import { MODERATOR_NAV_ITEMS } from "@/lib/bambi/moderator-navigation";
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

	// 배지 렌더는 공고 관리와의 중복 제거로 job-table-columns의 공용 컬럼 팩토리로 이관됐다.
	const columnFactories = fs.readFileSync(
		srcPath("components/bambi/job-table-columns.tsx"),
		"utf8"
	);

	it("renders payment/exposure badges and the paid toggle buttons", () => {
		expect(source).toContain('from "@/components/bambi/job-table-columns"');
		expect(source).toContain("paymentStatusColumn<PaymentJob>()");
		expect(source).toContain("exposureTypeColumn<PaymentJob>()");
		// 팩토리가 실제로 라벨 맵 경유 배지를 그린다(enum 원값 노출 금지).
		expect(columnFactories).toContain("StatusBadge");
		expect(columnFactories).toContain(
			"PAYMENT_STATUS_LABELS[row.paymentStatus]"
		);
		expect(columnFactories).toContain("EXPOSURE_TYPE_LABELS[row.exposureType]");

		expect(source).toContain("결제완료 처리");
		expect(source).toContain("미결제로 되돌리기");
	});

	it("derives the 공고 상태 column from real exposure (published+unpaid → 미공개)", () => {
		// 검수 축(status)만 보면 published가 "공개"로 오표기되므로, paymentStatus까지 반영하는
		// getJobDisplayStatus로 실제 공개 여부를 파생한다(published+미결제 → "미공개").
		// 파생 자체는 jobStatusColumn 팩토리 안에 있으니 배선 + 팩토리를 함께 확인한다.
		expect(source).toContain("jobStatusColumn<PaymentJob>()");
		expect(source).not.toContain("getJobStatusTone");
		expect(source).not.toContain("jobStatusLabels");
		expect(columnFactories).toContain("getJobDisplayStatus");
		expect(columnFactories).toContain("paymentStatus: row.paymentStatus");
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
		// 내비 정의는 layout.tsx 인라인 배열에서 lib/bambi/moderator-navigation로 이동했다.
		const entries = MODERATOR_NAV_ITEMS.flatMap((entry) =>
			"items" in entry ? entry.items : [entry]
		);

		expect(entries).toContainEqual({
			href: "/moderator/payments",
			label: "결제 관리",
		});
		// 레이아웃이 그 정의를 실제로 소비해야 항목이 화면에 닿는다.
		expect(readSource("../layout.tsx")).toContain("MODERATOR_NAV_ITEMS");
	});
});
