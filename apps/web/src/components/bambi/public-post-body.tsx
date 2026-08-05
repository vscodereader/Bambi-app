// 공개 글 상세 본문 렌더러(서버 컴포넌트).
//
// 회원용 PostBodyViewer는 Tiptap 에디터를 클라이언트에서 띄우는 구조라
// (immediatelyRender: false) 크롤러가 받는 HTML에는 본문이 비어 있다. 공개 페이지는
// JS 없이 본문이 보여야 색인되므로 doc JSON을 서버에서 그대로 그린다. 스키마는
// community-editor의 확장 세트(StarterKit + Image)와 같은 노드 집합이다.
//
// 이미지는 그리지 않는다 — 수위 높은 사진이 색인·미리보기에 그대로 실리지 않도록
// 자리표시자만 남기고, 원본은 회원 화면(상세)에서 본다(목록 썸네일 블러와 같은 취지).

import { cn } from "@bambi-app/ui/lib/utils";
import { ImageIcon } from "lucide-react";
import { Fragment, type ReactNode } from "react";

interface DocMark {
	attrs?: { href?: string };
	type?: string;
}

interface DocNode {
	attrs?: { level?: number };
	content?: DocNode[];
	marks?: DocMark[];
	text?: string;
	type?: string;
}

const MARK_TAGS: Record<string, "code" | "em" | "s" | "strong"> = {
	bold: "strong",
	code: "code",
	italic: "em",
	strike: "s",
};

const BLOCK_TAGS: Record<
	string,
	"blockquote" | "li" | "ol" | "p" | "pre" | "ul"
> = {
	blockquote: "blockquote",
	bulletList: "ul",
	codeBlock: "pre",
	listItem: "li",
	orderedList: "ol",
	paragraph: "p",
};

const HEADING_TAGS = ["h2", "h3", "h4"] as const;

// 본문 최상위 제목은 페이지의 <h1>(글 제목)이므로 doc의 heading은 h2부터 시작한다.
const headingTag = (level?: number) =>
	HEADING_TAGS[
		Math.min(Math.max((level ?? 1) - 1, 0), HEADING_TAGS.length - 1)
	];

// 회원 에디터는 withHttps로 스킴을 보정해 넣지만, 본문 doc JSON은 API로 임의 값이
// 들어올 수 있다. javascript: 등 실행 가능한 스킴이 <a href>로 그려지면 클릭 XSS가
// 되므로 렌더 시점에 프로토콜을 화이트리스트로 거르고, 걸러진 링크는 텍스트만 남긴다.
const SAFE_LINK_PROTOCOLS = new Set(["http:", "https:", "mailto:", "tel:"]);

export const isSafeLinkHref = (href: string): boolean => {
	try {
		return SAFE_LINK_PROTOCOLS.has(new URL(href).protocol);
	} catch {
		// 상대 경로·형식 오류는 링크로 그리지 않는다(본문 링크는 외부 주소 전제).
		return false;
	}
};

const withMarks = (text: string, marks: DocMark[]): ReactNode => {
	let node: ReactNode = text;
	for (const mark of marks) {
		const Tag = mark.type ? MARK_TAGS[mark.type] : undefined;
		if (Tag) {
			node = <Tag>{node}</Tag>;
			continue;
		}
		// 회원이 아무 주소나 걸 수 있는 본문이라 도메인 신뢰를 넘기지 않는다
		// (community-editor의 링크 확장 설정과 같은 rel).
		if (
			mark.type === "link" &&
			mark.attrs?.href &&
			isSafeLinkHref(mark.attrs.href)
		) {
			node = (
				<a
					href={mark.attrs.href}
					rel="noopener noreferrer nofollow"
					target="_blank"
				>
					{node}
				</a>
			);
		}
	}
	return node;
};

function ImageNotice() {
	return (
		<span className="my-2 flex w-fit items-center gap-1.5 rounded-md border border-border border-dashed px-3 py-2 text-muted-foreground text-xs">
			<ImageIcon className="size-4 shrink-0" />
			이미지는 회원 화면에서 볼 수 있어요
		</span>
	);
}

const renderNodes = (nodes: DocNode[] | undefined, path: string): ReactNode[] =>
	(nodes ?? []).map((node, index) => renderNode(node, `${path}.${index}`));

function renderNode(node: DocNode, key: string): ReactNode {
	if (node.type === "text") {
		return (
			<Fragment key={key}>
				{withMarks(node.text ?? "", node.marks ?? [])}
			</Fragment>
		);
	}
	if (node.type === "hardBreak") {
		return <br key={key} />;
	}
	if (node.type === "horizontalRule") {
		return <hr key={key} />;
	}
	if (node.type === "image") {
		return <ImageNotice key={key} />;
	}

	const children = renderNodes(node.content, key);
	if (node.type === "heading") {
		const Tag = headingTag(node.attrs?.level);
		return <Tag key={key}>{children}</Tag>;
	}
	const Tag = BLOCK_TAGS[node.type ?? ""];
	if (Tag) {
		return <Tag key={key}>{children}</Tag>;
	}
	// 모르는 노드는 자식만 흘려보낸다 — 확장이 늘어도 본문이 통째로 사라지지 않는다.
	return <Fragment key={key}>{children}</Fragment>;
}

// 회원 뷰어(PostBodyViewer)의 타이포그래피와 같은 규칙. 뷰어 상수는 "use client"
// 모듈에 있어 서버에서 가져다 쓸 수 없으므로 같은 값을 여기에 둔다.
const PUBLIC_BODY_CLASS = cn(
	"w-full text-foreground text-sm leading-relaxed",
	"[&_a]:text-primary [&_a]:underline",
	"[&_ol]:list-decimal [&_ol]:pl-5 [&_ul]:list-disc [&_ul]:pl-5",
	"[&_p]:my-1 [&_strong]:font-semibold",
	"[&_blockquote]:border-border [&_blockquote]:border-l-2 [&_blockquote]:pl-3",
	"[&_h2]:mt-4 [&_h2]:font-bold [&_h2]:text-base",
	"[&_h3]:mt-3 [&_h3]:font-bold [&_h3]:text-sm",
	"[&_pre]:overflow-x-auto [&_pre]:rounded-md [&_pre]:bg-muted [&_pre]:p-3"
);

export function PublicPostBody({ body }: { body: string }) {
	let doc: DocNode | null = null;
	try {
		doc = JSON.parse(body) as DocNode;
	} catch {
		// 옛 글·형식 오류는 평문으로 본다(PostBodyViewer와 같은 폴백).
	}

	if (doc?.type !== "doc") {
		return (
			<p className="m-0 whitespace-pre-wrap text-foreground text-sm leading-relaxed">
				{body}
			</p>
		);
	}

	return (
		<div className={PUBLIC_BODY_CLASS}>{renderNodes(doc.content, "body")}</div>
	);
}
