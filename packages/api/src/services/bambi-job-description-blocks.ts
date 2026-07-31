export const jobDescriptionBlockTypes = [
	"paragraph",
	"heading",
	"bullet_list",
	"callout",
] as const;

export type JobDescriptionBlockType = (typeof jobDescriptionBlockTypes)[number];

export interface JobDescriptionBlock {
	id: string;
	text: string;
	type: JobDescriptionBlockType;
}

export const MAX_JOB_DESCRIPTION_BLOCKS = 12;
export const MAX_JOB_DESCRIPTION_BLOCK_TEXT_LENGTH = 800;

export type JobDescriptionBlockValidationCode =
	| "block_text_too_long"
	| "empty_block_text"
	| "too_many_blocks"
	| "unsupported_block_type";

export interface JobDescriptionBlockValidationIssue {
	blockId?: string;
	code: JobDescriptionBlockValidationCode;
	maxBlocks?: number;
	maxLength?: number;
}

export interface JobDescriptionBlockValidationResult {
	blocks: JobDescriptionBlock[];
	issues: JobDescriptionBlockValidationIssue[];
	ok: boolean;
	plainText: string;
}

const isSupportedBlockType = (
	type: JobDescriptionBlock["type"]
): type is JobDescriptionBlockType =>
	jobDescriptionBlockTypes.includes(type as JobDescriptionBlockType);

export const normalizeJobDescriptionBlocks = (
	blocks: JobDescriptionBlock[]
): JobDescriptionBlock[] =>
	blocks
		.map((block) => ({
			id: block.id.trim(),
			text: block.text.trim(),
			type: block.type,
		}))
		.filter((block) => block.id.length > 0 && block.text.length > 0);

export const toPlainJobDescription = (blocks: JobDescriptionBlock[]): string =>
	normalizeJobDescriptionBlocks(blocks)
		.map((block) => block.text)
		.join("\n\n");

export const validateJobDescriptionBlocks = (
	blocks: JobDescriptionBlock[]
): JobDescriptionBlockValidationResult => {
	const issues: JobDescriptionBlockValidationIssue[] = [];

	if (blocks.length > MAX_JOB_DESCRIPTION_BLOCKS) {
		issues.push({
			code: "too_many_blocks",
			maxBlocks: MAX_JOB_DESCRIPTION_BLOCKS,
		});
	}

	for (const block of blocks) {
		const blockId = block.id.trim() || undefined;
		const text = block.text.trim();

		if (!isSupportedBlockType(block.type)) {
			issues.push({ blockId, code: "unsupported_block_type" });
		}

		if (text.length === 0) {
			issues.push({ blockId, code: "empty_block_text" });
		}

		if (text.length > MAX_JOB_DESCRIPTION_BLOCK_TEXT_LENGTH) {
			issues.push({
				blockId,
				code: "block_text_too_long",
				maxLength: MAX_JOB_DESCRIPTION_BLOCK_TEXT_LENGTH,
			});
		}
	}

	const normalizedBlocks = normalizeJobDescriptionBlocks(blocks);

	return {
		blocks: normalizedBlocks,
		issues,
		ok: issues.length === 0,
		plainText: toPlainJobDescription(normalizedBlocks),
	};
};
