import { env } from "@bambi-app/env/native";
import { Ionicons } from "@expo/vector-icons";
import {
	keepPreviousData,
	useInfiniteQuery,
	useQuery,
} from "@tanstack/react-query";
import { useNetworkState } from "expo-network";
import { type Href, Link } from "expo-router";
import {
	Button,
	Chip,
	cn,
	Skeleton,
	Spinner,
	Surface,
	useThemeColor,
} from "heroui-native";
import {
	type ComponentProps,
	type ReactElement,
	useEffect,
	useRef,
	useState,
} from "react";
import {
	AccessibilityInfo,
	Image,
	Pressable,
	RefreshControl,
	ScrollView,
	SectionList,
	type SectionListData,
	Text,
	View,
} from "react-native";
import { Pill, StateCard } from "@/src/components/bambi-screen";
import {
	adPeriodTier,
	buildSeekerJobSections,
	describeJobForScreenReader,
	formatAdPeriod,
	industryOptions,
	NATIVE_AD_PERIOD_TIERS,
	type NativeAdPeriodTier,
	type NativeIndustryOption,
	type NativeJobSectionKey,
	type NativeSeekerJob,
	resolveJobCoverUri,
} from "@/src/lib/bambi-native";
import { orpc } from "@/src/lib/orpc";

const JOB_PAGE_SIZE = 20;
// 스켈레톤은 순서가 바뀌지 않지만 인덱스를 key로 쓰지 않으려고 고정 키를 둔다.
const SKELETON_ROW_KEYS = ["s1", "s2", "s3", "s4", "s5", "s6"];

// 전체 공고 커서. 자체 공고 블록과 수집 블록이 순서대로 이어붙는 구조라 위치가 두 개다.
interface OrganicOffset {
	crawled: number;
	jobPost: number;
}

type JobSection = ReturnType<typeof buildSeekerJobSections>[number];

function NoticeBanner({
	action,
	icon,
	message,
}: {
	action?: ReactElement;
	icon: ComponentProps<typeof Ionicons>["name"];
	message: string;
}) {
	const warningColor = useThemeColor("warning");

	return (
		<Surface
			className="mx-4 flex-row items-center gap-3 rounded-2xl p-3"
			variant="tertiary"
		>
			<Ionicons color={warningColor} name={icon} size={18} />
			<Text className="flex-1 text-foreground text-sm leading-5">
				{message}
			</Text>
			{action}
		</Surface>
	);
}

// 이 화면의 유일한 탐색 컨트롤. Chip이 PressableProps를 상속하므로 Pressable로 감싸지
// 않고 터치·접근성 속성을 Chip에 직접 건다.
function IndustryChipRail({
	industry,
	onSelect,
}: {
	industry: null | NativeIndustryOption;
	onSelect: (option: null | NativeIndustryOption) => void;
}) {
	const accentForegroundColor = useThemeColor("accent-foreground");

	return (
		<ScrollView horizontal showsHorizontalScrollIndicator={false}>
			{/* hitSlop은 부모 뷰 경계를 넘지 못한다(RN ViewPropTypes: "The touch area never
			    extends past the parent view bounds"). Chip md는 py-1 + text-sm라 약 28dp이므로
			    세로 여백이 없으면 hitSlop이 통째로 잘린다. py-2.5(10dp)를 줘 28+20=48dp로
			    iOS HIG 44pt·Android 48dp를 함께 넘긴다. */}
			<View className="flex-row gap-2 px-4 py-2.5">
				{[null, ...industryOptions].map((option) => {
					const selected = industry === option;

					return (
						<Chip
							accessibilityLabel={`${option ?? "전체"} 업종 필터`}
							accessibilityRole="button"
							accessibilityState={{ selected }}
							color={selected ? "accent" : "default"}
							hitSlop={10}
							key={option ?? "all"}
							onPress={() => onSelect(option)}
							size="md"
							variant={selected ? "primary" : "soft"}
						>
							{/* 선택 상태를 색 채움 단독으로 전달하지 않는다(색약 대응). */}
							{selected ? (
								<Ionicons
									color={accentForegroundColor}
									name="checkmark"
									size={14}
								/>
							) : null}
							<Chip.Label>{option ?? "전체"}</Chip.Label>
						</Chip>
					);
				})}
			</View>
		</ScrollView>
	);
}

