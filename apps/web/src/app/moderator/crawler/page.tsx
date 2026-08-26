"use client";

import { Alert, AlertDescription } from "@bambi-app/ui/components/alert";
import {
	AlertDialog,
	AlertDialogAction,
	AlertDialogCancel,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogTitle,
} from "@bambi-app/ui/components/alert-dialog";
import { Badge } from "@bambi-app/ui/components/badge";
import { Button } from "@bambi-app/ui/components/button";
import {
	Card,
	CardAction,
	CardContent,
	CardHeader,
	CardTitle,
} from "@bambi-app/ui/components/card";
import { Input } from "@bambi-app/ui/components/input";
import { Label } from "@bambi-app/ui/components/label";
import {
	Popover,
	PopoverContent,
	PopoverTrigger,
} from "@bambi-app/ui/components/popover";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@bambi-app/ui/components/select";
import { Skeleton } from "@bambi-app/ui/components/skeleton";
import { Switch } from "@bambi-app/ui/components/switch";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@bambi-app/ui/components/table";
import {
	Tabs,
	TabsContent,
	TabsList,
	TabsTrigger,
} from "@bambi-app/ui/components/tabs";
import {
	ToggleGroup,
	ToggleGroupItem,
} from "@bambi-app/ui/components/toggle-group";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { InfoIcon, RefreshCwIcon, Trash2Icon } from "lucide-react";
import {
	type FormEvent,
	type ReactNode,
	useEffect,
	useRef,
	useState,
} from "react";
import { toast } from "sonner";
import {
	CrawledCommunityTopicsCard,
	CrawledJobPostsCard,
} from "@/app/moderator/crawler/crawled-content-cards";
import { EmptyState } from "@/components/bambi/empty-state";
import {
	CRAWL_CONTENT_TYPE_LABELS,
	CRAWL_RUN_STATUS_LABELS,
	CRAWL_RUN_STATUS_VARIANTS,
	CRAWL_SOURCE_SITE_LABELS,
	CRAWLED_POST_STATUS_LABELS,
	type CrawlContentType,
	type CrawlSourceSite,
	formatCrawlTimestamp,
} from "@/lib/bambi/crawler";
import { industryOptions, isIndustryOption } from "@/lib/bambi-options";
import { orpc } from "@/utils/orpc";

// 수집 대상은 퀸알바 하나뿐이라 선택기를 두지 않는다. 대상이 다시 늘면 이 상수를 state로
// 되돌리고 ToggleGroup을 세운다 — 서버 입력 스키마는 사이트를 계속 받는다.
const SOURCE_SITE: CrawlSourceSite = "queenalba";

// 수집 상한. placeholder의 기본값은 서버의 DEFAULT_CRAWLED_LIMITS와 같아야 한다 —
// 빈 칸으로 저장하면 서버가 그 기본값을 쓰므로, 여기 숫자가 실제 폴백을 보여준다.
//
// 서버 입력 스키마(updateCrawledLimits)의 범위와 같아야 한다 — 넘겨보내면 400으로 튕긴다.
// 커뮤니티만 눈금이 다르다: 노출 자리 개수가 아니라 한 회차에 목록에서 담을 글 수다. 목록
// 5페이지가 주는 전량(150)이 기본값이자 최대라 이 칸은 줄이는 쪽으로만 쓴다. 0은 받지 않는다
// (수집을 멈추는 건 수집 스케줄러·노출 스위치가 할 일이다).
const CRAWLED_LIMIT_MAX = 60;
const CRAWLED_COMMUNITY_LIMIT_MAX = 150;

const CRAWLED_LIMIT_FIELDS = [
	{
		defaultValue: 8,
		key: "adBannerLimit",
		label: "프리미엄 광고 배너(가로·세로 각각)",
		max: CRAWLED_LIMIT_MAX,
		min: 0,
	},
	{
		defaultValue: 12,
		key: "specialLimit",
		label: "스페셜 채용",
		max: CRAWLED_LIMIT_MAX,
		min: 0,
	},
	{
		defaultValue: 12,
		key: "urgentLimit",
		label: "급구 채용",
		max: CRAWLED_LIMIT_MAX,
		min: 0,
	},
	{
		defaultValue: 12,
		key: "recommendedLimit",
		label: "추천 채용",
		max: CRAWLED_LIMIT_MAX,
		min: 0,
	},
	{
		defaultValue: CRAWLED_COMMUNITY_LIMIT_MAX,
		key: "communityLimit",
		label: "커뮤니티 글(회차당 수집)",
		max: CRAWLED_COMMUNITY_LIMIT_MAX,
		min: 1,
	},
] as const;

type CrawledLimitKey = (typeof CRAWLED_LIMIT_FIELDS)[number]["key"];

const EMPTY_CRAWLED_LIMITS: Record<CrawledLimitKey, string> = {
	adBannerLimit: "",
	communityLimit: "",
	recommendedLimit: "",
	specialLimit: "",
	urgentLimit: "",
};

const REVIEW_PAGE_SIZE = 30;

// 현황 타일 5개 자리에 로딩 스켈레톤을 깔 때 쓰는 안정적 key(배열 인덱스 key 회피).
const SUMMARY_TILE_SKELETONS = ["s1", "s2", "s3", "s4", "s5"];

// 긴 설명은 핵심 첫 문장만 본문에 두고 나머지 규칙은 이 팝오버로 접는다. 트리거는 base-ui라
// asChild가 아니라 render prop으로 ghost 아이콘 버튼을 넣는다. 폼 안에서 제출을 막으려 type="button".
function InfoPopover({
	label,
	children,
}: {
	label: string;
	children: ReactNode;
}) {
	return (
		<Popover>
			<PopoverTrigger
				render={
					<Button
						aria-label={label}
						size="icon-xs"
						type="button"
						variant="ghost"
					>
						<InfoIcon />
					</Button>
				}
			/>
			<PopoverContent>{children}</PopoverContent>
		</Popover>
	);
}

