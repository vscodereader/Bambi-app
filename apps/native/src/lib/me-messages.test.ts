import { describe, expect, it } from "vitest";

import {
	directMessageBodyToText,
	isSafeLinkHref,
	parseDirectMessageBody,
} from "./me-messages";

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

	it("본문이 빈 doc은 빈 문자열이다(원문 JSON을 그리지 않는다)", () => {
		expect(directMessageBodyToText('{"type":"doc"}')).toBe("");
	});
});

describe("isSafeLinkHref", () => {
	it("http·https·mailto·tel만 통과시킨다", () => {
		for (const href of [
			"https://bambi.kr/notice",
			"HTTP://bambi.kr",
			"mailto:help@bambi.kr",
			"tel:010-1234-5678",
		]) {
			expect(isSafeLinkHref(href)).toBe(true);
		}
	});

	it("실행 스킴·딥링크·상대 경로는 막는다", () => {
		for (const href of [
			"javascript:alert(1)",
			"intent://scan/#Intent;scheme=zxing;end",
			"file:///etc/passwd",
			// 앞 공백·제어문자로 스킴을 위장한 주소(node URL은 공백을 버리고 파싱한다).
			" javascript:alert(1)",
			"java\nscript:alert(1)",
			"/relative/path",
			"//bambi.kr",
			"",
		]) {
			expect(isSafeLinkHref(href)).toBe(false);
		}
	});
});

describe("parseDirectMessageBody", () => {
	it("마크는 인라인 플래그로, 안전하지 않은 링크는 텍스트만 남긴다", () => {
		const body = JSON.stringify({
			type: "doc",
			content: [
				{
					type: "paragraph",
					content: [
						{ type: "text", text: "안녕하세요 " },
						{ type: "text", marks: [{ type: "bold" }], text: "운영자" },
						{ type: "text", marks: [{ type: "italic" }], text: "입니다" },
						{ type: "hardBreak" },
						{
							type: "text",
							marks: [
								{ type: "link", attrs: { href: "https://bambi.kr/notice" } },
							],
							text: "공지 보기",
						},
						{
							type: "text",
							marks: [{ type: "link", attrs: { href: "javascript:alert(1)" } }],
							text: "수상한 링크",
						},
					],
				},
			],
		});

		expect(parseDirectMessageBody(body)).toEqual([
			{
				type: "paragraph",
				inlines: [
					{ text: "안녕하세요 " },
					{ bold: true, text: "운영자" },
					{ italic: true, text: "입니다" },
					{ text: "\n" },
					{ href: "https://bambi.kr/notice", text: "공지 보기" },
					{ text: "수상한 링크" },
				],
			},
		]);
	});

	it("리스트는 마커를 붙여 평탄화한다(불릿 · 번호)", () => {
		const listItem = (text: string) => ({
			type: "listItem",
			content: [{ type: "paragraph", content: [{ type: "text", text }] }],
		});
		const body = JSON.stringify({
			type: "doc",
			content: [
				{ type: "bulletList", content: [listItem("첫째")] },
				{
					type: "orderedList",
					content: [listItem("하나"), listItem("둘")],
				},
			],
		});

		expect(parseDirectMessageBody(body)).toEqual([
			{ type: "listItem", marker: "•", inlines: [{ text: "첫째" }] },
			{ type: "listItem", marker: "1.", inlines: [{ text: "하나" }] },
			{ type: "listItem", marker: "2.", inlines: [{ text: "둘" }] },
		]);
	});

	it("모르는 컨테이너는 자식 인라인을 모은 문단으로 폴백한다", () => {
		const body = JSON.stringify({
			type: "doc",
			content: [
				{
					type: "heading",
					attrs: { level: 2 },
					content: [{ type: "text", text: "제목입니다" }],
				},
				{
					type: "callout",
					content: [
						{ type: "paragraph", content: [{ type: "text", text: "안내" }] },
					],
				},
			],
		});

		expect(parseDirectMessageBody(body)).toEqual([
			{ type: "heading", level: 2, inlines: [{ text: "제목입니다" }] },
			{ type: "paragraph", inlines: [{ text: "안내" }] },
		]);
	});

	it("내용 없는 리프와 src 없는 이미지는 건너뛴다", () => {
		const body = JSON.stringify({
			type: "doc",
			content: [
				{ type: "horizontalRule" },
				{ type: "paragraph" },
				{ type: "image", attrs: { alt: "src 없음" } },
				{ type: "image", attrs: { src: "https://x/a.png" } },
				{ type: "image", attrs: { alt: "이벤트", src: "https://x/b.png" } },
			],
		});

		expect(parseDirectMessageBody(body)).toEqual([
			{ type: "image", alt: "", src: "https://x/a.png" },
			{ type: "image", alt: "이벤트", src: "https://x/b.png" },
		]);
	});

	it("content 없는 리스트 노드도 무한 재귀 없이 건너뛴다", () => {
		// 서버는 본문을 z.string()으로만 받아 doc 스키마를 검증하지 않는다 — API로 들어온
		// 이런 JSON 한 건이 접힘 미리보기까지 태워 쪽지함 전체를 스택 오버플로로 날렸다.
		for (const type of ["bulletList", "orderedList"]) {
			const body = JSON.stringify({ type: "doc", content: [{ type }] });

			expect(parseDirectMessageBody(body)).toEqual([]);
			expect(directMessageBodyToText(body)).toBe("");
		}

		expect(
			parseDirectMessageBody(
				'{"type":"doc","content":[{"type":"bulletList","content":"x"}]}'
			)
		).toEqual([]);
	});

	it("JSON이 아니거나 doc 문서가 아니면 null(호출부가 평문으로 폴백)", () => {
		expect(parseDirectMessageBody("그냥 평문 쪽지입니다.")).toBeNull();
		expect(parseDirectMessageBody('{"a":1}')).toBeNull();
	});
});
