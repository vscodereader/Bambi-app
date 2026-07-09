// 밤비 앱 공통 콘텐츠 폭. 헤더·목록·상세가 이 상수를 공유해 폭 기준을 정렬한다.
// 채용(seeker)·구인자(employer)·운영자(moderator) 헤더가 모두 이 고정폭을 쓴다.
// 임의 단독 px 금지 컨벤션 준수 — min() 계산형.

// 목록·상세 컨테이너용(모바일 전체폭 → md 이상에서 고정폭).
export const APP_CONTENT_WIDTH = "md:max-w-[min(92%,1120px)]";

// 헤더(ResponsiveAppShell) 데스크톱 바용 — 이미 md:block 헤더라 breakpoint 접두사 없이 사용.
export const APP_CONTENT_MAX_W = "max-w-[min(92%,1120px)]";

// 채용(seeker) 별칭 — 기존 참조·테스트 호환용.
export const SEEKER_CONTENT_WIDTH = APP_CONTENT_WIDTH;
export const SEEKER_CONTENT_MAX_W = APP_CONTENT_MAX_W;
