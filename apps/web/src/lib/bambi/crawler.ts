// 크롤링 관련 DB enum의 화면 표기. enum 원값을 그대로 렌더하지 않기 위한 라벨 맵이다.

export const CRAWLED_POST_STATUS_LABELS = {
	active: "수집됨",
	expired: "만료",
	needs_review: "업종 검토 대기",
} as const;

export const CRAWL_RUN_STATUS_LABELS = {
	aborted_low_yield: "수율 미달 중단",
	failed: "실패",
	running: "진행 중",
	success: "성공",
} as const;

// 회차 상태별 배지 색. aborted_low_yield는 실패와 성격이 다르다 — 데이터를 건드리지 않고
// 스스로 멈춘 것이라, 장애가 아니라 "상대 마크업이 바뀌었으니 파서를 보라"는 신호다.
export const CRAWL_RUN_STATUS_VARIANTS = {
	aborted_low_yield: "destructive",
	failed: "destructive",
	running: "secondary",
	success: "outline",
} as const;

export const CRAWL_SOURCE_SITE_LABELS = {
	foxalba: "여우알바",
} as const;

// 미설정이면 서버 기본값을 쓴다는 사실을 폼이 그대로 보여주도록, 표기를 한 곳에 모은다.
export const formatCrawlTimestamp = (value: Date | string | null): string => {
	if (!value) {
		return "아직 실행된 적 없음";
	}

	const date = typeof value === "string" ? new Date(value) : value;

	return Number.isNaN(date.getTime())
		? "알 수 없음"
		: date.toLocaleString("ko-KR");
};
