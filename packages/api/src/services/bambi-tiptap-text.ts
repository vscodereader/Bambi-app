// TipTap JSON 본문에서 평문을 뽑는다. 금칙어 검사와 운영자 미리보기가 함께 쓴다.
//
// 조인 규칙: doc 하위 블록(문단·리스트 등)은 줄바꿈으로 잇고, 블록 내부의 text 노드는
// 붙여 잇는다. 블록 내부를 붙이는 이유는 마크(굵게 등)로 쪼개진 노드가 원래 한 단어이기
// 때문이다 — "성" + 굵게"매매"를 공백으로 나누면 원문에 없던 경계가 생긴다.
// 반대로 블록 경계를 지우면 "완성"+"매매"가 붙어 없던 금칙어가 생기므로 줄바꿈을 남긴다.
// (금칙어 매칭은 정규화 단계에서 공백류를 모두 제거하므로 두 구분자의 차이가 결과를
// 바꾸지는 않는다. 구분자는 미리보기 가독성을 위한 것이다.)

import { ORPCError } from "@orpc/server";

const TIPTAP_SHAPE_ERROR = "본문 형식이 올바르지 않습니다.";

const collectTiptapText = (node: unknown): string => {
	if (!node || typeof node !== "object") {
		return "";
	}

	const record = node as { content?: unknown; text?: unknown; type?: unknown };

	if (record.type === "text" && typeof record.text === "string") {
		return record.text;
	}

	if (Array.isArray(record.content)) {
		return record.content
			.map(collectTiptapText)
			.join(record.type === "doc" ? "\n" : "");
	}

	return "";
};

export const extractTiptapText = (body: string): string => {
	try {
		return collectTiptapText(JSON.parse(body) as unknown).trim();
	} catch {
		// 평문이 들어오면 그대로 검사·미리보기 대상으로 삼는다.
		return body;
	}
};

// 리치 에디터로 작성되는 본문(수다방 글·FAQ 답변)이 Tiptap doc JSON인지 확인한다.
// 평문이 그대로 저장되면 뷰어가 원문을 노출하거나 JSON 블롭이 새므로 입구에서 막는다.
// 수다방(community.ts)과 고객센터(support.ts)가 이 하나를 공유한다 — 두 곳의 거부 문구가
// 갈리면 같은 에디터를 쓰는데 화면마다 다른 안내가 뜬다.
export const assertTiptapDoc = (body: string): void => {
	let parsed: unknown;
	try {
		parsed = JSON.parse(body);
	} catch {
		throw new ORPCError("BAD_REQUEST", {
			message: TIPTAP_SHAPE_ERROR,
		});
	}
	if (
		typeof parsed !== "object" ||
		parsed === null ||
		(parsed as { type?: unknown }).type !== "doc"
	) {
		throw new ORPCError("BAD_REQUEST", {
			message: TIPTAP_SHAPE_ERROR,
		});
	}
};
