// 비로그인(anon) 화면의 블러 배경에 실을 데이터. 블러는 CSS라 devtools로 걷어낼 수
// 있으므로 연출일 뿐이고, 실제 가드는 여기서 문자열을 마스킹해 클라이언트로 아예
// 읽을 수 있는 값을 보내지 않는 것이다. 필드는 화이트리스트로 뽑는다 — Job에 새
// 필드가 생겨도 배경으로 새지 않는다.
//
// 마스크는 진짜 한국어처럼 보이는 더미다(예전엔 ■ 격자였다). 블러가 걸린 상태에서는
// 실제 목록과 구분되지 않고, 블러를 걷어내도 가짜 업소명만 남는다.

import type { Job } from "./types";

// 배경 카드가 실제로 그리는 필드만 담는다 — 안 그리는 값까지 실어 보낼 이유가 없다.
export interface BackdropJob {
	company: string;
	location: string;
	pay: string;
	tags: string[];
	title: string;
}

// 실제 업소명으로 오인될 조합이 나오지 않게 기본 자모 음절을 쓰되, 받침 있는 음절을
// 섞어 글자 폭·획 밀도가 실제 한국어처럼 들쭉날쭉하게 만든다.
const MASK_SYLLABLES = Array.from(
	"가나다라마바사아자차카타파하간널담랑목별산옹준참"
);
const MASK_DIGITS = "0123456789";

const DIGIT_RE = /\p{Nd}/u;
const LETTER_RE = /\p{L}/u;

// 치환값은 원본 글자가 아니라 "위치"에서만 뽑는다 — 글자→글자 대응이 없으니 결과를
// 아무리 모아도 원문을 되돌릴 단서가 없다(길이 외에는 아무것도 새지 않는다).
// Math.random()을 쓰지 않으므로 서버·클라이언트 렌더 결과도 항상 같다.
const maskChar = (char: string, position: number): string => {
	if (DIGIT_RE.test(char)) {
		// 자릿수를 보존해 "시급 17,000원" 같은 형태가 살아 있게 한다.
		return MASK_DIGITS[(position * 7 + 3) % MASK_DIGITS.length];
	}
	if (LETTER_RE.test(char)) {
		return MASK_SYLLABLES[(position * 5 + 1) % MASK_SYLLABLES.length];
	}
	// 공백·문장부호(· , ~ 등)는 그대로 둔다 — 단어 덩어리와 리듬이 남아야 블러 아래서
	// 진짜 문장으로 읽힌다.
	return char;
};

// 글자 수를 보존해 카드 폭·줄바꿈이 실제 목록과 같아 보이게 한다. 이모지 등 서로게이트
// 페어를 한 글자로 세도록 Array.from을 쓴다. seed는 필드·행마다 다른 음절로 시작하게
// 해서 카드마다 같은 더미가 반복되지 않도록 한다.
const maskText = (value: string, seed: number): string =>
	Array.from(value)
		.map((char, index) => maskChar(char, index + seed))
		.join("");

const maskJobForBackdrop = (job: Job, jobIndex: number): BackdropJob => {
	const seed = jobIndex * 11;
	return {
		company: maskText(job.company, seed + 1),
		location: maskText(job.location, seed + 2),
		pay: maskText(job.pay, seed + 3),
		tags: job.tags.map((tag, tagIndex) => maskText(tag, seed + 4 + tagIndex)),
		title: maskText(job.title, seed + 8),
	};
};

export const maskJobsForBackdrop = (jobs: Job[]): BackdropJob[] =>
	jobs.map(maskJobForBackdrop);