function SeekerListHeader({
	availableCount,
	industry,
	isFilterPending,
	isOffline,
	onRefetch,
	onSelectIndustry,
	showStaleBanner,
}: {
	availableCount: number | undefined;
	industry: null | NativeIndustryOption;
	isFilterPending: boolean;
	isOffline: boolean;
	onRefetch: () => void;
	onSelectIndustry: (option: null | NativeIndustryOption) => void;
	showStaleBanner: boolean;
}) {
	return (
		<View className="gap-3 pt-3 pb-2">
			<View className="flex-row items-center gap-2 px-4">
				{availableCount === undefined ? null : (
					<Text accessibilityLiveRegion="polite" className="text-muted text-sm">
						{`총 ${availableCount.toLocaleString("ko-KR")}개`}
					</Text>
				)}
				{isFilterPending ? <Spinner size="sm" /> : null}
			</View>
			{isOffline ? (
				<NoticeBanner
					icon="cloud-offline-outline"
					message="오프라인 상태예요. 마지막으로 불러온 공고를 보여드리고 있어요."
				/>
			) : null}
			{showStaleBanner ? (
				<NoticeBanner
					action={
						<Button onPress={onRefetch} size="sm" variant="tertiary">
							<Button.Label>다시 불러오기</Button.Label>
						</Button>
					}
					icon="alert-circle-outline"
					message="공고를 새로 불러오지 못해 마지막으로 받은 목록을 보여드리고 있어요."
				/>
			) : null}
			<IndustryChipRail industry={industry} onSelect={onSelectIndustry} />
		</View>
	);
}

function JobSectionHeader({
	section,
}: {
	section: SectionListData<NativeSeekerJob, JobSection>;
}) {
	return (
		<View
			accessibilityRole="header"
			className="flex-row items-center gap-2 bg-background px-4 py-2"
		>
			<View
				className={`h-4 w-1 rounded-full ${section.accentClassName}`}
				importantForAccessibility="no"
			/>
			<Text className="font-semibold text-base text-foreground">
				{section.title}
			</Text>
			<Text className="text-muted text-xs">{section.data.length}</Text>
		</View>
	);
}

function JobRowSkeleton() {
	return (
		<View className="px-4 pb-3">
			<Surface className="gap-3 rounded-2xl border border-border p-4">
				<View className="flex-row items-center gap-3">
					<Skeleton className="size-12 rounded-xl" />
					<View className="flex-1 gap-2">
						<Skeleton className="h-5 w-3/4 rounded-md" />
						<Skeleton className="h-4 w-1/2 rounded-md" />
					</View>
				</View>
				<Skeleton className="h-5 w-28 rounded-full" />
			</Surface>
		</View>
	);
}

// 웹 VisualJobCard의 톤 언어 이식 — 배경 틴트 없이 테두리 색만으로 유료 섹션을 구분한다
// (스페셜=coral, 급구=amber, 추천=blue). 섹션 헤더 액센트 바와 같은 축이라 새 색을 짓지 않는다.
const jobCardBorderClassNames = {
	organic: "border-border",
	recommended: "border-link/40",
	special: "border-accent/40",
	urgent: "border-warning/60",
} as const;

// 급여 단위 배지 톤도 웹과 동일 — 유료 섹션은 danger, 전체 공고는 중립.
const jobPayUnitTones = {
	organic: "neutral",
	recommended: "danger",
	special: "danger",
	urgent: "danger",
} as const;

// 공개 버킷 base URL. 순수 공고 커버는 storageKey만 내려오므로 이 값과 합쳐 URL을 만든다.
// 미설정(개발)이면 커버를 못 만들어 카드가 업소명 타일로 폴백한다.
const GCS_PUBLIC_BASE_URL = env.EXPO_PUBLIC_GCS_PUBLIC_BASE_URL;

