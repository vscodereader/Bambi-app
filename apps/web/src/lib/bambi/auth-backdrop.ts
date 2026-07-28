// 비로그인(anon) 화면의 블러 배경에 실을 데이터. 블러는 CSS라 devtools로 걷어낼 수
// 있으므로 연출일 뿐이고, 실제 가드는 여기서 문자열을 마스킹해 클라이언트로 아예
// 읽을 수 있는 값을 보내지 않는 것이다. 필드는 화이트리스트로 뽑는다 — Job에 새
// 필드가 생겨도 배경으로 새지 않는다.

import type { Job } from "./types";

// 배경 카드가 실제로 그리는 필드만 담는다 — 안 그리는 값까지 실어 보낼 이유가 없다.
export interface BackdropJob {
	company: string;
	location: string;
	pay: string;
	tags: string[];
	title: string;
}

const MASK_CHAR = "■";

// 같은 글자 수의 마스크로 치환한다. 카드 폭·줄바꿈이 실제 목록과 같아 보이되 내용은
// 남지 않는다. 이모지 등 서로게이트 페어를 한 글자로 세도록 Array.from을 쓴다.
const maskText = (value: string): string =>
	MASK_CHAR.repeat(Array.from(value).length);

const maskJobForBackdrop = (job: Job): BackdropJob => ({
	company: maskText(job.company),
	location: maskText(job.location),
	pay: maskText(job.pay),
	tags: job.tags.map(maskText),
	title: maskText(job.title),
});

export const maskJobsForBackdrop = (jobs: Job[]): BackdropJob[] =>
	jobs.map(maskJobForBackdrop);
