import { describe, expect, it } from "vitest";

import { directMessageBodyToText } from "./me-messages";

describe("directMessageBodyToText", () => {
	it("문단은 줄바꿈으로, 문단 안 인라인 런은 공백 없이 잇는다", () => {
		const body = JSON.stringify({
			type: "doc",
			content: [
				{
					type: "paragraph",
					content: [
						{ type: "text", text: "안녕하세요 " },
						{ type: "text", marks: [{ type: "bold" }], text: "운영자" },
						{ type: "text", text: "입니다." },
					],
				},
				{
					type: "paragraph",
					content: [{ type: "text", text: "확인 부탁드려요." }],
				},
			],
		});

		expect(directMessageBodyToText(body)).toBe(
			"안녕하세요 운영자입니다.\n확인 부탁드려요."
		);
	});

	it("리스트 항목은 항목마다 한 줄로 편다", () => {
		const body = JSON.stringify({
			type: "doc",
			content: [
				{
					type: "paragraph",
					content: [{ type: "text", text: "공지드립니다." }],
				},
				{
					type: "bulletList",
					content: ["첫째 항목", "둘째 항목", "셋째 항목"].map((text) => ({
						type: "listItem",
						content: [{ type: "paragraph", content: [{ type: "text", text }] }],
					})),
				},
			],
		});

		expect(directMessageBodyToText(body)).toBe(
			"공지드립니다.\n첫째 항목\n둘째 항목\n셋째 항목"
		);
	});

	it("문단 안 hardBreak(Shift+Enter)는 줄바꿈으로 편다", () => {
		const body = JSON.stringify({
			type: "doc",
			content: [
				{
					type: "paragraph",
					content: [
						{ type: "text", text: "010-1234-5678" },
						{ type: "hardBreak" },
						{ type: "text", text: "문의 주세요" },
					],
				},
			],
		});

		expect(directMessageBodyToText(body)).toBe("010-1234-5678\n문의 주세요");
	});

	it("이미지만 있는 본문도 빈칸이 아니라 자리표시를 남긴다", () => {
		const onlyImage = JSON.stringify({
			type: "doc",
			content: [{ type: "image", attrs: { src: "https://x/a.png" } }],
		});

		expect(directMessageBodyToText(onlyImage)).toBe("[이미지]");

		const withAlt = JSON.stringify({
			type: "doc",
			content: [
				{
					type: "image",
					attrs: { alt: "이벤트 안내", src: "https://x/a.png" },
				},
			],
		});

		expect(directMessageBodyToText(withAlt)).toBe("[이미지] 이벤트 안내");
	});

	it("JSON이 아닌 옛 평문 본문은 원문 그대로 돌려준다", () => {
		expect(directMessageBodyToText("그냥 평문 쪽지입니다.")).toBe(
			"그냥 평문 쪽지입니다."
		);
	});

	it("파싱은 되지만 doc 문서가 아니면 원문 그대로 돌려준다", () => {
		expect(directMessageBodyToText('{"a":1}')).toBe('{"a":1}');
	});
});
