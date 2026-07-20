import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const readSource = (relativePath: string) =>
	fs.readFileSync(path.join(import.meta.dirname, relativePath), "utf8");

describe("moderator payment management UI", () => {
	it("wires the payment panel to the setJobPostPayment mutation with badges and toggle buttons", () => {
		const source = readSource(
			"../../../components/bambi/moderator-payment-panel.tsx"
		);

		// setJobPostPayment 뮤테이션과 검수 큐 쿼리 무효화로 결제 상태를 전환한다
		expect(source).toContain(
			"orpc.bambi.moderation.setJobPostPayment.mutationOptions()"
		);
		expect(source).toContain("orpc.bambi.moderation.listJobPosts.queryKey");
		expect(source).toContain("setPaymentMutation.mutate");
		expect(source).toContain("paymentStatus: nextStatus");

		// 결제 상태·노출 상품·만료 배지를 shadcn StatusBadge로 표기한다
		expect(source).toContain("StatusBadge");
		expect(source).toContain("PAYMENT_STATUS_LABELS[post.paymentStatus]");
		expect(source).toContain("EXPOSURE_TYPE_LABELS[post.exposureType]");

		// 결제완료 처리 / 미결제로 되돌리기 토글 버튼 텍스트
		expect(source).toContain("결제완료 처리");
		expect(source).toContain("미결제로 되돌리기");

		// 성공 시 토스트 알림
		expect(source).toContain('from "sonner"');
		expect(source).toContain("결제완료로 처리했어요");
		expect(source).toContain("미결제로 되돌렸어요");
	});

	it("mounts the payment panel on the moderator queue detail page while keeping review actions", () => {
		const source = readSource("[id]/page.tsx");

		// 결제 관리 패널을 검수 상세에 마운트하되 승인/반려(QueueDetail)는 유지한다
		expect(source).toContain("ModeratorPaymentPanel");
		expect(source).toContain("jobPostId={item.id}");
		expect(source).toContain("QueueDetail");
		expect(source).toContain("onResolve");
	});
});
