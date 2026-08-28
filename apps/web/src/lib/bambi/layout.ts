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

// 메인·공개 랜딩 등에서 공유하는 초광폭 좌우 광고 레일 골격. 레일 폭과 노출 기준을
// 화면마다 복사하면 한 화면만 달라질 수 있으므로 단일 클래스 묶음으로 유지한다.
export const SIDE_AD_RAIL_LAYOUT_CLASS =
	"mx-auto flex w-full justify-center gap-5";
export const SIDE_AD_RAIL_ASIDE_CLASS =
	"hidden w-[259px] shrink-0 min-[1720px]:block";
export const SIDE_AD_RAIL_STICKY_CLASS = "sticky top-20";