// 상한 폼·검토 대기 목록은 각각 자기 쿼리만 쓰므로 페이지에서 떼어냈다(페이지 본체가
// 한 함수에 다 담기면 읽기도, 린트 복잡도도 감당이 안 된다).
function CrawledLimitsCard() {
	const queryClient = useQueryClient();
	const limitsQuery = useQuery(
		orpc.bambi.siteSettings.getCrawledLimits.queryOptions()
	);
	const [limits, setLimits] = useState(EMPTY_CRAWLED_LIMITS);

	// 저장된 값이 오면 폼에 채운다(미설정은 빈 값 → placeholder가 기본값을 안내).
	useEffect(() => {
		const data = limitsQuery.data;
		if (!data) {
			return;
		}
		setLimits({
			adBannerLimit:
				data.adBannerLimit === null ? "" : String(data.adBannerLimit),
			communityLimit:
				data.communityLimit === null ? "" : String(data.communityLimit),
			recommendedLimit:
				data.recommendedLimit === null ? "" : String(data.recommendedLimit),
			specialLimit: data.specialLimit === null ? "" : String(data.specialLimit),
			urgentLimit: data.urgentLimit === null ? "" : String(data.urgentLimit),
		});
	}, [limitsQuery.data]);

	const saveMutation = useMutation(
		orpc.bambi.siteSettings.updateCrawledLimits.mutationOptions({
			onError: (error) => toast.error(error.message || "저장하지 못했어요."),
			onSuccess: async () => {
				toast.success("수집 상한을 저장했어요.");
				await queryClient.invalidateQueries({
					queryKey: orpc.bambi.siteSettings.getCrawledLimits.queryKey(),
				});
			},
		})
	);

	const onSubmit = (event: FormEvent) => {
		event.preventDefault();

		const parsed: Record<CrawledLimitKey, number | null> = {
			adBannerLimit: null,
			communityLimit: null,
			recommendedLimit: null,
			specialLimit: null,
			urgentLimit: null,
		};

		for (const field of CRAWLED_LIMIT_FIELDS) {
			const trimmed = limits[field.key].trim();
			const value = trimmed === "" ? null : Number(trimmed);

			// 서버 스키마와 같은 범위를 여기서 먼저 걸러 400 대신 문장으로 알려준다.
			if (
				value !== null &&
				(!Number.isInteger(value) || value < field.min || value > field.max)
			) {
				toast.error(
					`${field.label} 개수는 ${field.min}~${field.max} 사이 정수로 입력해 주세요.`
				);
				return;
			}

			parsed[field.key] = value;
		}

		saveMutation.mutate(parsed);
	};

	return (
		<Card>
			<CardHeader>
				<CardTitle>수집 상한</CardTitle>
			</CardHeader>
			<CardContent>
				<form className="flex flex-col gap-5" onSubmit={onSubmit}>
					<p className="m-0 flex items-start gap-1 text-muted-foreground text-xs">
						<span>공고는 각 자리에 들어갈 수집 공고 개수의 상한입니다.</span>
						<InfoPopover label="수집 상한 계산 방식 자세히">
							수집할 때와 화면에 내보낼 때 모두 이 값으로 자릅니다. 우리 서비스
							공고가 항상 먼저 나오고, 남은 자리에 수집 공고가 이 개수만큼
							붙어요. 광고 배너는 가로·세로가 서로 다른 자리라{" "}
							<strong className="font-semibold">방향별로 각각</strong> 이
							개수만큼 모읍니다(8이면 가로 8 + 세로 8). 커뮤니티 글은 자리
							개수가 아니라{" "}
							<strong className="font-semibold">한 회차에 모을 글 수</strong>로,
							게시판 목록의 최신 글부터 이 개수만큼만 가져옵니다(다 채우면 남은
							목록 페이지는 받지 않아요).
						</InfoPopover>
					</p>

					<div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-5">
						{CRAWLED_LIMIT_FIELDS.map((field) => (
							<div className="flex flex-col gap-2" key={field.key}>
								<Label htmlFor={`crawledLimit-${field.key}`}>
									{field.label}
								</Label>
								<Input
									id={`crawledLimit-${field.key}`}
									inputMode="numeric"
									onChange={(event) =>
										setLimits((prev) => ({
											...prev,
											[field.key]: event.target.value,
										}))
									}
									placeholder={String(field.defaultValue)}
									value={limits[field.key]}
								/>
							</div>
						))}
					</div>

					<p className="m-0 flex items-start gap-1 text-muted-foreground text-xs">
						<span>
							비워두면 기본값(
							{CRAWLED_LIMIT_FIELDS.map((field) => field.defaultValue).join(
								" / "
							)}
							)을 사용합니다.
						</span>
						<InfoPopover label="입력 범위 자세히">
							공고 자리는 0으로 두면 그 자리에 수집 공고가 나오지 않고, 최대{" "}
							{CRAWLED_LIMIT_MAX}까지 지정할 수 있어요. 커뮤니티 글은 1~
							{CRAWLED_COMMUNITY_LIMIT_MAX}까지 지정할 수 있습니다(수집을 아예
							멈추려면 위 「수집 스케줄러」를, 노출만 내리려면 「수집 커뮤니티
							글 노출」을 끄세요).
						</InfoPopover>
					</p>

					<div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
						<Button
							disabled={saveMutation.isPending || limitsQuery.isLoading}
							type="submit"
						>
							{saveMutation.isPending ? "저장 중…" : "저장"}
						</Button>
					</div>
				</form>
			</CardContent>
		</Card>
	);
}

