import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { JobDescriptionContent } from "@/components/bambi/job-description-content";

const renderContent = ({
	description = "기본 상세설명\n둘째 줄",
	descriptionBlocks = [
		{ id: "paragraph", text: "문단 내용", type: "paragraph" as const },
		{ id: "heading", text: "제목 내용", type: "heading" as const },
		{ id: "list", text: "첫 항목\n\n둘째 항목", type: "bullet_list" as const },
		{ id: "callout", text: "강조 내용", type: "callout" as const },
	],
} = {}) =>
	renderToStaticMarkup(
		createElement(JobDescriptionContent, {
			description,
			descriptionBlocks,
		})
	);

describe("JobDescriptionContent", () => {
	it("기본 상세설명 뒤에 블록을 작성 순서대로 렌더링한다", () => {
		const html = renderContent();
		const labels = [
			"기본 상세설명",
			"문단 내용",
			"제목 내용",
			"첫 항목",
			"둘째 항목",
			"강조 내용",
		];

		for (const [index, label] of labels.entries()) {
			expect(html).toContain(label);
			if (index > 0) {
				expect(html.indexOf(labels[index - 1] ?? "")).toBeLessThan(
					html.indexOf(label)
				);
			}
		}
		expect(html).toContain("<h3");
		expect(html).toContain("<ul");
		expect(html).toContain("border-coral-200");
		expect(html).toContain("whitespace-pre-line");
	});

	it("구버전 블록 합성 description을 중복 렌더링하지 않는다", () => {
		const html = renderContent({
			description: "제목 내용\n\n문단 내용",
			descriptionBlocks: [
				{ id: "heading", text: "제목 내용", type: "heading" },
				{ id: "paragraph", text: "문단 내용", type: "paragraph" },
			],
		});

		expect(html.match(/제목 내용/g)).toHaveLength(1);
		expect(html.match(/문단 내용/g)).toHaveLength(1);
	});

	it("블록이 없으면 기본 상세설명만 렌더링한다", () => {
		const html = renderContent({
			description: "평문 상세설명\n둘째 줄",
			descriptionBlocks: [],
		});

		expect(html).toContain("평문 상세설명\n둘째 줄");
		expect(html).not.toContain("<h3");
		expect(html).not.toContain("<ul");
	});
});
