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

export interface ResolvedJobDescriptionContent {
	blocks: JobDescriptionBlock[];
	description: string;
	showDescription: boolean;
}

// 구버전 공고는 블록이 있으면 description을 블록 평문으로 덮어썼다. 그 값을 새 형식의
// 기본 상세설명으로 다시 그리면 같은 내용이 두 번 보이므로 저장된 두 축의 관계로 구분한다.
// 날짜나 마이그레이션 번호에 의존하지 않아 어느 환경의 과거 행에도 같은 판정이 적용된다.
export const resolveJobDescriptionContent = ({
	description,
	descriptionBlocks,
}: {
	description: string;
	descriptionBlocks: JobDescriptionBlock[];
}): ResolvedJobDescriptionContent => {
	const normalizedDescription = description.trim();
	const blocks = normalizeJobDescriptionBlocks(descriptionBlocks);
	const blockPlainText = toPlainJobDescription(blocks);
	const isLegacyBlockDescription =
		blocks.length > 0 && normalizedDescription === blockPlainText;

	return {
		blocks,
		description: normalizedDescription,
		showDescription:
			normalizedDescription.length > 0 && !isLegacyBlockDescription,
	};
};

// 검색·검수처럼 서식 없는 전체 본문이 필요한 경로에서 쓴다. 새 공고는 기본 설명과 블록을
// 모두 포함하고, 구버전 공고는 resolveJobDescriptionContent가 중복 평문을 한 번만 남긴다.
export const toFullJobDescription = (input: {
	description: string;
	descriptionBlocks: JobDescriptionBlock[];
}): string => {
	const resolved = resolveJobDescriptionContent(input);
	const parts = [
		resolved.showDescription ? resolved.description : "",
		toPlainJobDescription(resolved.blocks),
	].filter((part) => part.length > 0);

	return parts.join("\n\n");
};

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