// 커버 이미지가 없는 공고는 웹 카드와 동일하게 업소명 앞 두 글자 타일(size-14)로 폴백한다.
function JobCompanyTile({ name }: { name: string }) {
	return (
		<View className="size-14 shrink-0 items-center justify-center rounded-md bg-accent/10">
			<Text className="font-bold text-accent-soft-foreground text-sm dark:text-accent">
				{Array.from(name).slice(0, 2).join("")}
			</Text>
		</View>
	);
}

// 웹 VisualJobCard와 같은 커버 규격(h-14 w-30, object-fill). 수집 공고는 base64 data URI,
// 순수 공고는 공개 버킷 URL이다(resolveJobCoverUri가 출처를 가른다). 업소명이 옆에 텍스트로
// 있어 커버는 장식 이미지다 — 부모 카드가 접근성 트리에서 이미 가린다.
function JobCoverThumb({ uri }: { uri: string }) {
	return (
		<Image
			className="h-14 w-30 shrink-0 rounded-md border border-border"
			resizeMode="stretch"
			source={{ uri }}
		/>
	);
}

// 웹 useAdPeriodTiers 이식. 운영자 설정 등급을 읽어 등급 배지에 공급하고, 행이 없거나
// 로딩 중이면 상수 폴백으로 렌더한다. orpc react-query 캐시가 카드마다의 중복 요청을 하나로
// 합친다(웹처럼 같은 queryKey를 공유). 상수와 달리 운영자 행은 icon 프리셋 대신 iconImageUrl을
// 가질 수 있다 — 색(colorClass)은 native가 소비하지 않으므로 매핑에서 뺀다.
function useAdPeriodTiers(): readonly NativeAdPeriodTier[] {
	const query = useQuery(orpc.bambi.adPeriodTiers.list.queryOptions());
	const rows = query.data;

	if (!rows || rows.length === 0) {
		return NATIVE_AD_PERIOD_TIERS;
	}

	return rows.map((row) => ({
		icon: row.icon,
		iconImageUrl: row.iconImageUrl,
		label: row.label,
		maxDays: row.maxDays,
		minDays: row.minDays,
	}));
}

// 웹 JobAdPeriodBadge 이식 — 급여 행 오른쪽 끝의 누적 광고 배지(등급 아이콘 + "N회 N일").
// adPeriod가 없으면 카드가 렌더하지 않으므로 값이 있다고 가정한다. 색은 웹의 amber/slate
// 팔레트를 native heroui 토큰으로 옮긴다: 상위(왕관) 티어는 브랜드 accent, 그 외(메달)는
// warning. 텍스트는 밝은 표면 대비를 위해 라이트에서 -soft-foreground를 쓰고 다크에서 원색으로
// 되돌린다(Pill과 같은 규칙). Ionicons에 crown 글리프가 없어 왕관은 trophy(최상위 수상)로
// 대체한다. 운영자가 올린 아이콘(iconImageUrl, GIF 등)이 있으면 프리셋 대신 그 이미지를 그린다.
function JobAdPeriodBadge({
	adPeriod,
}: {
	adPeriod: NonNullable<NativeSeekerJob["adPeriod"]>;
}) {
	const tiers = useAdPeriodTiers();
	const tier = adPeriodTier(adPeriod.totalDays, tiers);
	const isTopTier = tier.icon === "crown";
	const accentColor = useThemeColor("accent");
	const warningColor = useThemeColor("warning");

	// 급여 텍스트는 shrink로 밀리므로 배지는 ml-auto로 급여 행 오른쪽 끝에 붙인다(새 행을
	// 만들지 않아 카드 높이는 그대로다). 카드 전체가 접근성 단일 노드라(부모가 descendants를
	// 숨긴다) 이 배지의 의미는 카드 accessibilityLabel이 대신 전달한다.
	return (
		<View className="ml-auto flex-row items-center gap-1">
			{tier.iconImageUrl ? (
				<Image
					className="size-5"
					resizeMode="contain"
					source={{ uri: tier.iconImageUrl }}
				/>
			) : (
				<Ionicons
					color={isTopTier ? accentColor : warningColor}
					name={isTopTier ? "trophy" : "medal"}
					size={16}
				/>
			)}
			<Text
				className={cn(
					"font-semibold text-sm",
					isTopTier
						? "text-accent-soft-foreground dark:text-accent"
						: "text-warning-soft-foreground dark:text-warning"
				)}
				numberOfLines={1}
			>
				{formatAdPeriod(adPeriod)}
			</Text>
		</View>
	);
}

