import { describe, expect, it } from "vitest";

import { extractTiptapText } from "./bambi-tiptap-text";

describe("extractTiptapText", () => {
	it("문단의 text 노드를 이어 붙인다", () => {
		const doc = JSON.stringify({
			type: "doc",
			content: [
				{
					type: "paragraph",
					content: [{ type: "text", text: "안녕하세요" }],
				},
			],
		});
		expect(extractTiptapText(doc)).toBe("안녕하세요");
	});

	it("중첩된 노드의 텍스트도 모두 모은다", () => {
		const doc = JSON.stringify({
			type: "doc",
			content: [
				{
					type: "bulletList",
					content: [
						{
							type: "listItem",
							content: [
								{
									type: "paragraph",
									content: [{ type: "text", text: "첫째" }],
								},
							],
						},
					],
				},
				{
					type: "paragraph",
					content: [{ type: "text", text: "둘째" }],
				},
			],
		});
		expect(extractTiptapText(doc)).toContain("첫째");
		expect(extractTiptapText(doc)).toContain("둘째");
	});

	it("노드 사이에 공백을 넣어 단어가 붙지 않게 한다", () => {
		const doc = JSON.stringify({
			type: "doc",
			content: [
				{ type: "paragraph", content: [{ type: "text", text: "완성" }] },
				{ type: "paragraph", content: [{ type: "text", text: "매매" }] },
			],
		});
		expect(extractTiptapText(doc)).toBe("완성 매매");
	});

	it("JSON이 아니면 원문을 그대로 돌려준다", () => {
		expect(extractTiptapText("그냥 평문")).toBe("그냥 평문");
	});

	it("빈 문서를 안전하게 처리한다", () => {
		expect(
			extractTiptapText(JSON.stringify({ type: "doc", content: [] }))
		).toBe("");
	});
});
