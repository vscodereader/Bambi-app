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

// 헤딩을 오버라이드하면 streamdown 기본 컴포넌트가 통째로 대체되므로 기본 타이포
// (mt-6 mb-2 font-semibold + 단계별 크기)를 그대로 다시 얹는다.
// scroll-mt는 sticky 헤더(top-20) 아래로 앵커가 숨지 않게 하는 오프셋.
function Heading2({ children }: { children?: ReactNode }) {
	return (
		<h2
			className="mt-6 mb-2 scroll-mt-24 font-semibold text-2xl"
			id={githubSlug(textOf(children))}
		>
			{children}
		</h2>
	);
}

function Heading3({ children }: { children?: ReactNode }) {
	return (
		<h3
			className="mt-6 mb-2 scroll-mt-24 font-semibold text-xl"
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

export function ManualBody({ markdown }: { markdown: string }) {
	return (
		<Streamdown components={{ h2: Heading2, h3: Heading3, h4: Heading4 }}>
			{markdown}
		</Streamdown>
	);
}