function JobCardBody({
	job,
	sectionKey,
}: {
	job: NativeSeekerJob;
	sectionKey: NativeJobSectionKey;
}) {
	const mutedColor = useThemeColor("muted");
	const employerName = job.employerDisplayName ?? "밤비알바 구인자";
	const coverUri = resolveJobCoverUri(job, GCS_PUBLIC_BASE_URL);

	return (
		<View className="gap-3">
			<View className="flex-row items-center gap-3">
				{coverUri ? (
					<JobCoverThumb uri={coverUri} />
				) : (
					<JobCompanyTile name={employerName} />
				)}
				<View className="flex-1 gap-1">
					<Text
						className="font-bold text-base text-foreground leading-snug"
						numberOfLines={2}
					>
						{job.title}
					</Text>
					<View className="flex-row items-center gap-1">
						<Ionicons color={mutedColor} name="location-outline" size={12} />
						<Text className="flex-1 text-muted text-xs" numberOfLines={1}>
							{employerName} · {job.region} · {job.workSchedule ?? "일정 협의"}
						</Text>
					</View>
				</View>
			</View>
			{/* 급여가 카드 앵커 — 웹처럼 단위는 배지로 떼고 금액만 코럴로 강조한다.
			    코럴 원색은 흰 카드 위 대비가 모자라 Pill과 같은 규칙(라이트=soft-foreground,
			    다크=원색)을 쓴다. */}
			<View className="flex-row items-center gap-2">
				{job.payAmount !== null && job.payUnit ? (
					<Pill tone={jobPayUnitTones[sectionKey]}>{job.payUnit}</Pill>
				) : null}
				<Text
					className="shrink font-bold text-accent-soft-foreground text-base dark:text-accent"
					numberOfLines={1}
				>
					{job.payAmount === null
						? "급여 협의"
						: `${job.payAmount.toLocaleString("ko-KR")}원`}
				</Text>
				{/* 당일면접·인증완료 Pill을 걷어낸 자리 — 유료 카드엔 누적 광고 등급 배지가
				    들어간다(웹 VisualJobCard와 같은 축). adPeriod가 없는 공고(전체·수집)는
				    아무것도 그리지 않아 카드 시각이 그대로다. */}
				{job.adPeriod ? <JobAdPeriodBadge adPeriod={job.adPeriod} /> : null}
			</View>
		</View>
	);
}

function JobRow({
	job,
	sectionKey,
}: {
	job: NativeSeekerJob;
	sectionKey: NativeJobSectionKey;
}) {
	// 기본 Surface(흰 카드)+톤 테두리 = 웹 카드의 border bg-card 조합. 목록 배경이
	// bg-background(흰색)라 secondary 회색 대신 테두리로 카드 경계를 세운다.
	const cardClassName = cn(
		"rounded-2xl border p-4",
		jobCardBorderClassNames[sectionKey]
	);

	// 카드에서 당일면접·인증완료 Pill을 걷어냈으므로 스크린리더 낭독에서도 뺀다(badges=[]).
	// 대신 유료 카드에 보이는 누적 광고 등급을 웹처럼 "광고 N회 · 누적 N일"로 덧붙인다 —
	// 카드 본문은 부모가 접근성 트리에서 숨기므로 이 라벨이 배지 의미를 대신 전달한다.
	const accessibilityLabel = job.adPeriod
		? `${describeJobForScreenReader(job, [])}, 광고 ${job.adPeriod.count}회 · 누적 ${job.adPeriod.totalDays}일`
		: describeJobForScreenReader(job, []);

	// 수집 공고는 job_post에 없어 jobs.getById가 NOT_FOUND다 — 웹처럼 crawledJobs.getById를
	// 쓰는 수집 전용 상세(jobs/crawled/[id])로 보낸다. 순수 공고는 jobs/[id] 그대로.
	const href = (job.source === "crawled"
		? { pathname: "/(seeker)/jobs/crawled/[id]", params: { id: job.id } }
		: {
				pathname: "/(seeker)/jobs/[id]",
				params: { id: job.id },
			}) as unknown as Href;

	return (
		<View className="px-4 pb-3">
			<Link asChild href={href}>
				<Pressable
					accessibilityLabel={accessibilityLabel}
					accessibilityRole="button"
					accessible
					className="rounded-2xl active:opacity-75"
				>
					<Surface className={cardClassName}>
						<View importantForAccessibility="no-hide-descendants">
							<JobCardBody job={job} sectionKey={sectionKey} />
						</View>
					</Surface>
				</Pressable>
			</Link>
		</View>
	);
}

