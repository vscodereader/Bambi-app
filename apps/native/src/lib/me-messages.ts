interface TiptapMark {
	attrs?: { href?: unknown };
	type?: unknown;
}

interface TiptapNode {
	attrs?: { alt?: unknown; src?: unknown };
	content?: unknown[];
	marks?: unknown[];
	text?: unknown;
	type?: unknown;
}

/** 문단 한 줄 안의 텍스트 조각. 마크는 스타일 플래그로만 남긴다(렌더는 message-body.tsx). */
export interface MessageInline {
	bold?: boolean;
	href?: string;
	italic?: boolean;
	strike?: boolean;
	text: string;
}

/**
 * 쪽지 본문을 그리기 위한 최소 블록 집합. 웹 뷰어(Tiptap)의 노드를 1:1로 옮기지 않는다 —
 * 운영자 쪽지는 문단·리스트·링크·이미지가 사실상 전부라, 나머지(heading·blockquote·
 * codeBlock…)는 문단으로 눌러 그린다.
 */
export type MessageBlock =
	| { alt: string; src: string; type: "image" }
	| { inlines: MessageInline[]; marker: string; type: "listItem" }
	| { inlines: MessageInline[]; type: "paragraph" };

const SAFE_LINK_SCHEMES = new Set(["http:", "https:", "mailto:", "tel:"]);
const LINK_SCHEME_PATTERN = /^[a-z][a-z\d+.-]*:/i;

/**
 * 웹 public-post-body.tsx의 isSafeLinkHref 이식. 본문 doc JSON에는 API로 임의 값이 들어올 수
 * 있어 스킴을 화이트리스트로 거른다 — 걸러진 링크는 href를 떼고 텍스트만 남긴다. native는
 * 웹의 클릭 XSS보다 위험하다(Linking.openURL은 intent:·앱 딥링크도 그대로 OS에 넘긴다).
 *
 * 웹은 `new URL(href).protocol`로 뽑지만 여기서는 스킴만 직접 뜯는다 — native의 URL은 RN
 * 폴리필(Libraries/Blob/URL.js)이라 node의 WHATWG URL과 파싱이 갈리고(예: 앞 공백을 node는
 * 버리고 폴리필은 안 버린다) 그러면 vitest는 통과해도 앱에서 다르게 동작한다. 정규식이 `^`에
 * 묶여 있어 공백·제어문자로 스킴을 위장한 주소("\njavascript:")는 아예 매치되지 않는다.
 */
export const isSafeLinkHref = (href: string): boolean => {
	const scheme = LINK_SCHEME_PATTERN.exec(href)?.[0];

	return scheme !== undefined && SAFE_LINK_SCHEMES.has(scheme.toLowerCase());
};

const markedInline = (text: string, marks: unknown): MessageInline => {
	const inline: MessageInline = { text };

	for (const mark of Array.isArray(marks) ? (marks as TiptapMark[]) : []) {
		if (mark?.type === "bold") {
			inline.bold = true;
		} else if (mark?.type === "italic") {
			inline.italic = true;
		} else if (mark?.type === "strike") {
			inline.strike = true;
		} else if (mark?.type === "link") {
			const href = mark.attrs?.href;

			if (typeof href === "string" && isSafeLinkHref(href)) {
				inline.href = href;
			}
		}
	}

	return inline;
};

const collectInlines = (nodes: TiptapNode[], inlines: MessageInline[]) => {
	for (const node of nodes) {
		if (typeof node.text === "string") {
			inlines.push(markedInline(node.text, node.marks));
			continue;
		}

		// hardBreak(Shift+Enter)는 text도 content도 없어 그냥 두면 앞뒤가 구분자 0으로 붙는다
		// ("010-1234-5678문의 주세요"). 블록 사이와 같은 "\n"으로 바꿔 흘려보낸다.
		if (node.type === "hardBreak") {
			inlines.push({ text: "\n" });
			continue;
		}

		// text도 content도 없는 모르는 리프(horizontalRule 등)는 건너뛴다.
		if (Array.isArray(node.content)) {
			collectInlines(node.content as TiptapNode[], inlines);
		}
	}
};

/**
 * 블록 하나를 편다. 노드 타입 표를 두지 않는다 — 자식 중 content를 가진 노드나 이미지가
 * 있으면 컨테이너로 보고 재귀한다(웹 public-post-body의 "모르는 노드는 자식만 흘려보낸다"와
 * 같은 계약: 에디터 확장이 늘어도 본문이 통째로 사라지지 않는다).
 */
