import fs from "node:fs";
import { describe, expect, it } from "vitest";
import { srcPath } from "../../src-path";

const source = fs.readFileSync(
	srcPath("components/bambi/community-post-navigation.tsx"),
	"utf8"
);

describe("게시글 상세 하단 탐색", () => {
	it("목록·수다방 버튼과 이전글·다음글 행을 제공한다", () => {
		expect(source).toContain(">목록</Link>");
		expect(source).toContain(">수다방</Link>");
		expect(source).toContain('label="이전글"');
		expect(source).toContain('label="다음글"');
		expect(source).toContain("COMMUNITY_ROOT_PATH");
	});

	it("회원·공개·수집 경로의 기존 경로 생성기를 재사용한다", () => {
		expect(source).toContain("communityPostPath");
		expect(source).toContain("communityCrawledPath");
		expect(source).toContain("publicPostPath");
		expect(source).toContain("publicBoardPath");
	});

	it("없는 이전글·다음글 행과 이웃이 전혀 없는 박스를 숨긴다", () => {
		expect(source).toContain("if (!item)");
		expect(source).toContain(
			"hidden={!(navigationQuery.isPending || hasNeighbor)}"
		);
		expect(source).not.toContain("이 없습니다.");
	});

	it("현재 글이 이웃으로 잘못 반환되면 화면에서 제거한다", () => {
		expect(source.match(/\.id === currentId/g)).toHaveLength(2);
	});
});
