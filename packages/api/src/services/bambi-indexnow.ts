// IndexNow(빙·네이버 계열 즉시 색인) 핑. 공개 콘텐츠가 노출 상태로 들어가거나 빠질 때
// 해당 URL을 검색엔진에 알려 재크롤을 앞당긴다. 공개 URL은 /jobs 지역·업종 랜딩과
// /board 공개 게시판(목록·글 상세)뿐이다 — 공고 상세는 로그인 게이트 뒤라 핑 대상이 아니다.
//
// 전량 best-effort다. 키가 없으면 no-op, 실패는 warn 로그만 남기고 예외를 호출 경로로
// 절대 전파하지 않는다(색인 제출이 게시·검수 트랜잭션을 막으면 안 된다).
//
// INDEXNOW_KEY·CORS_ORIGIN은 @bambi-app/env 대신 process.env에서 호출 시점에 직접 읽는다
// (proxy.ts와 같은 관용) — 선택 값이라 검증이 불필요하고, 순수 빌더가 env 모듈 없이도
// 단위 테스트되게 한다.

const INDEXNOW_ENDPOINT = "https://api.indexnow.org/indexnow";
const TIMEOUT_MS = 5000;
const TRAILING_SLASH = /\/$/;

// 지역 마스터코드(법정동코드)→슬러그. apps/web/src/lib/bambi/job-landing.ts의
// JOB_LANDING_REGIONS를 미러링한 사본이다 — api는 web을 import할 수 없어(web이 api에
// 의존한다) 여기 둔다. 시/도 슬러그가 늘면 양쪽을 함께 고친다.
const REGION_SLUG_BY_CODE: Record<string, string> = {
	"1100000000": "seoul",
	"4100000000": "gyeonggi",
	"2800000000": "incheon",
	"2600000000": "busan",
	"2700000000": "daegu",
	"2900000000": "gwangju",
	"3000000000": "daejeon",
	"3100000000": "ulsan",
	"5100000000": "gangwon",
	"4300000000": "chungbuk",
	"4400000000": "chungnam",
	"5200000000": "jeonbuk",
	"4600000000": "jeonnam",
	"4700000000": "gyeongbuk",
	"4800000000": "gyeongnam",
	"5000000000": "jeju",
};

// 업종 enum(job_industry_category)→슬러그. job-landing.ts의 INDUSTRY_SLUGS 사본이다.
const INDUSTRY_SLUG_BY_CATEGORY: Record<string, string> = {
	BAR: "bar",
	기타: "etc",
	노래주점: "karaoke-bar",
	다방: "dabang",
	단란주점: "danran",
	룸싸롱: "room-salon",
	마사지: "massage",
	요정: "yojeong",
	"텐프로/쩜오": "ten-pro",
};

// 공개 게시판 key→URL 슬러그. community.ts의 PUBLIC_COMMUNITY_BOARDS + web
// COMMUNITY_BOARDS 슬러그(work_talk→work-talk)를 미러링한다. 비공개 게시판 key는
// 여기 없어 자연히 no-op이 된다(공개 URL만 핑).
const PUBLIC_BOARD_SLUG_BY_KEY: Record<string, string> = {
	notice: "notice",
	free: "free",
	work_talk: "work-talk",
};

// 공고 한 건의 공개 노출 변화가 영향을 주는 랜딩 경로: 지역×업종 + 지역 + /jobs 인덱스.
// 지역 코드가 랜딩 표에 없으면(수집·비표준 코드) 인덱스만 핑한다.
export const jobLandingPingPaths = ({
	industryCategory,
	regionCode,
}: {
	industryCategory: string | null;
	regionCode: string | null;
}): string[] => {
	const paths = ["/jobs"];
	const region = regionCode ? REGION_SLUG_BY_CODE[regionCode] : undefined;
	if (region) {
		paths.push(`/jobs/${region}`);
		const industry = industryCategory
			? INDUSTRY_SLUG_BY_CATEGORY[industryCategory]
			: undefined;
		if (industry) {
			paths.push(`/jobs/${region}/${industry}`);
		}
	}
	return paths;
};

