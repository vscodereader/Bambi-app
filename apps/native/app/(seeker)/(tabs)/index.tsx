import { Ionicons } from "@expo/vector-icons";
import {
	keepPreviousData,
	useInfiniteQuery,
	useQuery,
} from "@tanstack/react-query";
import { useNetworkState } from "expo-network";
import { type Href, Link, useRouter } from "expo-router";
import {
	Button,
	Chip,
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
	Pressable,
	RefreshControl,
	ScrollView,
	SectionList,
	type SectionListData,
	Text,
	View,
} from "react-native";
import { StateCard } from "@/src/components/bambi-screen";
import { JobListCard } from "@/src/components/job-list-card";
import { SpeedDialFab } from "@/src/components/speed-dial-fab";
import {
	buildSeekerJobSections,
	describeJobForScreenReader,
	industryOptions,
	type NativeIndustryOption,
	type NativeJobSectionKey,
	type NativeSeekerJob,
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

function JobRow({
	job,
	sectionKey,
}: {
	job: NativeSeekerJob;
	sectionKey: NativeJobSectionKey;
}) {
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
					<JobListCard job={job} sectionKey={sectionKey} />
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

	// pb-20은 우하단 FAB(h-14 + bottom-4 = 72dp) 자리를 비워 두는 몫이다 —
	// 이 안내문이 목록의 마지막 줄이라 여백이 없으면 통째로 버튼에 가린다.
	return (
		<View className="gap-3 px-4 pt-4 pb-20">
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
	const router = useRouter();
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
			{/* 정적 라우트지만 헤더 버튼들과 같은 이유로 Href 캐스팅 — expo-router 타입
			    생성이 dev 서버 없이 돌지 않아 새 라우트가 생성 타입에 아직 없다. */}
			<SpeedDialFab
				actions={[
					{
						icon: "chatbubble-ellipses-outline",
						label: "1:1 상담",
						onPress: () => router.push("/(seeker)/support/chat" as Href),
					},
				]}
			/>
		</View>
	);
}
