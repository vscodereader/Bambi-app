interface TiptapNode {
	attrs?: { alt?: unknown };
	content?: unknown[];
	text?: unknown;
	type?: unknown;
}

/**
 * 문서를 줄 단위로 편다. 블록 컨테이너(bulletList·orderedList·blockquote 등)는 재귀해
 * textblock마다 한 줄을 만들고, 한 블록 안의 인라인 런(볼드·링크 경계로 쪼개진 조각)은
 * 구분자 없이 붙인다. 노드 타입 표를 두지 않는다 — 자식 중 content를 가진 노드나 이미지가
 * 있으면 컨테이너로 본다(에디터 확장이 늘어도 표를 따라 고칠 필요가 없다).
 *
 * 이미지는 텍스트가 없어 그냥 두면 흔적 없이 사라진다. 웹 상세(PostBodyViewer)는 실제로
 * 그리므로, 최소한 자리표시를 남겨 "내용이 있는데 못 그렸다"는 사실은 보이게 한다.
 */
const docToLines = (blocks: unknown[]): string[] => {
	const lines: string[] = [];

	const walk = (node: TiptapNode) => {
		if (node.type === "image") {
			const alt = node.attrs?.alt;
			lines.push(
				typeof alt === "string" && alt ? `[이미지] ${alt}` : "[이미지]"
			);
			return;
		}

		const kids = Array.isArray(node.content)
			? (node.content as TiptapNode[])
			: [];

		if (
			kids.some((kid) => Array.isArray(kid.content) || kid.type === "image")
		) {
			for (const kid of kids) {
				walk(kid);
			}
			return;
		}

		// hardBreak(Shift+Enter)는 text도 content도 없어 그냥 두면 앞뒤가 구분자 0으로 붙는다
		// ("010-1234-5678문의 주세요"). 블록 join과 같은 "\n"으로 바꿔 흘려보낸다.
		lines.push(
			typeof node.text === "string"
				? node.text
				: kids
						.map((kid) => {
							if (kid.type === "hardBreak") {
								return "\n";
							}

							return typeof kid.text === "string" ? kid.text : "";
						})
						.join("")
		);
	};

	for (const block of blocks) {
		walk(block as TiptapNode);
	}

	return lines;
};

/**
 * 쪽지 본문(Tiptap 문서 JSON)을 평문으로 편다. 웹 communityBodyToText
 * (apps/web/src/lib/bambi/community.ts)의 이식 — 그쪽은 web `@/` alias 소속이라
 * native에서 import할 수 없다. JSON이 아니거나 type !== "doc"이면 원문을 그대로
 * 돌려주는 하위호환 계약(옛 평문 본문)도 웹과 같다.
 *
 * 웹판과 다른 점: 웹은 한 줄 미리보기 전용이라 모든 텍스트를 " "로 잇지만, 여기는 본문
 * 전체를 그리므로 textblock마다 "\n"으로 잇고 블록 안 인라인 런은 붙인다(웹판을 그대로
 * 복사하면 볼드 경계마다 공백이 낀다).
 */
export const directMessageBodyToText = (body: string): string => {
	let doc: unknown;

	try {
		doc = JSON.parse(body);
	} catch {
		return body;
	}

	if (
		!doc ||
		typeof doc !== "object" ||
		(doc as { type?: unknown }).type !== "doc"
	) {
		return body;
	}

	const blocks = (doc as TiptapNode).content;

	if (!Array.isArray(blocks)) {
		return "";
	}

	return docToLines(blocks).join("\n");
};