function IndustryReviewCard() {
	const queryClient = useQueryClient();
	const reviewQuery = useQuery(
		orpc.bambi.crawler.list.queryOptions({
			input: { limit: REVIEW_PAGE_SIZE, status: "needs_review" },
		})
	);

	// 업종 지정도 노출 스위치처럼 저장 버튼을 두지 않는다 — 수십 건을 훑으며 고르는 화면에서
	// 행마다 저장을 누르게 하면 빠뜨린 행이 그대로 검토 대기에 남는다.
	const setIndustryMutation = useMutation(
		orpc.bambi.crawler.setIndustryCategory.mutationOptions({
			onError: (error) =>
				toast.error(error.message || "업종을 지정하지 못했어요."),
			onSuccess: async (_data, variables) => {
				// 되돌리기(industryCategory=null)도 같은 onSuccess를 타므로, 되돌린 경우엔
				// 문구를 바꾸고 되돌리기 액션을 붙이지 않는다 — 안 그러면 토스트가 무한히 뜬다.
				if (variables.industryCategory === null) {
					toast.success("업종 지정을 되돌렸어요. 검토 대기로 돌아갑니다.");
				} else {
					toast.success("업종을 지정했어요. 검토 대기에서 빠집니다.", {
						action: {
							label: "되돌리기",
							onClick: () =>
								setIndustryMutation.mutate({
									id: variables.id,
									industryCategory: null,
								}),
						},
					});
				}
				await Promise.all([
					queryClient.invalidateQueries({
						queryKey: orpc.bambi.crawler.list.key(),
					}),
					queryClient.invalidateQueries({
						queryKey: orpc.bambi.crawler.getSummary.queryKey(),
					}),
				]);
			},
		})
	);

	return (
		<Card id="crawler-industry-review">
			<CardHeader>
				<CardTitle>업종 검토 대기</CardTitle>
			</CardHeader>
			<CardContent className="flex flex-col gap-3">
				<p className="m-0 text-muted-foreground text-xs">
					업종을 고르면 바로 저장되고, 그 공고는 검토 대기에서 빠져 노출 대상이
					됩니다. 원본 업종은 상대 사이트가 적어둔 직종 문구예요. 한 번에 최근{" "}
					{REVIEW_PAGE_SIZE}건까지 보여줍니다
					{reviewQuery.data ? ` (전체 ${reviewQuery.data.total}건)` : ""}.
				</p>
				{reviewQuery.data?.items.length ? (
					<div className="overflow-x-auto">
						<Table>
							<TableHeader>
								<TableRow>
									<TableHead>제목</TableHead>
									<TableHead>업소명</TableHead>
									<TableHead>지역</TableHead>
									<TableHead>원본 업종</TableHead>
									<TableHead>마지막 수집</TableHead>
									<TableHead>업종 지정</TableHead>
								</TableRow>
							</TableHeader>
							<TableBody>
								{reviewQuery.data.items.map((item) => (
									<TableRow key={item.id}>
										<TableCell>{item.title}</TableCell>
										<TableCell>{item.shopName ?? "—"}</TableCell>
										<TableCell className="whitespace-nowrap">
											{[item.region, item.district].filter(Boolean).join(" ") ||
												"—"}
										</TableCell>
										<TableCell className="text-muted-foreground text-xs">
											{item.industryRaw ?? "—"}
										</TableCell>
										<TableCell className="whitespace-nowrap">
											{formatCrawlTimestamp(item.lastSeenAt)}
										</TableCell>
										<TableCell>
											<Select
												// 저장 중인 그 행만 잠근다 — 수십 건을 연속으로 지정하는 화면이라
												// 한 건 저장 중에 나머지까지 얼어붙으면 안 된다.
												disabled={
													setIndustryMutation.isPending &&
													setIndustryMutation.variables?.id === item.id
												}
												onValueChange={(value) => {
													// 서버 입력이 8종 enum이라 가드로 좁힌 뒤 보낸다.
													if (value && isIndustryOption(value)) {
														setIndustryMutation.mutate({
															id: item.id,
															industryCategory: value,
														});
													}
												}}
												value={item.industryCategory}
											>
												<SelectTrigger
													aria-label={`${item.title} 업종`}
													className="w-32"
												>
													<SelectValue placeholder="업종 선택" />
												</SelectTrigger>
												<SelectContent>
													{industryOptions.map((option) => (
														<SelectItem key={option} value={option}>
															{option}
														</SelectItem>
													))}
												</SelectContent>
											</Select>
										</TableCell>
									</TableRow>
								))}
							</TableBody>
						</Table>
					</div>
				) : (
					<EmptyState
						description={
							reviewQuery.isLoading
								? "불러오는 중이에요."
								: "원본 직종이 우리 8종에 이어지지 않은 공고가 없어요. 수집 회차가 돌면 여기에 쌓입니다."
						}
						title="검토 대기 중인 공고가 없어요"
					/>
				)}
			</CardContent>
		</Card>
	);
}

// 즉시 수집·스케줄러 두 카드가 같은 getSettings 쿼리(캐시 공유)에서 수집 대상 종류·구현
// 여부를 똑같이 뽑아 쓰므로 훅으로 묶었다. 종류 선택 state는 두 카드가 각각 따로 들고,
// 이 훅은 목록·판정만 준다.
function useCrawlTargets() {
	const settingsQuery = useQuery(orpc.bambi.crawler.getSettings.queryOptions());
	const data = settingsQuery.data;
	// 수집 대상이 제공하는 데이터 종류(퀸알바=공고·커뮤니티). 종류 선택기가 이 목록을 그린다.
	const availableTypes = (
		data?.availableTargets ?? [
			{ contentType: "job_post" as const, site: SOURCE_SITE },
		]
	)
		.filter((target) => target.site === SOURCE_SITE)
		.map((target) => target.contentType);
	// 파서가 구현된 조합. 선택은 되지만 미구현 조합은 "준비 중"으로 안내한다.
	const implementedTargets = data?.implementedTargets ?? [
		{ contentType: "job_post" as const, site: SOURCE_SITE },
	];
	const targetImplemented = (type: CrawlContentType) =>
		implementedTargets.some(
			(target) => target.site === SOURCE_SITE && target.contentType === type
		);
	return { availableTypes, settingsQuery, targetImplemented };
}

