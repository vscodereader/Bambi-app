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
