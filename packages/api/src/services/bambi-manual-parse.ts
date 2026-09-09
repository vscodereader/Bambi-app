// 매뉴얼 md의 제목·목차·헤딩 앵커 파싱. fs 없는 순수 모듈이다 —
// 클라이언트 본문 렌더러(manual-body.tsx)가 githubSlug를 같이 쓴다.

// GitHub 헤딩 앵커 규칙: 소문자화 → 글자·숫자·공백·하이픈·언더스코어 외 제거 →
// 공백 1칸당 하이픈 1개. 매뉴얼 본문의 수기 목차 링크(#3-1-공고-탐색-채용정보)와
// 일치해야 문서 내 이동이 동작한다.
// ponytail: 중복 헤딩에 -1, -2 접미를 붙이는 GitHub 규칙은 생략 — 매뉴얼 헤딩은
// 절 번호로 유일하다. 중복이 생기면 같은 id가 두 번 나올 뿐(첫 앵커로 이동).
const SLUG_STRIP = /[^\p{L}\p{N} _-]/gu;

export const githubSlug = (text: string): string =>
	text.trim().toLowerCase().replace(SLUG_STRIP, "").replace(/ /g, "-");

export interface ManualHeading {
	depth: 2 | 3;
	slug: string;
	text: string;
}

export interface ParsedManual {
	headings: ManualHeading[];
	markdown: string;
	title: string;
}

const HEADING_RE = /^(#{2,3}) (.+)$/;

// 첫 `# 제목`은 페이지 헤더로 따로 렌더하므로 본문에서 뺀다. 수기 "## 목차" 섹션은
// UI 목차 사이드바와 중복이라 다음 헤딩 전까지 통째로 걷어낸다.
export function parseManual(raw: string): ParsedManual {
	const kept: string[] = [];
	const headings: ManualHeading[] = [];
	let title = "";
	let inFence = false;
	let skippingToc = false;

	for (const line of raw.split("\n")) {
		if (line.startsWith("```")) {
			inFence = !inFence;
		}
		if (!inFence) {
			if (!title && line.startsWith("# ")) {
				title = line.slice(2).trim();
				continue;
			}
			const match = HEADING_RE.exec(line);
			if (match?.[1] && match[2]) {
				const text = match[2].trim();
				skippingToc = text === "목차";
				if (!skippingToc) {
					headings.push({
						depth: match[1].length as 2 | 3,
						slug: githubSlug(text),
						text,
					});
				}
			}
			if (skippingToc) {
				continue;
			}
		}
		kept.push(line);
	}

	return { headings, markdown: kept.join("\n"), title };
}