// 화면 전체를 갈아치우지 않고 목록의 빈 자리에서만 로딩·오류·빈결과를 다룬다.
function SeekerListEmpty({
	hasErrorWithoutCache,
	industry,
	isOffline,
	isPending,
	onRefetch,
	onResetIndustry,
}: {
	// 캐시가 남아 있으면 헤더 stale 배너가 전담한다 — 오류 카드까지 띄우면 같은 실패가
	// 배너·카드로 두 번 보인다.
	hasErrorWithoutCache: boolean;
	industry: null | NativeIndustryOption;
	isOffline: boolean;
	isPending: boolean;
	onRefetch: () => void;
	onResetIndustry: () => void;
}) {
	if (isPending) {
		return (
			<View accessibilityLabel="공고를 불러오는 중" accessible>
				{SKELETON_ROW_KEYS.map((key) => (
					<JobRowSkeleton key={key} />
				))}
			</View>
		);
	}

	if (hasErrorWithoutCache) {
		return (
			<View className="px-4 py-6">
				<StateCard
					action={
						<Button onPress={onRefetch} size="sm">
							<Button.Label>다시 시도</Button.Label>
						</Button>
					}
					description={
						isOffline
							? "네트워크에 연결한 뒤 다시 시도해 주세요."
							: "네트워크 연결을 확인한 뒤 다시 시도해 주세요."
					}
					title="공고를 불러오지 못했어요"
				/>
			</View>
		);
	}

	return (
		<View className="px-4 py-6">
			<StateCard
				action={
					industry === null ? null : (
						<Button onPress={onResetIndustry} size="sm" variant="secondary">
							<Button.Label>필터 초기화</Button.Label>
						</Button>
					)
				}
				description={
					industry === null
						? "새 공고는 검수 승인 즉시 이 화면에 올라옵니다. 잠시 뒤 다시 확인해 주세요."
						: "업종 필터를 전체로 바꾸거나 잠시 뒤 다시 확인해 주세요."
				}
				title="조건에 맞는 공고가 없어요"
			/>
		</View>
	);
}

function SeekerListFooter({
	hasNextPage,
	hasSections,
	isFetchNextPageError,
	isFetchingNextPage,
	onRetryNextPage,
}: {
	hasNextPage: boolean;
	hasSections: boolean;
	isFetchNextPageError: boolean;
	isFetchingNextPage: boolean;
	onRetryNextPage: () => void;
}) {
	if (isFetchingNextPage) {
		return (
			<View className="items-center py-4">
				<Spinner size="sm" />
			</View>
		);
	}

	// 다음 페이지가 실패해도 받은 공고는 그대로 두고 재개 버튼만 준다.
	if (isFetchNextPageError) {
		return (
			<View className="items-center gap-2 px-4 py-4">
				<Text className="text-muted text-sm">
					다음 공고를 불러오지 못했어요.
				</Text>
				<Button onPress={onRetryNextPage} size="sm" variant="secondary">
					<Button.Label>공고 더 불러오기</Button.Label>
				</Button>
			</View>
		);
	}

	if (hasNextPage || !hasSections) {
		return null;
	}

	return (
		<View className="gap-3 px-4 py-4">
			<Text className="text-center text-muted text-xs">
				마지막 공고까지 모두 확인했어요.
			</Text>
			<Surface className="rounded-2xl p-4" variant="secondary">
				<Text className="text-muted text-sm leading-5">
					연락처는 면접 일정이 확정된 뒤 본인이 선택할 때만 공개됩니다.
				</Text>
			</Surface>
		</View>
	);
}

