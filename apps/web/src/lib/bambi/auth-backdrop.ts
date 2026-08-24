// 비로그인(anon) 화면의 블러 배경에 실을 데이터. 필드는 화이트리스트로 뽑는다 —
// Job에 새 필드가 생겨도 배경으로 새지 않는다.
//
// 마스킹은 업소명(company)만 한다. 업소명은 로그인 후 열람이 제품 원칙이라 배경에서도
// 가려야 하지만, location·pay는 공개 랜딩(/jobs)에 이미 실값으로 노출돼 있어 배경에서만
// 숨기는 건 보안 이득이 없다. 그래서 나머지 필드는 원값을 그대로 싣는다.
//
// 마스킹을 company로 좁혀 얻는 실익은 둘: (a) 전 필드를 가짜 한국어로 마스킹하면 그 더미
// 텍스트가 색인돼 무의미 텍스트/클로킹 오인 리스크만 커지는데 그걸 없앤다. (b) 데스크톱·
// 소스 파싱 크롤러에 한해 실콘텐츠가 노출된다. 단, 이 배경 래퍼는 aria-hidden+inert에
// hidden md:block(모바일 우선 크롤러엔 display:none)이라 안정적으로 색인되는 실질 본문은
// 아니다 — 확실히 크롤되는 콘텐츠는 게이트 화면의 가시 소개 문단과 /jobs 링크다
// (seeker-auth-gate-screen.tsx).
//
// company 마스크는 진짜 한국어처럼 보이는 더미다(예전엔 ■ 격자였다). 블러가 걸린
// 상태에서는 실제 목록과 구분되지 않고, 블러를 걷어내도 가짜 업소명만 남는다.

import type { Job } from "./types";

// 배경 카드가 실제로 그리는 필드만 담는다 — 안 그리는 값까지 실어 보낼 이유가 없다.
export interface BackdropJob {
	company: string;
	location: string;
	pay: string;
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

const maskJobForBackdrop = (job: Job, jobIndex: number): BackdropJob => ({
	// 업소명만 마스킹. seed로 카드마다 다른 더미 음절이 나오게 한다.
	company: maskText(job.company, jobIndex * 11 + 1),
	location: job.location,
	pay: job.pay,
});

export const maskJobsForBackdrop = (jobs: Job[]): BackdropJob[] =>
	jobs.map(maskJobForBackdrop);
