import { describe, expect, it } from "vitest";
import {
	editableBlocks,
	editBlockText,
	markRange,
	readDocument,
	removeBlock,
	replaceNode,
	toggleMarkRange,
	wrapBlock,
} from "../../../src/lib/support/content-document";

describe("native document editing", () => {
	it("toggles a selected style off without changing the surrounding text", () => {
		const node = {
			type: "paragraph",
			content: [{ type: "text", text: "앞 선택 뒤" }],
		};
		const marked = toggleMarkRange(node, 2, 4, { type: "bold" });
		expect(toggleMarkRange(marked, 2, 4, { type: "bold" })).toEqual(node);
	});
	it("creates web-compatible hard breaks while code blocks keep literal newlines", () => {
		const paragraph = {
			type: "paragraph",
			content: [{ type: "text", text: "첫줄" }],
		};
		expect(editBlockText(paragraph, "첫줄\n둘째줄").content).toEqual([
			{ type: "text", text: "첫줄" },
			{ type: "hardBreak" },
			{ type: "text", text: "둘째줄" },
		]);
		expect(
			editBlockText({ ...paragraph, type: "codeBlock" }, "첫줄\n둘째줄").content
		).toEqual([{ type: "text", text: "첫줄\n둘째줄" }]);
	});
	it("toggles lists without nested duplicate wrappers and retains unknown siblings", () => {
		const document = readDocument(
			'{"type":"doc","content":[{"type":"paragraph","content":[{"type":"text","text":"목록"}]},{"type":"unknown","attrs":{"keep":true}}]}'
		);
		const listed = wrapBlock(document, [0], "bulletList");
		expect(wrapBlock(listed, [0, 0, 0], "bulletList")).toEqual(document);
		expect(removeBlock(listed, [0, 0, 0]).content).toEqual([
			{ type: "unknown", attrs: { keep: true } },
		]);
	});
	it("keeps other textStyle properties when applying font size", () => {
		const node = {
			type: "paragraph",
			content: [
				{
					type: "text",
					text: "보존",
					marks: [
						{ type: "textStyle", attrs: { color: "red", fontSize: "12px" } },
					],
				},
			],
		};
		expect(
			markRange(node, 0, 2, { type: "textStyle", attrs: { fontSize: "24px" } })
				.content?.[0]?.marks
		).toEqual([
			{ type: "textStyle", attrs: { color: "red", fontSize: "24px" } },
		]);
	});
	it("preserves unknown nodes, attributes and nested lists during an edit", () => {
		const document = readDocument(
			JSON.stringify({
				type: "doc",
				attrs: { custom: true },
				content: [
					{ type: "extension", attrs: { source: "original" } },
					{
						type: "bulletList",
						content: [
							{
								type: "listItem",
								content: [
									{
										type: "paragraph",
										content: [
											{
												type: "text",
												text: "안녕",
												marks: [{ type: "custom", attrs: { value: 1 } }],
											},
										],
									},
								],
							},
						],
					},
				],
			})
		);
		const block = editableBlocks(document)[0];
		expect(block).toBeDefined();
		if (!block) {
			return;
		}
		const updated = replaceNode(document, block.path, (node) =>
			editBlockText(node, "안녕하세요")
		);
		expect(updated.content?.[0]).toEqual(document.content?.[0]);
		expect(updated.attrs).toEqual({ custom: true });
		expect(editableBlocks(updated)[0]?.node.content?.[0]).toEqual({
			type: "text",
			text: "안녕하세요",
			marks: [{ type: "custom", attrs: { value: 1 } }],
		});
		expect(editableBlocks(document)[0]?.node.content?.[0]?.text).toBe("안녕");
	});
	it("formats only selected Korean and emoji UTF-16 offsets", () => {
		const node = {
			type: "paragraph",
			content: [{ type: "text", text: "앞🙂뒤" }],
		};
		expect(markRange(node, 1, 3, { type: "bold" }).content).toEqual([
			{ type: "text", text: "앞" },
			{ type: "text", text: "🙂", marks: [{ type: "bold" }] },
			{ type: "text", text: "뒤" },
		]);
	});
	it("retains unrelated marks when removing a selection mark", () => {
		const node = {
			type: "paragraph",
			content: [{ type: "text", text: "abcd", marks: [{ type: "italic" }] }],
		};
		expect(
			markRange(
				markRange(node, 1, 3, { type: "bold" }),
				1,
				3,
				{ type: "bold" },
				true
			)
		).toEqual(node);
	});
	it("deletes across runs without removing suffix marks", () => {
		const node = {
			type: "paragraph",
			content: [
				{ type: "text", text: "abc", marks: [{ type: "bold" }] },
				{ type: "text", text: "def", marks: [{ type: "italic" }] },
			],
		};
		expect(editBlockText(node, "af").content).toEqual([
			{ type: "text", text: "a", marks: [{ type: "bold" }] },
			{ type: "text", text: "f", marks: [{ type: "italic" }] },
		]);
	});
});
