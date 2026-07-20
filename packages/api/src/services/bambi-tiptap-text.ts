// TipTap JSON 본문에서 평문을 뽑는다. 금칙어 검사와 운영자 미리보기가 함께 쓴다.
//
// 조인 규칙: doc 하위 블록(문단·리스트 등)은 줄바꿈으로 잇고, 블록 내부의 text 노드는
// 붙여 잇는다. 블록 내부를 붙이는 이유는 마크(굵게 등)로 쪼개진 노드가 원래 한 단어이기
// 때문이다 — "성" + 굵게"매매"를 공백으로 나누면 원문에 없던 경계가 생긴다.
// 반대로 블록 경계를 지우면 "완성"+"매매"가 붙어 없던 금칙어가 생기므로 줄바꿈을 남긴다.
// (금칙어 매칭은 정규화 단계에서 공백류를 모두 제거하므로 두 구분자의 차이가 결과를
// 바꾸지는 않는다. 구분자는 미리보기 가독성을 위한 것이다.)

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
