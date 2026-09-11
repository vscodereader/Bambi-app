import { describe, expect, it } from "vitest";
import {
	documentImages,
	editBlockText,
	moveBlock,
	nodeText,
	readDocument,
	removeBlock,
	replaceNode,
} from "../../../src/lib/support/content-document";

describe("native document editing", () => {
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
	it("drops emptied list wrappers and retains unknown siblings", () => {
		const document = readDocument(
			JSON.stringify({
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
										content: [{ type: "text", text: "목록" }],
									},
								],
							},
						],
					},
					{ type: "unknown", attrs: { keep: true } },
				],
			})
		);
		expect(removeBlock(document, [0, 0, 0]).content).toEqual([
			{ type: "unknown", attrs: { keep: true } },
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
		const updated = replaceNode(document, [1, 0, 0], (node) =>
			editBlockText(node, "안녕하세요")
		);
		expect(updated.content?.[0]).toEqual(document.content?.[0]);
		expect(updated.attrs).toEqual({ custom: true });
		expect(updated.content?.[1]?.content?.[0]?.content?.[0]?.content).toEqual([
			{
				type: "text",
				text: "안녕하세요",
				marks: [{ type: "custom", attrs: { value: 1 } }],
			},
		]);
		expect(
			document.content?.[1]?.content?.[0]?.content?.[0]?.content?.[0]?.text
		).toBe("안녕");
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
	it("keeps the paragraph and image order after editing and moving blocks", () => {
		const document = readDocument(
			JSON.stringify({
				type: "doc",
				content: [
					{ type: "paragraph", content: [{ type: "text", text: "첫" }] },
					{ type: "image", attrs: { alt: "", src: "https://cdn/a.png" } },
					{ type: "paragraph", content: [{ type: "text", text: "둘" }] },
				],
			})
		);
		const moved = moveBlock(
			replaceNode(document, [0], (node) => editBlockText(node, "첫번째")),
			[2],
			-1
		);
		expect(moved.content?.map((node) => node.type)).toEqual([
			"paragraph",
			"paragraph",
			"image",
		]);
		expect(moved.content?.map(nodeText)).toEqual(["첫번째", "둘", ""]);
		expect(documentImages(moved)).toHaveLength(1);
	});
});
