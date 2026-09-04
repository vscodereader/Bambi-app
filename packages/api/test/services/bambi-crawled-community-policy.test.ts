import { describe, expect, it } from "vitest";
import {
	crawledTextToDocument,
	sourceCommentId,
} from "@/services/bambi-crawled-community-policy";
import { extractTiptapText } from "@/services/bambi-tiptap-text";

describe("수집 원문을 기존 편집기로 전달", () => {
	it("HTML처럼 보이는 문자열과 한글·따옴표·빈 줄을 텍스트로 보존한다", () => {
		const source = '첫 문단 "한글"\n\n<script>alert("x")</script>';
		const document = crawledTextToDocument(source);
		expect(extractTiptapText(document)).toBe(source);
		expect(JSON.parse(document).content[2]).toEqual({
			type: "paragraph",
			content: [{ type: "text", text: '<script>alert("x")</script>' }],
		});
	});
	it("댓글 본문을 수정해도 legacy 식별자는 유지하고 게시판별 topic ID는 구분한다", () => {
		const original = { body: "원본", authorName: null, sourcePostedAt: null };
		expect(sourceCommentId("a", original, 0)).toBe(
			sourceCommentId("a", { ...original, body: "수정" }, 0)
		);
		expect(sourceCommentId("a", original, 0)).not.toBe(
			sourceCommentId("b", original, 0)
		);
		expect(sourceCommentId("a", { ...original, id: "source:123" }, 0)).toBe(
			"source:123"
		);
	});
});