const walkBlock = (
	node: TiptapNode,
	blocks: MessageBlock[],
	marker: string
) => {
	if (node.type === "image") {
		const src = node.attrs?.src;
		const alt = node.attrs?.alt;

		if (typeof src === "string") {
			blocks.push({
				alt: typeof alt === "string" ? alt : "",
				src,
				type: "image",
			});
		}

		return;
	}

	const content = Array.isArray(node.content)
		? (node.content as TiptapNode[])
		: null;

	// 중첩 리스트는 깊이를 접어 같은 마커로 평탄화한다(들여쓰기는 이연). 재귀 분기라 자식은
	// 반드시 실제 content만 본다 — content 없는 리스트 노드에 아래 `[node]` 폴백을 쓰면
	// 자기 자신을 무한히 다시 돈다(RangeError로 쪽지함 전체가 죽는다).
	if (node.type === "bulletList" || node.type === "orderedList") {
		const ordered = node.type === "orderedList";

		(content ?? []).forEach((kid, index) => {
			walkBlock(kid, blocks, ordered ? `${index + 1}.` : "•");
		});

		return;
	}

	// content가 없으면 노드 자신을 인라인 후보로 본다 — 최상위에 텍스트가 바로 놓인
	// 비정상 doc도 잃지 않는다(내용 없는 리프는 아래에서 어차피 걸러진다).
	const kids = content ?? [node];

	if (kids.some((kid) => Array.isArray(kid.content) || kid.type === "image")) {
		for (const kid of kids) {
			walkBlock(kid, blocks, marker);
		}

		return;
	}

	const inlines: MessageInline[] = [];
	collectInlines(kids, inlines);

	if (inlines.length === 0) {
		return;
	}

	blocks.push(
		marker
			? { inlines, marker, type: "listItem" }
			: { inlines, type: "paragraph" }
	);
};

/**
 * 쪽지 본문(Tiptap 문서 JSON)을 렌더 블록으로 편다. JSON이 아니거나 doc 문서가 아니면
 * null — 호출부는 옛 평문 본문으로 보고 directMessageBodyToText 폴백을 쓴다.
 */
export const parseDirectMessageBody = (body: string): MessageBlock[] | null => {
	let doc: unknown;

	try {
		doc = JSON.parse(body);
	} catch {
		return null;
	}

	if (!doc || typeof doc !== "object" || (doc as TiptapNode).type !== "doc") {
		return null;
	}

	const content = (doc as TiptapNode).content;
	const blocks: MessageBlock[] = [];

	// doc이긴 한데 본문이 비었으면 빈 목록 — 여기서 null을 주면 폴백이 원문(JSON 문자열)을
	// 그대로 그린다.
	for (const node of Array.isArray(content) ? (content as TiptapNode[]) : []) {
		walkBlock(node, blocks, "");
	}

	return blocks;
};

// 이미지는 텍스트가 없어 그냥 두면 흔적 없이 사라진다. 평문은 접힘 미리보기·폴백 전용이라
// 최소한 자리표시를 남겨 "내용이 있는데 안 보인다"는 사실은 보이게 한다(펼친 본문은 실제로
// 그린다 — 이미지를 가리는 건 공개 SEO 페이지뿐이다).
const blockToText = (block: MessageBlock): string => {
	if (block.type === "image") {
		return block.alt ? `[이미지] ${block.alt}` : "[이미지]";
	}

	return block.inlines.map((inline) => inline.text).join("");
};

/**
 * 쪽지 본문을 평문으로 편다(접힘 미리보기 2줄 · doc 파싱 실패 폴백). 웹 communityBodyToText
 * (apps/web/src/lib/bambi/community.ts)의 이식 — 그쪽은 web `@/` alias 소속이라 native에서
 * import할 수 없다. JSON이 아니거나 type !== "doc"이면 원문을 그대로 돌려주는 하위호환
 * 계약(옛 평문 본문)도 웹과 같다.
 *
 * 웹판과 다른 점: 웹은 한 줄 미리보기 전용이라 모든 텍스트를 " "로 잇지만, 여기는 블록마다
 * "\n"으로 잇고 블록 안 인라인 런은 붙인다(웹판을 그대로 복사하면 볼드 경계마다 공백이 낀다).
 */
export const directMessageBodyToText = (body: string): string => {
	const blocks = parseDirectMessageBody(body);

	return blocks === null ? body : blocks.map(blockToText).join("\n");
};
