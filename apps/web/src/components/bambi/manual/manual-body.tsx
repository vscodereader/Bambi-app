"use client";

// 매뉴얼 md 본문 렌더러. streamdown(react-markdown 호환)을 쓰고, h2~h4에
// GitHub식 slug id를 붙여 md 본문 수기 목차 링크와 UI 목차가 실제로 이동하게 한다.
// components 오버라이드는 함수라 RSC에서 직렬화해 넘길 수 없어 여기(클라이언트)서 정의한다.
import { isValidElement, type ReactNode } from "react";
import { Streamdown } from "streamdown";
import { githubSlug } from "@/lib/bambi/manual-parse";

// 헤딩 children에서 텍스트만 회수한다(굵게 등 인라인 마크업이 섞인 헤딩 대응).
const textOf = (node: ReactNode): string => {
	if (typeof node === "string" || typeof node === "number") {
		return String(node);
	}
	if (Array.isArray(node)) {
		return node.map(textOf).join("");
	}
	if (isValidElement<{ children?: ReactNode }>(node)) {
		return textOf(node.props.children);
	}
	return "";
};

// 오버라이드하면 streamdown 기본 컴포넌트가 통째로 대체되므로 필요한 타이포를 전부
// 다시 얹는다. h2는 챕터 경계라 상단 구분선(border-t)과 넉넉한 여백으로 위계를 준다.
// scroll-mt는 sticky 헤더(top-20) 아래로 앵커가 숨지 않게 하는 오프셋.
function Heading2({ children }: { children?: ReactNode }) {
	return (
		<h2
			className="mt-12 mb-4 scroll-mt-24 border-t pt-8 font-semibold text-2xl first:mt-0 first:border-t-0 first:pt-0"
			id={githubSlug(textOf(children))}
		>
			{children}
		</h2>
	);
}

function Heading3({ children }: { children?: ReactNode }) {
	return (
		<h3
			className="mt-8 mb-3 scroll-mt-24 font-semibold text-xl"
			id={githubSlug(textOf(children))}
		>
			{children}
		</h3>
	);
}

// h4는 목차 수집 대상이 아니지만, 구직자 매뉴얼 본문의 수기 앵커(#내-신고-내역 등)가
// h4를 가리키므로 id는 붙여야 문서 내 이동이 동작한다.
function Heading4({ children }: { children?: ReactNode }) {
	return (
		<h4
			className="mt-6 mb-2 scroll-mt-24 font-semibold text-lg"
			id={githubSlug(textOf(children))}
		>
			{children}
		</h4>
	);
}

// streamdown 기본 a는 target="_blank"가 하드코딩이라 본문에 남은 수기 앵커 링크(#절-제목)까지
// 새 탭으로 연다. 내부 앵커만 같은 탭 이동으로 돌리고 외부 링크는 기존 동작을 유지한다.
// className은 streamdown 기본 링크 스타일 그대로다.
function Anchor({ children, href }: { children?: ReactNode; href?: string }) {
	const isInternal = href?.startsWith("#");
	return (
		<a
			className="wrap-anywhere font-medium text-primary underline"
			href={href}
			rel={isInternal ? undefined : "noreferrer"}
			target={isInternal ? undefined : "_blank"}
		>
			{children}
		</a>
	);
}

// 본문 단락·리스트는 행간(leading-7)과 상하 여백을 키워 긴 매뉴얼의 가독성을 높인다.
function Paragraph({ children }: { children?: ReactNode }) {
	return <p className="my-4 leading-7">{children}</p>;
}

function UnorderedList({ children }: { children?: ReactNode }) {
	return <ul className="my-4 list-disc pl-6">{children}</ul>;
}

function OrderedList({ children }: { children?: ReactNode }) {
	return <ol className="my-4 list-decimal pl-6">{children}</ol>;
}

function ListItem({ children }: { children?: ReactNode }) {
	return <li className="my-2 leading-7">{children}</li>;
}

// 매뉴얼의 > 블록은 전부 주의·팁 성격이라 콜아웃 박스로 렌더한다.
// 내부 단락의 상하 여백은 박스 안 gap으로 대체한다.
function Blockquote({ children }: { children?: ReactNode }) {
	return (
		<blockquote className="my-4 flex flex-col gap-2 rounded-md border-primary border-l-4 bg-muted/50 px-4 py-3 [&_p]:my-0">
			{children}
		</blockquote>
	);
}

// 표는 자체 오버플로 래퍼로 감싼다. table 오버라이드가 streamdown 기본 table(자체
// overflow 래퍼 포함)을 통째로 대체하므로 래퍼 중복은 생기지 않는다.
function Table({ children }: { children?: ReactNode }) {
	return (
		<div className="my-4 w-full overflow-x-auto rounded-lg border">
			<table className="w-full border-collapse text-sm">{children}</table>
		</div>
	);
}

function TableHeaderCell({ children }: { children?: ReactNode }) {
	return (
		<th className="border-border border-b bg-muted px-3 py-2 text-left font-semibold">
			{children}
		</th>
	);
}

function TableCell({ children }: { children?: ReactNode }) {
	return (
		<td className="border-border border-b px-3 py-2 align-top leading-6">
			{children}
		</td>
	);
}

// 매뉴얼의 인라인 코드는 /jobs 같은 주소 표기다. 코드펜스는 매뉴얼에 없다.
function InlineCode({ children }: { children?: ReactNode }) {
	return (
		<code className="rounded-sm bg-muted px-1.5 py-0.5 font-mono text-sm">
			{children}
		</code>
	);
}

// controls=false — 표에 붙는 개발자용 Copy/Download 툴바를 끈다.
// parseIncompleteMarkdown=false — 스트리밍이 아니라 완결된 정적 문서다.
export function ManualBody({ markdown }: { markdown: string }) {
	return (
		<Streamdown
			components={{
				a: Anchor,
				blockquote: Blockquote,
				code: InlineCode,
				h2: Heading2,
				h3: Heading3,
				h4: Heading4,
				li: ListItem,
				ol: OrderedList,
				p: Paragraph,
				table: Table,
				td: TableCell,
				th: TableHeaderCell,
				ul: UnorderedList,
			}}
			controls={false}
			parseIncompleteMarkdown={false}
		>
			{markdown}
		</Streamdown>
	);
}
