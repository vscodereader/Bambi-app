import { describe, expect, it } from "vitest";

import {
	type JobDescriptionBlock,
	MAX_JOB_DESCRIPTION_BLOCK_TEXT_LENGTH,
	MAX_JOB_DESCRIPTION_BLOCKS,
	normalizeJobDescriptionBlocks,
	resolveJobDescriptionContent,
	toFullJobDescription,
	toPlainJobDescription,
	validateJobDescriptionBlocks,
} from "@/services/bambi-job-description-blocks";

const createBlock = (
	overrides: Partial<JobDescriptionBlock> = {}
): JobDescriptionBlock => ({
	id: "block-1",
	text: "업무 내용을 소개합니다.",
	type: "paragraph",
	...overrides,
});

describe("bambi job description blocks", () => {
	it("accepts paragraph, heading, bullet list, and callout blocks", () => {
		const blocks: JobDescriptionBlock[] = [
			createBlock({ id: "heading", text: " 주요 업무 ", type: "heading" }),
			createBlock({ id: "paragraph", text: " 고객 응대 ", type: "paragraph" }),
			createBlock({ id: "bullets", text: " 예약 관리 ", type: "bullet_list" }),
			createBlock({ id: "callout", text: " 야간 근무 없음 ", type: "callout" }),
		];

		expect(validateJobDescriptionBlocks(blocks)).toEqual({
			blocks: [
				createBlock({ id: "heading", text: "주요 업무", type: "heading" }),
				createBlock({ id: "paragraph", text: "고객 응대", type: "paragraph" }),
				createBlock({ id: "bullets", text: "예약 관리", type: "bullet_list" }),
				createBlock({ id: "callout", text: "야간 근무 없음", type: "callout" }),
			],
			issues: [],
			ok: true,
			plainText: "주요 업무\n\n고객 응대\n\n예약 관리\n\n야간 근무 없음",
		});
	});

	it("rejects more than 12 blocks per job post", () => {
		const blocks = Array.from(
			{ length: MAX_JOB_DESCRIPTION_BLOCKS + 1 },
			(_, index) => createBlock({ id: `block-${index}`, text: `내용 ${index}` })
		);

		expect(validateJobDescriptionBlocks(blocks)).toMatchObject({
			issues: [
				{ code: "too_many_blocks", maxBlocks: MAX_JOB_DESCRIPTION_BLOCKS },
			],
			ok: false,
		});
	});

	it("rejects empty block text after trimming", () => {
		expect(
			validateJobDescriptionBlocks([
				createBlock({ id: "empty", text: "   ", type: "paragraph" }),
			])
		).toMatchObject({
			issues: [{ blockId: "empty", code: "empty_block_text" }],
			ok: false,
		});
	});

	it("rejects block text over 800 characters", () => {
		expect(
			validateJobDescriptionBlocks([
				createBlock({
					id: "long",
					text: "가".repeat(MAX_JOB_DESCRIPTION_BLOCK_TEXT_LENGTH + 1),
				}),
			])
		).toMatchObject({
			issues: [
				{
					blockId: "long",
					code: "block_text_too_long",
					maxLength: MAX_JOB_DESCRIPTION_BLOCK_TEXT_LENGTH,
				},
			],
			ok: false,
		});
	});

	it("rejects unsupported block types", () => {
		expect(
			validateJobDescriptionBlocks([
				createBlock({
					id: "html",
					type: "html" as JobDescriptionBlock["type"],
				}),
			])
		).toMatchObject({
			issues: [{ blockId: "html", code: "unsupported_block_type" }],
			ok: false,
		});
	});

	it("normalizes blocks and composes a plain text fallback", () => {
		const blocks = [
			createBlock({ id: " first ", text: " 첫 문단 " }),
			createBlock({ id: "second", text: "둘째 문단" }),
			createBlock({ id: "", text: "id 없는 블록" }),
		];

		expect(normalizeJobDescriptionBlocks(blocks)).toEqual([
			createBlock({ id: "first", text: "첫 문단" }),
			createBlock({ id: "second", text: "둘째 문단" }),
		]);
		expect(toPlainJobDescription(blocks)).toBe("첫 문단\n\n둘째 문단");
	});

	it("keeps a distinct base description before structured blocks", () => {
		const blocks = [
			createBlock({ id: "heading", text: "주요 업무", type: "heading" }),
			createBlock({ id: "paragraph", text: "고객 응대" }),
		];

		expect(
			resolveJobDescriptionContent({
				description: " 기본 상세설명 ",
				descriptionBlocks: blocks,
			})
		).toEqual({
			blocks,
			description: "기본 상세설명",
			showDescription: true,
		});
		expect(
			toFullJobDescription({
				description: "기본 상세설명",
				descriptionBlocks: blocks,
			})
		).toBe("기본 상세설명\n\n주요 업무\n\n고객 응대");
	});

	it("does not duplicate legacy descriptions composed from blocks", () => {
		const blocks = [
			createBlock({ id: "heading", text: "주요 업무", type: "heading" }),
			createBlock({ id: "paragraph", text: "고객 응대" }),
		];
		const legacyDescription = "주요 업무\n\n고객 응대";

		expect(
			resolveJobDescriptionContent({
				description: ` ${legacyDescription} `,
				descriptionBlocks: blocks,
			})
		).toMatchObject({ showDescription: false });
		expect(
			toFullJobDescription({
				description: legacyDescription,
				descriptionBlocks: blocks,
			})
		).toBe(legacyDescription);
	});

	it("uses the base description when there are no blocks", () => {
		expect(
			toFullJobDescription({
				description: " 줄바꿈이 있는\n기본 설명 ",
				descriptionBlocks: [],
			})
		).toBe("줄바꿈이 있는\n기본 설명");
	});
});