// 즉시 수집: 지금 이 회차만 돌린다. 종류 선택은 이 회차에만 쓰이고 저장하지 않아 저장 버튼이
// 없다(스케줄러 종류와 완전히 독립된 state). CrawlControlCard의 탭 패널로 들어간다.
function ImmediateCollectionPanel() {
	const queryClient = useQueryClient();
	const { availableTypes, settingsQuery, targetImplemented } =
		useCrawlTargets();
	const [contentType, setContentType] = useState<CrawlContentType>("job_post");

	// 저장된 종류가 오면 즉시 수집 토글의 초기값으로만 쓴다 — 딱 한 번만. 즉시 수집 성공이
	// getSettings를 invalidate하는데, 그때마다 다시 채우면 방금 고른 선택이 저장값으로
	// 되돌아간다(스케줄러 토글과 서로 갱신하지 않음).
	const initializedRef = useRef(false);
	useEffect(() => {
		const data = settingsQuery.data;
		if (!data || initializedRef.current) {
			return;
		}
		initializedRef.current = true;
		setContentType(data.contentType);
	}, [settingsQuery.data]);

	// 한 회차는 최대 10분쯤 걸려서 서버가 시작만 시키고 바로 응답한다. 그래서 여기서는
	// 진행 상황을 기다리지 않고 회차 목록·설정을 다시 불러 화면에 반영한다.
	const runNowMutation = useMutation(
		orpc.bambi.crawler.runNow.mutationOptions({
			onError: (error) =>
				toast.error(error.message || "수집을 시작하지 못했어요."),
			onSuccess: async (result) => {
				if (result.reason === "already_running") {
					toast.error("이미 수집이 진행 중이에요. 끝난 뒤에 다시 눌러 주세요.");
					return;
				}

				if (result.reason === "not_implemented") {
					toast.error(
						"이 데이터의 수집기는 아직 준비 중이에요. 준비된 데이터를 선택해 주세요."
					);
					return;
				}

				toast.success(
					"수집을 시작했어요. 한 회차는 몇 분 걸리니 아래 최근 수집 회차에서 진행 상황을 확인해 주세요."
				);
				await Promise.all([
					queryClient.invalidateQueries({
						queryKey: orpc.bambi.crawler.listRuns.queryKey(),
					}),
					queryClient.invalidateQueries({
						queryKey: orpc.bambi.crawler.getSettings.queryKey(),
					}),
				]);
			},
		})
	);

	const selectedTargetReady = targetImplemented(contentType);

	return (
		<div className="flex flex-col gap-5">
			<div className="flex flex-col gap-2">
				<Label>수집 대상</Label>
				<p className="m-0 font-medium text-sm">
					{CRAWL_SOURCE_SITE_LABELS[SOURCE_SITE]}
				</p>
				<p className="m-0 text-muted-foreground text-xs">
					현재 수집 대상은 퀸알바 한 곳입니다.
				</p>
			</div>

			<div className="flex flex-col gap-2">
				<Label>수집 데이터</Label>
				<ToggleGroup
					aria-label="즉시 수집할 데이터 종류"
					className="w-full flex-wrap"
					onValueChange={(value) => {
						const next = value.at(-1);
						if (next) {
							setContentType(next as CrawlContentType);
						}
					}}
					value={[contentType]}
				>
					{availableTypes.map((type) => (
						<ToggleGroupItem key={type} value={type}>
							{CRAWL_CONTENT_TYPE_LABELS[type]}
							{targetImplemented(type) ? null : " (준비 중)"}
						</ToggleGroupItem>
					))}
				</ToggleGroup>
				<p className="m-0 text-muted-foreground text-xs">
					공고는 채용 공고를, 커뮤니티는 게시판 글을 수집합니다. 한 번에 한
					종류만 수집해요.
				</p>
				{selectedTargetReady ? null : (
					<Alert>
						<AlertDescription>
							{CRAWL_SOURCE_SITE_LABELS[SOURCE_SITE]}{" "}
							{CRAWL_CONTENT_TYPE_LABELS[contentType]} 수집기는 아직 준비 중이라
							지금 수집할 수 없어요. 파서가 준비되면 자동으로 켜집니다.
						</AlertDescription>
					</Alert>
				)}
			</div>

			<div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
				<Button
					disabled={
						runNowMutation.isPending ||
						settingsQuery.isLoading ||
						!selectedTargetReady
					}
					// 저장을 거치지 않고 지금 화면에서 고른 수집 데이터로 한 회차를 돌린다.
					onClick={() => runNowMutation.mutate({ contentType })}
					type="button"
				>
					{runNowMutation.isPending ? "시작하는 중…" : "즉시 수집"}
				</Button>
			</div>
			<p className="m-0 text-muted-foreground text-xs">
				즉시 수집은 주기를 기다리지 않고 한 회차를 지금 시작합니다. 위에서 고른
				수집 데이터는 이 회차에만 적용되고 저장되지 않아요. 스케줄러가 도는
				종류는 「수집 스케줄러」 탭에서 따로 설정합니다.
			</p>
		</div>
	);
}