// 공개 게시판 글의 발행·수정·숨김이 영향을 주는 경로: 글 상세 + 게시판 목록.
// 비공개 게시판이면 빈 배열(핑 안 함).
export const communityPostPingPaths = ({
	board,
	postId,
}: {
	board: string;
	postId: string;
}): string[] => {
	const slug = PUBLIC_BOARD_SLUG_BY_KEY[board];
	return slug ? [`/board/${slug}/${postId}`, `/board/${slug}`] : [];
};

// 순수 빌더 — 핑 요청 페이로드를 만든다. 키가 없거나(no-op) 대상 경로가 없으면 null.
// keyLocation·host는 web이 키 파일을 서빙하는 공개 오리진(env.CORS_ORIGIN) 기준이다.
export const buildIndexNowRequest = ({
	base,
	key,
	paths,
}: {
	base: string;
	key: string | undefined;
	paths: string[];
}): { body: string; endpoint: string } | null => {
	if (!key || paths.length === 0) {
		return null;
	}
	const origin = base.replace(TRAILING_SLASH, "");
	const host = new URL(origin).host;
	const urlList = [...new Set(paths)].map((path) => `${origin}${path}`);
	return {
		endpoint: INDEXNOW_ENDPOINT,
		body: JSON.stringify({
			host,
			key,
			keyLocation: `${origin}/${key}.txt`,
			urlList,
		}),
	};
};

// fire-and-forget 핑. 절대 await하지 않고, 동기·비동기 어느 예외도 호출 경로로 새지 않는다.
export function pingIndexNow(paths: string[]): void {
	// dev·test에서는 로컬 .env에 키가 있어도 실발송하지 않는다 — 프로덕션에서만 실핑.
	if (process.env.NODE_ENV !== "production") {
		return;
	}
	try {
		const request = buildIndexNowRequest({
			base: process.env.CORS_ORIGIN ?? "",
			key: process.env.INDEXNOW_KEY,
			paths,
		});
		// 키 미설정 or 대상 없음 → 조용히 no-op.
		if (!request) {
			return;
		}
		fetch(request.endpoint, {
			body: request.body,
			headers: { "Content-Type": "application/json; charset=utf-8" },
			method: "POST",
			signal: AbortSignal.timeout(TIMEOUT_MS),
		})
			.then((response) => {
				if (!response.ok) {
					console.warn(`[indexnow] 핑 실패: HTTP ${response.status}`);
				}
			})
			.catch((error) => {
				console.warn("[indexnow] 핑 오류", error);
			});
	} catch (error) {
		console.warn("[indexnow] 핑 페이로드 생성 실패", error);
	}
}

// 공고 노출 전이용 래퍼(지역·업종은 jobPost 행에서 그대로 받는다).
export function pingJobLanding(job: {
	industryCategory: string | null;
	regionCode: string | null;
}): void {
	pingIndexNow(jobLandingPingPaths(job));
}

// 공개 게시판 글 전이용 래퍼. 전이 핸들러의 반환 행({board,id,isLocked})을 그대로 받으며,
// 행이 없으면(undefined) no-op이라 호출부가 별도 가드를 두지 않아도 된다.
// 잠금 글(비밀글)은 공개 목록에서 필터되고 상세가 404라 어떤 공개 URL도 바뀌지 않는다 —
// 상세·목록 모두 핑 대상이 아니므로 통째로 건너뛴다.
export function pingCommunityPost(
	post: { board: string; id: string; isLocked: boolean } | null | undefined
): void {
	if (!post || post.isLocked) {
		return;
	}
	pingIndexNow(communityPostPingPaths({ board: post.board, postId: post.id }));
}
