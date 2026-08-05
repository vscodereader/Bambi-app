// 비로그인 공개 읽기(/board) 전용 메타·경로·요약 유틸.
//
// 공개 대상 게시판의 정본은 서버(packages/api/src/routers/bambi/community.ts의
// PUBLIC_COMMUNITY_BOARDS)다. 여기 목록은 화면이 링크를 그릴 때 쓰는 사본이라
// 어긋나도 비공개 보드가 열리지는 않는다(서버가 최종 게이트).

import {
	COMMUNITY_BOARDS,
	type CommunityBoardKey,
	type CommunityBoardMeta,
} from "./community";

export const PUBLIC_BOARD_KEYS = ["notice", "free", "work_talk"] as const;

export type PublicBoardKey = (typeof PUBLIC_BOARD_KEYS)[number];

// key가 공개 집합으로 좁혀진 메타 — 화면이 board.key를 그대로 공개 프로시저 입력으로
// 넘길 수 있게 한다(캐스팅 없이).
export type PublicBoardMeta = CommunityBoardMeta & { key: PublicBoardKey };

const isPublicBoardKey = (key: CommunityBoardKey): key is PublicBoardKey =>
	(PUBLIC_BOARD_KEYS as readonly string[]).includes(key);

// 목록 화면의 게시판 카드 순서 = COMMUNITY_BOARDS 순서(공지 → 자유수다 → 일 이야기).
export const PUBLIC_BOARDS: PublicBoardMeta[] = COMMUNITY_BOARDS.filter(
	(board): board is PublicBoardMeta => isPublicBoardKey(board.key)
);

export const getPublicBoardBySlug = (
	slug: string
): PublicBoardMeta | undefined =>
	PUBLIC_BOARDS.find((board) => board.slug === slug);

export const PUBLIC_BOARD_INDEX_PATH = "/board";

// 1페이지는 쿼리를 붙이지 않는다 — 같은 목록이 /board/free 와 ?page=1 두 주소로
// 색인되면 중복 콘텐츠가 된다(canonical도 이 함수 결과를 쓴다).
export const publicBoardPath = (slug: string, page = 1): string =>
	page > 1 ? `/board/${slug}?page=${page}` : `/board/${slug}`;

export const publicPostPath = (slug: string, postId: string): string =>
	`/board/${slug}/${postId}`;

export const publicWritePath = (slug: string): string => `/board/${slug}/write`;

export const publicEditPath = (slug: string, postId: string): string =>
	`/board/${slug}/${postId}/edit`;

// 비회원이 글·댓글·추천을 남길 수 있는 게시판 — 공지는 운영자 전용이라 읽기만 열린다.
// 정본은 서버(community.ts의 GUEST_WRITABLE_BOARDS)이고 여기 사본은 버튼 노출용이다.
export const isGuestWritableBoard = (key: PublicBoardKey): boolean =>
	key !== "notice";

// ?page= 파싱 — 정수·1 이상만 통과시키고 나머지는 1페이지로 접는다.
export const parsePageParam = (
	value: string | string[] | undefined
): number => {
	const raw = Array.isArray(value) ? value[0] : value;
	const page = Number(raw);
	return Number.isInteger(page) && page >= 1 ? page : 1;
};

interface DocNodeLike {
	content?: DocNodeLike[];
	text?: string;
	type?: string;
}

const collectText = (node: DocNodeLike, parts: string[]): void => {
	if (node.text) {
		parts.push(node.text);
	}
	for (const child of node.content ?? []) {
		collectText(child, parts);
	}
};

const WHITESPACE = /\s+/g;

// 본문(Tiptap doc JSON)에서 메타 설명·목록 발췌용 평문을 뽑는다. JSON이 아니면
// 원문을 평문으로 본다(옛 글·형식 오류 폴백 — PostBodyViewer와 같은 관용).
export const communityBodyText = (body: string, maxLength = 160): string => {
	let text = body;
	try {
		const parsed = JSON.parse(body) as DocNodeLike;
		const parts: string[] = [];
		collectText(parsed, parts);
		text = parts.join(" ");
	} catch {
		// 평문 폴백
	}
	const normalized = text.replace(WHITESPACE, " ").trim();
	return normalized.length > maxLength
		? `${normalized.slice(0, maxLength - 1)}…`
		: normalized;
};
