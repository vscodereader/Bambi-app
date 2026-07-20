import { db } from "@bambi-app/db";
import { bannedWord } from "@bambi-app/db/schema/bambi";
import { ORPCError } from "@orpc/server";
import { eq } from "drizzle-orm";

// 금칙어 매칭 규칙의 단일 진실원. 순수 함수만 두어 DB 없이 테스트한다.
//
// 매칭 전략: 정규화(공백·구두점·기호 제거 + 소문자) 후 부분문자열.
// 단순 includes()는 공백 하나로 뚫리고, 운영자가 정규식을 직접 넣게 하면 잘못된 패턴 하나로
// 서비스 전체 글쓰기가 막힌다. 그 중간 지점이다.
//
// 부작용: 공백을 지우므로 인접한 두 단어가 붙어 우연히 금칙어를 이룰 수 있다(오탐).
// 우회 차단을 위해 이 오탐은 감수하며, 경계는 테스트로 고정한다.

export interface BannedWordEntry {
	normalizedTerm: string;
	term: string;
}

// 공백·구두점(\p{P})·기호(\p{S}) 제거. 한글 자모·숫자·문자는 남긴다.
const STRIP_RE = /[\s\p{P}\p{S}]/gu;

export const normalizeForMatch = (text: string): string =>
	text.toLowerCase().replace(STRIP_RE, "");

export const findBannedTerm = (
	text: string,
	entries: BannedWordEntry[]
): string | null => {
	if (entries.length === 0) {
		return null;
	}

	const normalizedText = normalizeForMatch(text);

	if (normalizedText.length === 0) {
		return null;
	}

	for (const candidate of entries) {
		if (
			candidate.normalizedTerm.length > 0 &&
			normalizedText.includes(candidate.normalizedTerm)
		) {
			return candidate.term;
		}
	}

	return null;
};

// 매 작성 요청마다 DB를 조회하지 않는다. 인스턴스가 여럿이면 다른 인스턴스는 최대 TTL만큼
// 늦게 반영되는데, 금칙어 추가가 1분 내 전파되면 충분하다.
const CACHE_TTL_MS = 60_000;

let cachedEntries: BannedWordEntry[] | null = null;
let cachedAt = 0;

export const invalidateBannedWordCache = (): void => {
	cachedEntries = null;
	cachedAt = 0;
};

export const getActiveBannedWords = async (): Promise<BannedWordEntry[]> => {
	const now = Date.now();

	if (cachedEntries && now - cachedAt < CACHE_TTL_MS) {
		return cachedEntries;
	}

	const rows = await db
		.select({
			term: bannedWord.term,
			normalizedTerm: bannedWord.normalizedTerm,
		})
		.from(bannedWord)
		.where(eq(bannedWord.isActive, true));

	cachedEntries = rows;
	cachedAt = now;

	return rows;
};

// 걸린 단어 하나만 알려준다. 목록 전체를 내려보내면 우회 표현을 학습시키지만,
// 무엇에 걸렸는지 숨기면 사용자가 글을 고칠 방법이 없다.
export const assertNoBannedWords = async (fields: string[]): Promise<void> => {
	const entries = await getActiveBannedWords();

	for (const field of fields) {
		const hit = findBannedTerm(field, entries);

		if (hit) {
			throw new ORPCError("BAD_REQUEST", {
				message: `게시할 수 없는 단어가 포함되어 있습니다: '${hit}'`,
			});
		}
	}
};