// 수집 스케줄러: 저장은 스케줄러 설정(켜짐·주기·수집 데이터)만 바꾼다. 종류 선택은 즉시
// 수집과 독립된 저장 대상 state. CrawlControlCard의 탭 패널로 들어간다.
function CrawlSchedulerPanel() {
	const queryClient = useQueryClient();
	const { availableTypes, settingsQuery, targetImplemented } =
		useCrawlTargets();
	const [enabled, setEnabled] = useState(false);
	const [intervalHours, setIntervalHours] = useState("");
	const [contentType, setContentType] = useState<CrawlContentType>("job_post");

	// 저장된 값이 오면 폼에 채운다(주기가 미설정이면 빈 값 → 기본값 placeholder 노출).
	useEffect(() => {
		const data = settingsQuery.data;
		if (!data) {
			return;
		}
		setEnabled(data.enabled);
		setIntervalHours(
			data.intervalHours === null ? "" : String(data.intervalHours)
		);
		setContentType(data.contentType);
	}, [settingsQuery.data]);

	const saveMutation = useMutation(
		orpc.bambi.crawler.updateSettings.mutationOptions({
			onError: (error) => toast.error(error.message || "저장하지 못했어요."),
			onSuccess: async () => {
				toast.success("수집 설정을 저장했어요.");
				await queryClient.invalidateQueries({
					queryKey: orpc.bambi.crawler.getSettings.queryKey(),
				});
			},
		})
	);

	const onSubmit = (event: FormEvent) => {
		event.preventDefault();

		const trimmed = intervalHours.trim();
		const parsed = trimmed === "" ? null : Number(trimmed);

		if (parsed !== null && !Number.isInteger(parsed)) {
			toast.error("수집 주기는 시간 단위 정수로 입력해 주세요.");
			return;
		}

		saveMutation.mutate({
			contentType,
			enabled,
			intervalHours: parsed,
			sourceSite: SOURCE_SITE,
		});
	};

	const defaultHours = settingsQuery.data?.defaultIntervalHours ?? 3;
	const selectedTargetReady = targetImplemented(contentType);

	return (
		<form className="flex flex-col gap-5" onSubmit={onSubmit}>
			<div className="flex items-start justify-between gap-4">
				<div className="flex flex-col gap-1">
					<Label htmlFor="crawlEnabled">스케줄러</Label>
					<p className="m-0 text-muted-foreground text-xs">
						켜두면 아래 수집 주기마다 자동으로 한 회차가 돕니다. 꺼도 「즉시
						수집」은 언제든 실행할 수 있어요. 기본값은 꺼짐이라 배포만으로는
						자동 수집이 돌지 않습니다.
					</p>
				</div>
				<Switch
					checked={enabled}
					disabled={settingsQuery.isLoading}
					id="crawlEnabled"
					onCheckedChange={setEnabled}
				/>
			</div>

			<div className="flex flex-col gap-2">
				<Label>수집 데이터</Label>
				<ToggleGroup
					aria-label="스케줄러가 수집할 데이터 종류"
					className="w-full flex-wrap"
					onValueChange={(value) => {
						const next = value.at(-1);
						if (next) {
							setContentType(next as CrawlContentType);
						}
					}}
					value={[contentType]}
				>
					{availableTypes.map((type) => (
						<ToggleGroupItem key={type} value={type}>
							{CRAWL_CONTENT_TYPE_LABELS[type]}
							{targetImplemented(type) ? null : " (준비 중)"}
						</ToggleGroupItem>
					))}
				</ToggleGroup>
				<p className="m-0 text-muted-foreground text-xs">
					공고는 채용 공고를, 커뮤니티는 게시판 글을 수집합니다. 한 번에 한
					종류만 수집해요.
				</p>
				{selectedTargetReady ? null : (
					<Alert>
						<AlertDescription>
							{CRAWL_SOURCE_SITE_LABELS[SOURCE_SITE]}{" "}
							{CRAWL_CONTENT_TYPE_LABELS[contentType]} 수집기는 아직 준비
							중이라, 선택해 저장해도 실제 수집은 돌지 않습니다. 파서가 준비되면
							자동으로 켜집니다.
						</AlertDescription>
					</Alert>
				)}
			</div>

			<div className="flex flex-col gap-2 md:max-w-xs">
				<Label htmlFor="crawlIntervalHours">수집 주기(시간)</Label>
				<Input
					id="crawlIntervalHours"
					inputMode="numeric"
					onChange={(event) => setIntervalHours(event.target.value)}
					placeholder={String(defaultHours)}
					value={intervalHours}
				/>
				<p className="m-0 text-muted-foreground text-xs">
					이 시간이 지날 때마다 선택한 사이트의 공개 공고를 한 회차 수집합니다.
					비워두면 기본값({defaultHours}시간)을 사용해요. 마지막 실행 시각을
					기준으로 판단하므로 서버를 재시작해도 주기가 밀리지 않습니다.
				</p>
				<p className="m-0 text-muted-foreground text-xs">
					마지막 실행:{" "}
					{formatCrawlTimestamp(settingsQuery.data?.lastRunAt ?? null)}
				</p>
			</div>

			<div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
				<Button
					disabled={saveMutation.isPending || settingsQuery.isLoading}
					type="submit"
				>
					{saveMutation.isPending ? "저장 중…" : "저장"}
				</Button>
			</div>
			<p className="m-0 text-muted-foreground text-xs">
				저장은 스케줄러 설정(켜짐·수집 주기·수집 데이터)만 바꿉니다. 즉시
				수집에는 영향을 주지 않아요.
			</p>
		</form>
	);
}

