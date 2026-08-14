import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { srcPath } from "../../../src-path";

const moderatorSource = readFileSync(
	srcPath("components/bambi/screens/moderator.tsx"),
	"utf8"
);
const contextSource = readFileSync(
	srcPath("components/bambi/screens/moderator-context.tsx"),
	"utf8"
);
const detailPageSource = readFileSync(
	srcPath("app/moderator/reports/[id]/page.tsx"),
	"utf8"
);

describe("신고 처리 사유 입력", () => {
	it("공통 사유 입력을 500자로 제한하고 글자 수를 표시한다", () => {
		expect(moderatorSource).toContain("maxLength={reasonMaxLength}");
		expect(moderatorSource).toContain("{reason.length} / {reasonMaxLength}");
	});

	it("신고 상태 반영 실패를 안내하고 성공 여부를 반환한다", () => {
		expect(contextSource).toContain("setReportStatusMutation.mutateAsync");
		expect(contextSource).toContain(
			"사유가 500자를 넘어 신고 상태를 API에 반영하지 못했어요. 사유는 500자 이내로 입력해 주세요."
		);
		expect(contextSource).toContain("return false;");
		expect(contextSource).toContain("return true;");
	});

	it("신고 상태 반영 성공 후에만 목록으로 이동한다", () => {
		expect(detailPageSource).toContain(
			"const succeeded = await resolveReport(rid, action, reason);"
		);
		expect(detailPageSource).toContain("if (succeeded) {");
		expect(detailPageSource).toContain('router.push("/moderator/reports");');
	});

	it("커뮤니티 대상 조치 성공 후 신고를 자동 완료한다", () => {
		expect(moderatorSource).toContain("{report.note}");
		expect(moderatorSource).toContain("reason.trim().length >= 2");
		expect(moderatorSource).toContain("item.communityKind ? null");
		expect(contextSource).toContain(
			'const resolved = await resolveReport(report.id, "act", reason);'
		);
		expect(detailPageSource).toContain(
			"const succeeded = await moderateCommunityTarget("
		);
	});
});
