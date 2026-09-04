import { generateChatMessageId } from "@bambi-app/api/services/bambi-chat-message-id";
import {
	type JobDescriptionBlock,
	type JobDescriptionBlockType,
	MAX_JOB_DESCRIPTION_BLOCKS,
	validateJobDescriptionBlocks,
} from "@bambi-app/api/services/bambi-job-description-blocks";

// enum 원값 노출 금지 — 편집기 타입 선택 라벨.
export const jobDescriptionBlockTypeLabels: Record<
	JobDescriptionBlockType,
	string
> = {
	bullet_list: "목록",
	callout: "강조",
	heading: "소제목",
	paragraph: "문단",
};

// 블록 id는 crypto.randomUUID(Hermes 부재)가 아니라 폴백 내장 헬퍼로 만든다.
export const createJobDescriptionBlock = (
	type: JobDescriptionBlockType = "paragraph"
): JobDescriptionBlock => ({
	id: generateChatMessageId(),
	text: "",
	type,
});

export const addJobBlock = (
	blocks: readonly JobDescriptionBlock[],
	block: JobDescriptionBlock = createJobDescriptionBlock()
): JobDescriptionBlock[] => [...blocks, block];

export const removeJobBlock = (
	blocks: readonly JobDescriptionBlock[],
	id: string
): JobDescriptionBlock[] => blocks.filter((block) => block.id !== id);

export const moveJobBlock = (
	blocks: readonly JobDescriptionBlock[],
	id: string,
	direction: "down" | "up"
): JobDescriptionBlock[] => {
	const index = blocks.findIndex((block) => block.id === id);

	if (index === -1) {
		return [...blocks];
	}

	const target = direction === "up" ? index - 1 : index + 1;

	if (target < 0 || target >= blocks.length) {
		return [...blocks];
	}

	const next = [...blocks];
	[next[index], next[target]] = [next[target], next[index]];

	return next;
};

export const updateJobBlockText = (
	blocks: readonly JobDescriptionBlock[],
	id: string,
	text: string
): JobDescriptionBlock[] =>
	blocks.map((block) => (block.id === id ? { ...block, text } : block));

export const updateJobBlockType = (
	blocks: readonly JobDescriptionBlock[],
	id: string,
	type: JobDescriptionBlockType
): JobDescriptionBlock[] =>
	blocks.map((block) => (block.id === id ? { ...block, type } : block));

export const canAddJobBlock = (
	blocks: readonly JobDescriptionBlock[]
): boolean => blocks.length < MAX_JOB_DESCRIPTION_BLOCKS;

// 서버와 같은 규칙(validateJobDescriptionBlocks)으로 검사하고 첫 이슈를 한국어로 옮긴다.
export const jobDescriptionBlocksError = (
	blocks: readonly JobDescriptionBlock[]
): null | string => {
	const result = validateJobDescriptionBlocks([...blocks]);

	if (result.ok) {
		return null;
	}

	const [issue] = result.issues;

	switch (issue?.code) {
		case "too_many_blocks":
			return `상세설명 블록은 최대 ${MAX_JOB_DESCRIPTION_BLOCKS}개까지 추가할 수 있어요.`;
		case "block_text_too_long":
			return `상세설명 블록은 한 블록당 ${issue.maxLength ?? 800}자 이하로 입력해 주세요.`;
		default:
			return "상세설명 블록의 내용을 입력하거나 빈 블록을 삭제해 주세요.";
	}
};