// 즉시 수집·수집 스케줄러를 한 카드의 탭 두 개로 묶는다 — 세로로 두 카드를 나란히 두면
// 화면이 길어지고, 즉시 수집(일회성)과 스케줄러(저장 설정)의 대비도 탭이 더 잘 드러낸다.
// 스케줄러 탭이 접혀 있으면 켜짐/꺼짐이 안 보이므로 탭 라벨에 저장된 상태 배지를 붙인다
// (패널 안의 아직 저장 안 된 스위치가 아니라 서버에 저장된 값 기준).
// keepMounted로 두 패널을 DOM에 유지해, 탭을 오가도 각 패널의 선택 state가 초기화되지 않는다.
function CrawlControlCard() {
	const settingsQuery = useQuery(orpc.bambi.crawler.getSettings.queryOptions());
	const schedulerEnabled = settingsQuery.data?.enabled ?? false;

	return (
		<Card>
			<CardContent>
				<Tabs defaultValue="immediate">
					<TabsList>
						<TabsTrigger value="immediate">즉시 수집</TabsTrigger>
						<TabsTrigger value="scheduler">
							수집 스케줄러
							{settingsQuery.data ? (
								<Badge variant={schedulerEnabled ? "default" : "outline"}>
									{schedulerEnabled ? "켜짐" : "꺼짐"}
								</Badge>
							) : null}
						</TabsTrigger>
					</TabsList>
					<TabsContent className="pt-2" keepMounted value="immediate">
						<ImmediateCollectionPanel />
					</TabsContent>
					<TabsContent className="pt-2" keepMounted value="scheduler">
						<CrawlSchedulerPanel />
					</TabsContent>
				</Tabs>
			</CardContent>
		</Card>
	);
}

