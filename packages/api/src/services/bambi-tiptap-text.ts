// TipTap JSON 본문에서 평문을 뽑는다. 금칙어 검사 전용이며 렌더링용이 아니다.
// 노드 사이에 공백을 넣는 이유: 문단 경계를 지우면 "완성"+"매매"가 붙어 없던 금칙어가
// 생겨 오탐이 난다.

interface TiptapNode {
	content?: unknown;
	text?: unknown;
}

const collectText = (node: unknown, parts: string[]): void => {
	if (!node || typeof node !== "object") {
		return;
	}

	const typed = node as TiptapNode;

	if (typeof typed.text === "string") {
		parts.push(typed.text);
	}

	if (Array.isArray(typed.content)) {
		for (const child of typed.content) {
			collectText(child, parts);
		}
	}
};

export const extractTiptapText = (body: string): string => {
	let parsed: unknown;

	try {
		parsed = JSON.parse(body);
	} catch {
		// 평문이 들어오면 그대로 검사 대상으로 삼는다.
		return body;
	}

	const parts: string[] = [];
	collectText(parsed, parts);

	return parts.join(" ");
};
