// 비로그인 화면 뒤의 장식용 배경. 로그인한 사용자가 보는 /seeker 마켓플레이스를
// 헤더까지 정적으로 복제한다 — 인증 버튼을 누를 이유("인증하면 이 화면이 열린다")가
// 화면에 실물로 존재하게 하는 것이 이 배경의 역할이다.
//
// 실제 셸(ResponsiveAppShell·SeekerAppShell)을 가져다 쓰지 않는다: 클라이언트 컴포넌트에
// 컨텍스트(useSeekerFilters)와 상호작용이 얽혀 있어 배경에 쓰면 컨텍스트 오류가 나거나
// 죽은 인터랙션이 생긴다. 같은 토큰·간격·반경을 쓴 정적 복제본만 둔다.
//
// 보안 경계: 마스킹이 필요한 건 공고 데이터(업소명·제목·지역·급여)뿐이고, 그건 서버에서
// 이미 더미 한글로 치환된 BackdropJob으로만 들어온다(lib/bambi/auth-backdrop.ts). 헤더
// 로고·내비 라벨 같은 정적 UI 문구는 공고 데이터가 아니므로 실제 문자열을 쓴다. 광고
// 배너도 같은 경계다 — 실제 배너 이미지는 업소명·문구가 픽셀에 박혀 있어 쓰지 않는다.
// 이 경계를 넘지 말 것.
//
// 블러는 연출일 뿐 가드가 아니다. aria-hidden + inert + pointer-events-none으로 클릭·탭
// 이동·스크린리더 접근을 한 번에 막는다.

// biome-ignore-all lint/suspicious/noArrayIndexKey: 재정렬되지 않는 장식용 정적 목록이고, 마스킹된 값은 서로 같을 수 있어 인덱스 외에 안정적인 키가 없다

import { cn } from "@bambi-app/ui/lib/utils";
import type { BackdropJob } from "@/lib/bambi/auth-backdrop";
import { SEEKER_CONTENT_MAX_W } from "@/lib/bambi/layout";
import { Badge, Logo } from "../ds";
import { MapPinIcon, Search2 } from "../icons";

// 실제 헤더(DEFAULT_NAV_ITEMS)와 같은 라벨. 탐색 탭은 마켓플레이스에서 제거됐지만
// 흐릿한 장식 배경이라 예전 라벨을 그대로 둔다.
const NAV_ITEMS = ["채용정보", "수다방", "고객센터"] as const;
const DISCOVERY_TABS = [
	"전체",
	"지역별",
	"업종별",
	"지도",
	"오늘 본 공고",
] as const;

// 로그인 상태 seeker 헤더의 우측 액션(채팅·내 정보)과 같은 형태.
const HEADER_ACTION_CLASS =
	"inline-flex h-10 items-center rounded-lg border border-border bg-background px-4 font-bold text-sm";

// VisualJobCard의 등급별 테두리. 상단 행만 유료 노출(스페셜) 톤을 줘서 실제 목록의
// 티어 구조가 흐릿하게나마 읽히도록 한다.
const cardToneClass = (index: number) =>
	index < 4 ? "border-coral-300" : "border-border";

function BackdropHeader() {
	return (
		<div className="border-border border-b bg-background">
			<div
				className={cn(
					"mx-auto flex h-16 items-center gap-3 px-6 lg:gap-7",
					SEEKER_CONTENT_MAX_W
				)}
			>
				<Logo lang="ko" size="md" />
				<nav className="flex items-center gap-1">
					{NAV_ITEMS.map((label, index) => (
						<span
							className={cn(
								"rounded-md px-3 py-2 font-bold text-muted-foreground text-sm",
								index === 0 && "bg-muted text-foreground"
							)}
							key={label}
						>
							{label}
						</span>
					))}
				</nav>
				<div className="ml-auto flex items-center gap-2">
					{/* 헤더 검색창(SeekerHeaderSearch) 복제 — 폭·반경·톤 동일. */}
					<span className="relative inline-flex w-48 items-center">
						<span className="absolute left-3 inline-flex size-4 text-muted-foreground">
							<Search2 />
						</span>
						<span className="flex h-10 w-full items-center rounded-lg bg-secondary pl-9 font-medium text-muted-foreground text-sm">
							검색
						</span>
					</span>
					<span className={HEADER_ACTION_CLASS}>채팅</span>
					<span className={HEADER_ACTION_CLASS}>내 정보</span>
				</div>
			</div>
		</div>
	);
}

// 프리미엄 배너 면. 실제 광고 이미지(AdBannerItem.imageUrl)는 업소가 올린 사진이라
// 업소명·문구가 픽셀에 박혀 있고, 그걸 깔면 블러를 걷었을 때 실제 광고가 그대로 읽힌다.
// 그래서 비율(7:3)·반경·배치만 실제 배너에서 가져오고 내용은 그라디언트 + 마스킹된
// 공고 문자열로 채운다. 배경은 어디까지나 카드 뒤 장식이라 톤도 한 칸은 코럴, 한 칸은
// 잉크로 나눠 한쪽으로 과하게 쏠리지 않게 한다.
const BANNER_TONE_CLASS = [
	"from-coral-500 to-coral-700",
	"from-ink-700 to-ink-900",
] as const;