export default function ModeratorCrawlerPage() {
	const queryClient = useQueryClient();

	const runsQuery = useQuery({
		...orpc.bambi.crawler.listRuns.queryOptions(),
		// 진행 중 회차가 있으면 5초마다 다시 불러 상태·집계를 따라잡고, 끝나면 폴링을 멈춘다.
		refetchInterval: (query) =>
			query.state.data?.some((run) => run.status === "running") ? 5000 : false,
	});
	// 회차가 돌면 현황 숫자(신규·전환 등)도 같이 움직이므로 현황도 같은 주기로 따라 돈다.
	const hasRunningRun = runsQuery.data?.some((run) => run.status === "running");
	const summaryQuery = useQuery({
		...orpc.bambi.crawler.getSummary.queryOptions(),
		refetchInterval: hasRunningRun ? 5000 : undefined,
	});

	const [isClearRunsOpen, setIsClearRunsOpen] = useState(false);

	// 회차 기록 비우기. 성공했을 때만 창을 닫는다 — 실패하면 열린 채로 남아 다시 누를 수 있어야 한다.
	const clearRunsMutation = useMutation(
		orpc.bambi.crawler.clearRuns.mutationOptions({
			onError: (error) => toast.error(error.message || "비우지 못했어요."),
			onSuccess: async (result) => {
				toast.success(
					result.removed > 0
						? `수집 회차 기록 ${result.removed}건을 비웠어요.`
						: "지울 회차 기록이 없어요. 진행 중인 회차는 남겨 둡니다."
				);
				setIsClearRunsOpen(false);
				await queryClient.invalidateQueries({
					queryKey: orpc.bambi.crawler.listRuns.queryKey(),
				});
			},
		})
	);

	const exposureQuery = useQuery(
		orpc.bambi.siteSettings.getCrawledExposure.queryOptions()
	);
	const saveExposureMutation = useMutation(
		orpc.bambi.siteSettings.updateCrawledExposure.mutationOptions({
			// 표준 낙관 업데이트: 왕복을 기다리지 않고 캐시를 먼저 바꿔 스위치가 즉시 움직이고,
			// 연타해도 toggleExposure가 읽는 exposure(=캐시)가 항상 최신이라 낡은 스냅샷 merge 레이스가 없다.
			onMutate: async (input) => {
				const queryKey = orpc.bambi.siteSettings.getCrawledExposure.queryKey();
				// 진행 중인 리페치가 낙관 값을 덮지 않게 먼저 멈춘다.
				await queryClient.cancelQueries({ queryKey });
				const previous = queryClient.getQueryData(queryKey);
				// 입력 스키마 → 캐시 스키마로 옮겨 즉시 반영한다.
				queryClient.setQueryData(queryKey, {
					crawledAdBannerEnabled: input.adBannerEnabled,
					crawledCommunityFeedEnabled: input.communityFeedEnabled,
					crawledJobFeedEnabled: input.jobFeedEnabled,
				});
				return { previous };
			},
			onError: (error, _input, context) => {
				// 실패하면 낙관 반영을 이전 스냅샷으로 되돌린다.
				if (context?.previous !== undefined) {
					queryClient.setQueryData(
						orpc.bambi.siteSettings.getCrawledExposure.queryKey(),
						context.previous
					);
				}
				toast.error(error.message || "저장하지 못했어요.");
			},
			onSuccess: () => {
				toast.success("수집 콘텐츠 노출 설정을 저장했어요.");
			},
			onSettled: async () => {
				await queryClient.invalidateQueries({
					queryKey: orpc.bambi.siteSettings.getCrawledExposure.queryKey(),
				});
			},
		})
	);
	const exposure = exposureQuery.data ?? {
		crawledAdBannerEnabled: false,
		crawledCommunityFeedEnabled: false,
		crawledJobFeedEnabled: false,
	};
	// 노출 스위치는 저장 버튼을 두지 않고 토글 즉시 반영한다 — 문제가 생겨 내리러 온 사람이
	// 스위치만 내리고 저장을 잊으면 그대로 계속 노출된다.
	const toggleExposure = (
		key:
			| "crawledAdBannerEnabled"
			| "crawledCommunityFeedEnabled"
			| "crawledJobFeedEnabled",
		next: boolean
	) => {
		const merged = { ...exposure, [key]: next };

		saveExposureMutation.mutate({
			adBannerEnabled: merged.crawledAdBannerEnabled,
			communityFeedEnabled: merged.crawledCommunityFeedEnabled,
			jobFeedEnabled: merged.crawledJobFeedEnabled,
		});
	};

	const byStatus = summaryQuery.data?.byStatus ?? {};
	const statusKeys = Object.keys(
		CRAWLED_POST_STATUS_LABELS
	) as (keyof typeof CRAWLED_POST_STATUS_LABELS)[];

	// 현황 타일에서 해당 카드로 부드럽게 스크롤한다.
	const scrollToCard = (id: string) => {
		document
			.getElementById(id)
			?.scrollIntoView({ behavior: "smooth", block: "start" });
	};

	return (
		<div className="mx-auto flex w-full flex-col gap-4 px-5 py-6 md:px-6">
			<div className="flex flex-col gap-1">
				<h1 className="m-0 font-extrabold text-2xl">크롤링</h1>
				<p className="m-0 text-muted-foreground text-sm">
					외부 공고·게시글 수집을 운영합니다.
				</p>
			</div>

			<CrawlControlCard />

			<Card>
				<CardHeader>
					<CardTitle>수집 콘텐츠 노출</CardTitle>
				</CardHeader>
				<CardContent className="flex flex-col gap-5">
					<p className="m-0 text-muted-foreground text-xs">
						수집을 계속 돌리면서 노출만 즉시 내릴 수 있게 수집과 분리된
						스위치입니다. 두 스위치는 켜는 즉시 저장돼요. 기본값은 꺼짐이라
						수집만 켜도 화면에는 나오지 않습니다.
					</p>

					<div className="flex items-start justify-between gap-4">
						<div className="flex flex-col gap-1">
							<Label htmlFor="crawledAdBannerEnabled">
								광고 배너 슬롯 노출
							</Label>
							<p className="m-0 text-muted-foreground text-xs">
								결제 광고가 채우지 못한 빈 칸에만 수집 배너가 들어갑니다.
								가로형은 좌1→좌2→좌3→중간1→중간2로, 세로형은 우1→우2→우3에서만
								순환하며 서로 넘어가지 않아요. 결제 광고를 밀어내지는 않습니다.
							</p>
						</div>
						<Switch
							checked={exposure.crawledAdBannerEnabled}
							disabled={exposureQuery.isLoading}
							id="crawledAdBannerEnabled"
							onCheckedChange={(next) =>
								toggleExposure("crawledAdBannerEnabled", next)
							}
						/>
					</div>

					<div className="flex items-start justify-between gap-4">
						<div className="flex flex-col gap-1">
							<Label htmlFor="crawledJobFeedEnabled">공고 목록 노출</Label>
							<p className="m-0 text-muted-foreground text-xs">
								수집 공고가 공고 목록에 섞입니다. 유료 섹션에는 들어가지 않고
								검증 배지도 붙지 않으며, 지역·급여·근무시간·업종·업소명이 빠진
								공고는 목록에서 제외돼요.
							</p>
						</div>
						<Switch
							checked={exposure.crawledJobFeedEnabled}
							disabled={exposureQuery.isLoading}
							id="crawledJobFeedEnabled"
							onCheckedChange={(next) =>
								toggleExposure("crawledJobFeedEnabled", next)
							}
						/>
					</div>

					<div className="flex items-start justify-between gap-4">
						<div className="flex flex-col gap-1">
							<Label htmlFor="crawledCommunityFeedEnabled">
								수집 커뮤니티 글 노출
							</Label>
							<p className="m-0 text-muted-foreground text-xs">
								수집한 커뮤니티 글이 「밤문화 이야기」 게시판과 수다방 홈
								미리보기에 섞입니다. 우리 회원 글이 항상 먼저 나오고 남은 자리에
								붙습니다. 목록·상세에 출처 표시는 붙지 않고, 회원·비회원이 우리
								글과 같은 규칙으로 댓글을 남길 수 있어요(글 자체의 좋아요·신고는
								제공되지 않습니다).
							</p>
						</div>
						<Switch
							checked={exposure.crawledCommunityFeedEnabled}
							disabled={exposureQuery.isLoading}
							id="crawledCommunityFeedEnabled"
							onCheckedChange={(next) =>
								toggleExposure("crawledCommunityFeedEnabled", next)
							}
						/>
					</div>
				</CardContent>
			</Card>

			<CrawledLimitsCard />

			<Card>
				<CardHeader>
					<CardTitle>수집 현황</CardTitle>
				</CardHeader>
				<CardContent className="flex flex-col gap-3">
					{summaryQuery.isLoading ? (
						// 로딩 중 0으로 그리면 "다 사라졌나"로 오독되므로 같은 자리에 스켈레톤을 깐다.
						<div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-5">
							{SUMMARY_TILE_SKELETONS.map((key) => (
								<div
									className="flex flex-col gap-1 rounded-md border p-3"
									key={key}
								>
									<Skeleton className="h-4 w-16" />
									<Skeleton className="h-6 w-10" />
								</div>
							))}
						</div>
					) : (
						<div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-5">
							{statusKeys.map((status) => {
								// 업종 검토 대기는 검토 카드로, 나머지 상태(정상·만료·삭제됨)는 공고 목록 카드로 이동.
								const targetId =
									status === "needs_review"
										? "crawler-industry-review"
										: "crawler-job-posts";
								const targetLabel =
									status === "needs_review"
										? "업종 검토 대기 카드"
										: "수집 공고 목록";
								return (
									<button
										aria-label={`${CRAWLED_POST_STATUS_LABELS[status]} — ${targetLabel}로 이동`}
										className="flex flex-col gap-1 rounded-md border p-3 text-left hover:bg-muted"
										key={status}
										onClick={() => scrollToCard(targetId)}
										type="button"
									>
										<span className="text-muted-foreground text-xs">
											{CRAWLED_POST_STATUS_LABELS[status]}
										</span>
										<span className="font-semibold text-lg">
											{byStatus[status] ?? 0}
										</span>
									</button>
								);
							})}
							{/* 전환됨은 이 페이지에 이동할 카드가 없어 클릭 없이 그대로 둔다. */}
							<div className="flex flex-col gap-1 rounded-md border p-3">
								<span className="text-muted-foreground text-xs">전환됨</span>
								<span className="font-semibold text-lg">
									{summaryQuery.data?.converted ?? 0}
								</span>
							</div>
						</div>
					)}
					<p className="m-0 text-muted-foreground text-xs">
						업종 검토 대기는 원본 직종이 우리 8종 분류에 자동으로 이어지지 않은
						공고입니다. 버리지 않고 남겨두니 아래 「업종 검토 대기」 카드에서
						직접 업종을 지정해 주세요.
					</p>
				</CardContent>
			</Card>

			<IndustryReviewCard />

			<CrawledJobPostsCard />

			<CrawledCommunityTopicsCard />

			<Card>
				<CardHeader>
					<CardTitle>최근 수집 회차</CardTitle>
					{/* 회차는 서버가 뒤에서 돌리는 동안 조용히 바뀐다 — 진행 상황을 보려고
					    페이지를 통째로 새로 열지 않아도 되게 이 카드만 다시 불러온다. */}
					<CardAction>
						<div className="flex flex-wrap gap-2">
							<Button
								disabled={runsQuery.isFetching || summaryQuery.isFetching}
								onClick={() => {
									runsQuery.refetch();
									summaryQuery.refetch();
								}}
								size="sm"
								variant="outline"
							>
								<RefreshCwIcon
									className={runsQuery.isFetching ? "animate-spin" : undefined}
									data-icon="inline-start"
								/>
								새로고침
							</Button>
							<Button
								// 비울 기록이 없으면 누를 이유가 없다.
								disabled={
									!runsQuery.data?.length || clearRunsMutation.isPending
								}
								onClick={() => setIsClearRunsOpen(true)}
								size="sm"
								variant="outline"
							>
								<Trash2Icon data-icon="inline-start" />
								비우기
							</Button>
						</div>
					</CardAction>
				</CardHeader>
				<CardContent className="flex flex-col gap-3">
					<p className="m-0 text-muted-foreground text-xs">
						「수율 미달 중단」이 뜨면 장애가 아니라, 상대 사이트의 마크업이
						바뀌어 파싱이 무너졌다는 신호입니다. 이 경우 수집기는 데이터를
						건드리지 않고 스스로 멈추니, 파서 점검이 필요합니다.
					</p>
					{runsQuery.data?.length ? (
						<div className="overflow-x-auto">
							<Table>
								<TableHeader>
									<TableRow>
										<TableHead>시작</TableHead>
										<TableHead>출처</TableHead>
										<TableHead>상태</TableHead>
										<TableHead className="text-right">수집</TableHead>
										<TableHead className="text-right">신규</TableHead>
										<TableHead className="text-right">변경</TableHead>
										<TableHead className="text-right">실패</TableHead>
										<TableHead>메모</TableHead>
									</TableRow>
								</TableHeader>
								<TableBody>
									{runsQuery.data.map((run) => (
										<TableRow key={run.id}>
											<TableCell className="whitespace-nowrap">
												{formatCrawlTimestamp(run.startedAt)}
											</TableCell>
											{/* 사이트만 적으면 같은 퀸알바 회차가 공고인지 게시판인지 구분되지 않는다. */}
											<TableCell className="whitespace-nowrap">
												{CRAWL_SOURCE_SITE_LABELS[run.sourceSite]}/
												{CRAWL_CONTENT_TYPE_LABELS[run.contentType]}
											</TableCell>
											<TableCell>
												<Badge variant={CRAWL_RUN_STATUS_VARIANTS[run.status]}>
													{CRAWL_RUN_STATUS_LABELS[run.status]}
												</Badge>
											</TableCell>
											<TableCell className="text-right tabular-nums">
												{run.itemsSeen}
											</TableCell>
											<TableCell className="text-right tabular-nums">
												{run.itemsNew}
											</TableCell>
											<TableCell className="text-right tabular-nums">
												{run.itemsUpdated}
											</TableCell>
											<TableCell className="text-right tabular-nums">
												{run.itemsFailed}
											</TableCell>
											<TableCell className="max-w-xs whitespace-normal break-words text-muted-foreground text-xs">
												{run.error ?? "—"}
											</TableCell>
										</TableRow>
									))}
								</TableBody>
							</Table>
						</div>
					) : (
						<EmptyState
							description={
								runsQuery.isLoading
									? "불러오는 중이에요."
									: "수집 스케줄러를 켜고 저장하면 다음 틱에 첫 회차가 시작됩니다. 지금 바로 돌려보려면 위 「즉시 수집」을 눌러 주세요."
							}
							title="아직 수집 기록이 없어요"
						/>
					)}

					<AlertDialog
						onOpenChange={(open) => {
							if (!open) {
								setIsClearRunsOpen(false);
							}
						}}
						open={isClearRunsOpen}
					>
						<AlertDialogContent>
							<AlertDialogHeader>
								<AlertDialogTitle>회차 기록을 비울까요?</AlertDialogTitle>
								<AlertDialogDescription>
									끝난 회차 기록이 모두 지워집니다. 되돌릴 수 없고, 지우면
									지금까지의 수율·파손 이력으로 파서를 점검할 수 없게 됩니다.
									수집한 공고·커뮤니티 글은 그대로 남고, 진행 중인 회차도 남겨
									둡니다.
								</AlertDialogDescription>
							</AlertDialogHeader>
							<AlertDialogFooter>
								<AlertDialogCancel>취소</AlertDialogCancel>
								<AlertDialogAction
									disabled={clearRunsMutation.isPending}
									onClick={() => clearRunsMutation.mutate({})}
									variant="destructive"
								>
									비우기
								</AlertDialogAction>
							</AlertDialogFooter>
						</AlertDialogContent>
					</AlertDialog>
				</CardContent>
			</Card>
		</div>
	);
}
