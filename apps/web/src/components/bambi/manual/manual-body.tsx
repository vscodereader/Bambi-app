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
// 다시 얹는다. h2는 챕터 경계라 넉넉한 상단 여백으로 위계를 준다(구분선 없이 공백만).
// scroll-mt는 sticky 헤더(top-20) 아래로 앵커가 숨지 않게 하는 오프셋.
function Heading2({ children }: { children?: ReactNode }) {
	return (
		<h2
			className="mt-14 mb-5 scroll-mt-24 font-bold text-xl tracking-tight first:mt-0 md:text-2xl"
			id={githubSlug(textOf(children))}
		>
			{children}
		</h2>
	);
}

function Heading3({ children }: { children?: ReactNode }) {
	return (
		<h3
			className="mt-10 mb-3 scroll-mt-24 font-semibold text-xl"
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

// 본문 단락·리스트는 행간(leading-8)과 상하 여백을 키워 긴 매뉴얼의 가독성을 높인다.
function Paragraph({ children }: { children?: ReactNode }) {
	return <p className="my-5 leading-7 sm:leading-8">{children}</p>;
}

function UnorderedList({ children }: { children?: ReactNode }) {
	return <ul className="my-5 list-disc pl-6">{children}</ul>;
}

function OrderedList({ children }: { children?: ReactNode }) {
	return <ol className="my-5 list-decimal pl-6">{children}</ol>;
}

function ListItem({ children }: { children?: ReactNode }) {
	return <li className="my-2 leading-7 sm:leading-8">{children}</li>;
}

// > 블록은 코럴 라벨을 앞세운 라벨형 플레인 텍스트로 렌더한다(박스·배경·좌측보더
// 없이 여백으로만 분리). 라벨은 렌더러가 첫 텍스트를 보고 고른다:
// - 본문이 이미 "참고:"/"참고 "로 시작하면 라벨을 얹지 않는다(이중 "참고" 방지).
// - 문서 메타("최종 갱신 …") 라인도 라벨 없이 문단만 둔다.
// - 되돌릴 수 없는 경고(⚠)는 성격이 달라 "주의"로 세운다.
// - 그 밖의 팁·안내 블록은 "참고".
function quoteLabel(children: ReactNode): string | null {
	const text = textOf(children).trimStart();
	if (text.startsWith("참고:") || text.startsWith("참고 ")) {
		return null;
	}
	if (text.startsWith("최종 갱신")) {
		return null;
	}
	if (text.startsWith("⚠")) {
		return "주의";
	}
	return "참고";
}

function Blockquote({ children }: { children?: ReactNode }) {
	const label = quoteLabel(children);
	return (
		<blockquote className="my-6 flex flex-col gap-2 [&_p]:my-0 [&_p]:leading-7 sm:[&_p]:leading-8">
			{label ? (
				<span className="font-bold text-primary text-sm tracking-wide">
					{label}
				</span>
			) : null}
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