export default function SeekerHomeScreen() {
	const listRef = useRef<SectionList<NativeSeekerJob, JobSection>>(null);
	const [industry, setIndustry] = useState<null | NativeIndustryOption>(null);
	const accentColor = useThemeColor("accent");
	const networkState = useNetworkState();
	const configQuery = useQuery(
		orpc.bambi.siteSettings.getExposureSectionConfig.queryOptions()
	);
	const jobsQuery = useInfiniteQuery(
		orpc.bambi.jobs.list.infiniteOptions({
			getNextPageParam: (lastPage) => lastPage.nextOrganicOffset ?? undefined,
			initialPageParam: undefined as OrganicOffset | undefined,
			input: (pageParam) => ({
				industryCategory: industry ?? undefined,
				limit: JOB_PAGE_SIZE,
				organicOffset: pageParam,
			}),
			placeholderData: keepPreviousData,
		})
	);

	const isOffline = networkState.isInternetReachable === false;
	// 웹과 같은 프로시저·같은 기본값(급구 섹션은 운영자가 켜야 보인다).
	const urgentHidden = configQuery.data?.urgentHidden ?? true;
	const sections = buildSeekerJobSections(jobsQuery.data?.pages ?? [], {
		urgentHidden,
	});
	const availableCount = jobsQuery.data?.pages[0]?.availableCount;
	// 배너는 한 장만 띄운다(오프라인 > 갱신 실패). 다음 페이지 실패는 푸터가 전담한다.
	const showStaleBanner =
		jobsQuery.isError &&
		jobsQuery.data !== undefined &&
		!(isOffline || jobsQuery.isFetchNextPageError);

	// accessibilityLiveRegion은 Android 전용이라 iOS VoiceOver에는 결과 교체가 무음이다.
	// 확정된 결과(placeholder가 아닌 데이터)가 도착했을 때, 그리고 마지막으로 읽어 준
	// 업종과 다를 때만 발화한다 — 다음 페이지 로드·pull-to-refresh·재렌더는 업종이 그대로라
	// 조용하고, 필터를 되돌리면 다시 읽어 준다. 초기값 undefined는 "아직 한 번도 안 읽음".
	const announcedIndustryRef = useRef<undefined | null | NativeIndustryOption>(
		undefined
	);

	useEffect(() => {
		if (jobsQuery.isPlaceholderData || availableCount === undefined) {
			return;
		}

		if (announcedIndustryRef.current === industry) {
			return;
		}

		announcedIndustryRef.current = industry;
		AccessibilityInfo.announceForAccessibility(
			`${industry ?? "전체"} 업종 공고 ${availableCount.toLocaleString("ko-KR")}개`
		);
	}, [availableCount, industry, jobsQuery.isPlaceholderData]);

	const refetchJobs = () => {
		jobsQuery.refetch();
	};

	const selectIndustry = (option: null | NativeIndustryOption) => {
		setIndustry(option);
		// scrollToLocation은 빈 섹션에서 throw하므로 스크롤 응답자를 직접 쓴다.
		listRef.current?.getScrollResponder()?.scrollTo({ animated: true, y: 0 });
	};

	// 두 경로가 같은 가드를 공유하면 안 된다.
	// - 공통 가드: hasNextPage && !isFetchingNextPage. fetchNextPage는 cancelRefetch
	//   기본값이 true라 진행 중에 다시 부르면 in-flight 요청을 취소하고 새로 쏘는데,
	//   fetchNextPage 직후 푸터 Spinner가 렌더되며 contentLength가 바뀌어 VirtualizedList가
	//   onEndReached를 한 번 더 부른다 → 매 페이지마다 요청이 중복된다.
	// - 자동(onEndReached) 전용 가드: !(isFetchNextPageError || isOffline). 실패·오프라인
	//   뒤 스크롤만으로 무한 재시도가 도는 것을 막는다.
	// 이 억제를 푸터 버튼에도 걸면 isFetchNextPageError를 풀어 줄 fetch 자체가 막혀
	// 버튼이 영구 no-op이 된다(순환 데드락) — 사용자의 명시적 재시도는 그대로 통과시킨다.
	const canFetchNextPage = () =>
		jobsQuery.hasNextPage && !jobsQuery.isFetchingNextPage;

	const loadNextPageOnScroll = () => {
		if (canFetchNextPage() && !(jobsQuery.isFetchNextPageError || isOffline)) {
			jobsQuery.fetchNextPage();
		}
	};

	const retryNextPage = () => {
		if (canFetchNextPage()) {
			jobsQuery.fetchNextPage();
		}
	};

	return (
		<View className="flex-1 bg-background">
			{/* 하단 인셋은 이제 탭바(BottomTabBar)가 자체 paddingBottom으로 소화하므로
			    목록에 다시 더하지 않는다 — 겹치면 마지막 행 아래 죽은 여백이 한 겹 생긴다. */}
			<SectionList<NativeSeekerJob, JobSection>
				initialNumToRender={8}
				keyExtractor={(item) => item.id}
				ListEmptyComponent={
					<SeekerListEmpty
						hasErrorWithoutCache={
							jobsQuery.isError && jobsQuery.data === undefined
						}
						industry={industry}
						isOffline={isOffline}
						isPending={jobsQuery.isPending}
						onRefetch={refetchJobs}
						onResetIndustry={() => selectIndustry(null)}
					/>
				}
				ListFooterComponent={
					<SeekerListFooter
						hasNextPage={jobsQuery.hasNextPage}
						hasSections={sections.length > 0}
						isFetchingNextPage={jobsQuery.isFetchingNextPage}
						isFetchNextPageError={jobsQuery.isFetchNextPageError}
						onRetryNextPage={retryNextPage}
					/>
				}
				ListHeaderComponent={
					<SeekerListHeader
						availableCount={availableCount}
						industry={industry}
						isFilterPending={jobsQuery.isPlaceholderData}
						isOffline={isOffline}
						onRefetch={refetchJobs}
						onSelectIndustry={selectIndustry}
						showStaleBanner={showStaleBanner}
					/>
				}
				maxToRenderPerBatch={8}
				onEndReached={loadNextPageOnScroll}
				onEndReachedThreshold={0.6}
				ref={listRef}
				refreshControl={
					<RefreshControl
						colors={[accentColor]}
						onRefresh={refetchJobs}
						// 업종 칩을 누르면 쿼리 키가 바뀌어 isPending=false·isFetching=true가
						// 되고 isRefetching이 서 버린다. 당기지도 않았는데 상단 스피너가 뜨는
						// 것을 막으려고 placeholder 구간(isPlaceholderData)을 빼 둔다.
						refreshing={
							jobsQuery.isRefetching &&
							!(jobsQuery.isFetchingNextPage || jobsQuery.isPlaceholderData)
						}
						tintColor={accentColor}
					/>
				}
				// removeClippedSubviews는 켜지 않는다 — Android 클리핑이 transform 전 레이아웃
				// 사각형을 기준으로 잘라 sticky 섹션 헤더가 사라지거나 깜빡이고, RN 스스로도
				// "may have bugs (missing content)"라고 경고한다(SectionList.js). 섹션 4개·
				// 페이지당 20행이라 클리핑 이득도 크지 않다.
				renderItem={({ item, section }) => (
					<JobRow job={item} sectionKey={section.key} />
				)}
				renderSectionHeader={({ section }) => (
					<JobSectionHeader section={section} />
				)}
				sections={sections}
				stickySectionHeadersEnabled
				windowSize={7}
			/>
		</View>
	);
}
