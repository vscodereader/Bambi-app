import fs from "node:fs";
import { describe, expect, it } from "vitest";
import { srcPath } from "../../src-path";

const source = fs.readFileSync(
	srcPath("components/bambi/community-board-preview.tsx"),
	"utf8"
);
const homeSource = fs.readFileSync(
	srcPath("components/bambi/home-community-section.tsx"),
	"utf8"
);
const communityHomeSource = fs.readFileSync(
	srcPath("components/bambi/screens/community-home.tsx"),
	"utf8"
);
const moderatorSource = fs.readFileSync(
	srcPath("app/moderator/community-boards/page.tsx"),
	"utf8"
);

describe("수다방 홈 카드 외곽선", () => {
	it("양끝 border를 자르지 않고 공용 최소 여백을 둔다", () => {
		expect(source).toContain("max-w-full flex-col gap-4 px-px");
		expect(source).not.toContain("max-w-full flex-col gap-4 overflow-x-clip");
	});

	it("메인과 수다방이 서로 다른 배치 표면을 요청한다", () => {
		expect(homeSource).toContain('input: { surface: "main" }');
		expect(communityHomeSource).toContain('input: { surface: "community" }');
	});

	it("운영자 배치는 기본 접힘 Accordion 두 개와 공용 편집기를 쓴다", () => {
		expect(moderatorSource).toContain("메인페이지 행 배치");
		expect(moderatorSource).toContain("수다방 행 배치");
		expect(moderatorSource).toContain('<AccordionItem value="main-layout">');
		expect(moderatorSource).toContain(
			'<AccordionItem value="community-layout">'
		);
		expect(moderatorSource.match(/<BoardLayoutEditor/g)).toHaveLength(2);
		expect(moderatorSource).not.toContain("FIXED_HOME_BOARD_KEYS");
		expect(moderatorSource).not.toContain(">고정<");
	});
});