function BackdropPremiumBanners({ jobs }: { jobs: BackdropJob[] }) {
	const banners = jobs.slice(0, 2);
	if (banners.length === 0) {
		return null;
	}

	return (
		<section className="mb-6 flex flex-col gap-3">
			<div className="flex items-center gap-2">
				<Badge tone="pending">프리미엄</Badge>
				<span className="font-extrabold text-base">프리미엄 광고</span>
			</div>
			<div className="grid grid-cols-2 gap-3">
				{banners.map((job, index) => (
					<div
						className={cn(
							"flex aspect-[7/3] w-full flex-col justify-end gap-1 rounded-lg border border-border bg-gradient-to-br p-4 text-white",
							BANNER_TONE_CLASS[index % BANNER_TONE_CLASS.length]
						)}
						key={index}
					>
						<span className="truncate font-extrabold text-xl">
							{job.company}
						</span>
						<span className="truncate font-bold text-sm opacity-90">
							{job.pay} · {job.location}
						</span>
					</div>
				))}
			</div>
		</section>
	);
}

// VisualJobCard의 리듬을 따른다: 썸네일 + 업소명/지역 + 하단 급여 칩.
function BackdropCard({ index, job }: { index: number; job: BackdropJob }) {
	return (
		<article
			className={cn(
				"flex flex-col gap-2 overflow-hidden rounded-lg border bg-card p-2",
				cardToneClass(index)
			)}
		>
			<div className="flex items-start gap-3">
				{index % 2 === 0 ? (
					// 커버 이미지가 있는 공고 자리(JobCoverImage와 같은 치수).
					<span className="h-14 w-30 shrink-0 rounded-md border border-white bg-gradient-to-br from-secondary to-muted" />
				) : (
					<span className="flex size-14 shrink-0 items-center justify-center rounded-md border border-white bg-secondary font-extrabold text-coral-700 text-sm">
						{job.company.slice(0, 2)}
					</span>
				)}
				<span className="flex min-w-0 flex-1 flex-col gap-1">
					<span className="truncate font-extrabold text-sm leading-snug">
						{job.company}
					</span>
					<span className="flex min-w-0 items-center gap-1 text-muted-foreground text-xs">
						<span className="inline-flex size-3 shrink-0">
							<MapPinIcon />
						</span>
						<span className="truncate">{job.location}</span>
					</span>
				</span>
			</div>
			<div className="mt-auto flex">
				<span className="flex h-9 min-w-0 items-center rounded-md border border-border bg-background px-3.5 font-extrabold text-base text-coral-600 leading-none">
					<span className="truncate">{job.pay}</span>
				</span>
			</div>
		</article>
	);
}

export function AuthBackdrop({ jobs }: { jobs: BackdropJob[] }) {
	return (
		// 모바일에서는 배경을 감춘다 — 인증 카드를 문서 흐름에 남겨야 긴 가입 폼이
		// 정상적으로 스크롤되는데, 배경을 깔려면 카드를 absolute로 띄워야 해서 그 흐름이
		// 깨진다. 좁은 화면에서 뒤에 깔린 목록은 어차피 카드에 거의 다 가린다.
		//
		// blur-md(12px)는 본문 글자(12~20px)의 획을 완전히 뭉개 한 글자도 읽히지 않게
		// 하면서 카드·배너 같은 200px 단위 덩어리의 윤곽은 남긴다. 이전 blur-xs(4px)로는
		// 마스킹된 글자가 그대로 읽혀 격자 무늬처럼 보였다.
		<div
			aria-hidden
			className="pointer-events-none hidden select-none blur-md md:block"
			inert
		>
			<BackdropHeader />
			<div className={cn("mx-auto w-full px-6 py-10", SEEKER_CONTENT_MAX_W)}>
				{/* 실제 목록과 같은 순서: 프리미엄 광고 → 탐색 탭 → 추천 공고.
				    좌우 사이드 레일은 1720px 이상에서만 뜨는 데다 배경은 3컬럼 셸이
				    아니라서 생략한다. */}
				<BackdropPremiumBanners jobs={jobs} />
				<div className="mb-5 flex gap-2">
					{DISCOVERY_TABS.map((label, index) => (
						<span
							className={cn(
								"flex h-9 shrink-0 items-center rounded-lg px-3 font-bold text-sm",
								index === 0
									? "bg-foreground text-background"
									: "border border-border bg-card text-muted-foreground"
							)}
							key={label}
						>
							{label}
						</span>
					))}
				</div>
				<div className="mb-3 flex items-center justify-between">
					<span className="font-extrabold text-lg">추천 공고</span>
					<span className="font-semibold text-muted-foreground text-sm">
						{jobs.length}개 · 실시간
					</span>
				</div>
				<div className="grid grid-cols-3 gap-3 xl:grid-cols-4">
					{jobs.map((job, index) => (
						<BackdropCard index={index} job={job} key={index} />
					))}
				</div>
			</div>
		</div>
	);
}
