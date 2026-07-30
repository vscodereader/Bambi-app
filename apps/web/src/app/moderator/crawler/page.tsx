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
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@bambi-app/ui/components/select";
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
	ToggleGroup,
	ToggleGroupItem,
} from "@bambi-app/ui/components/toggle-group";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { RefreshCwIcon, Trash2Icon } from "lucide-react";
import { type FormEvent, useEffect, useState } from "react";
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

// 섹션별 수집 상한. placeholder의 기본값은 서버의 DEFAULT_CRAWLED_LIMITS와 같아야 한다 —
// 빈 칸으로 저장하면 서버가 그 기본값을 쓰므로, 여기 숫자가 실제 폴백을 보여준다.
const CRAWLED_LIMIT_FIELDS = [
	{
		defaultValue: 8,
		key: "adBannerLimit",
		label: "프리미엄 광고 배너(가로·세로 각각)",
	},
	{ defaultValue: 12, key: "specialLimit", label: "스페셜 채용" },
	{ defaultValue: 12, key: "urgentLimit", label: "급구 채용" },
	{ defaultValue: 12, key: "recommendedLimit", label: "추천 채용" },
] as const;

type CrawledLimitKey = (typeof CRAWLED_LIMIT_FIELDS)[number]["key"];

const EMPTY_CRAWLED_LIMITS: Record<CrawledLimitKey, string> = {
	adBannerLimit: "",
	recommendedLimit: "",
	specialLimit: "",
	urgentLimit: "",
};

// 서버 입력 스키마(updateCrawledLimits)의 상한과 같아야 한다 — 넘겨보내면 400으로 튕긴다.
const CRAWLED_LIMIT_MAX = 60;

const REVIEW_PAGE_SIZE = 30;

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
				toast.success("섹션별 수집 상한을 저장했어요.");
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
				(!Number.isInteger(value) || value < 0 || value > CRAWLED_LIMIT_MAX)
			) {
				toast.error(
					`${field.label} 노출 개수는 0~${CRAWLED_LIMIT_MAX} 사이 정수로 입력해 주세요.`
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
				<CardTitle>섹션별 수집 상한</CardTitle>
			</CardHeader>
			<CardContent>
				<form className="flex flex-col gap-5" onSubmit={onSubmit}>
					<p className="m-0 text-muted-foreground text-xs">
						각 자리에 들어갈 수집 공고 개수의 상한입니다. 수집할 때와 화면에
						내보낼 때 모두 이 값으로 자릅니다. 우리 서비스 공고가 항상 먼저
						나오고, 남은 자리에 수집 공고가 이 개수만큼 붙어요. 광고 배너는
						가로·세로가 서로 다른 자리라{" "}
						<strong className="font-semibold">방향별로 각각</strong> 이 개수만큼
						모읍니다(8이면 가로 8 + 세로 8).
					</p>

					<div className="grid grid-cols-2 gap-4 md:grid-cols-4">
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

					<p className="m-0 text-muted-foreground text-xs">
						비워두면 기본값(
						{CRAWLED_LIMIT_FIELDS.map((field) => field.defaultValue).join(
							" / "
						)}
						)을 사용합니다. 0으로 두면 그 자리에는 수집 공고가 나오지 않아요.
						최대 {CRAWLED_LIMIT_MAX}까지 지정할 수 있습니다.
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
			onSuccess: async () => {
				toast.success("업종을 지정했어요. 검토 대기에서 빠집니다.");
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
		<Card>
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
												disabled={setIndustryMutation.isPending}
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

export default function ModeratorCrawlerPage() {
	const queryClient = useQueryClient();

	const settingsQuery = useQuery(orpc.bambi.crawler.getSettings.queryOptions());
	const summaryQuery = useQuery(orpc.bambi.crawler.getSummary.queryOptions());
	const runsQuery = useQuery(orpc.bambi.crawler.listRuns.queryOptions());

	const [enabled, setEnabled] = useState(false);
	const [intervalHours, setIntervalHours] = useState("");
	const [contentType, setContentType] = useState<CrawlContentType>("job_post");
	const [isClearRunsOpen, setIsClearRunsOpen] = useState(false);

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

	// 한 회차는 최대 10분쯤 걸려서 서버가 시작만 시키고 바로 응답한다. 그래서 여기서는
	// 진행 상황을 기다리지 않고 회차 목록·현황을 다시 불러 화면에 반영한다.
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
			onError: (error) => toast.error(error.message || "저장하지 못했어요."),
			onSuccess: async () => {
				toast.success("수집 콘텐츠 노출 설정을 저장했어요.");
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
	const byStatus = summaryQuery.data?.byStatus ?? {};
	const statusKeys = Object.keys(
		CRAWLED_POST_STATUS_LABELS
	) as (keyof typeof CRAWLED_POST_STATUS_LABELS)[];
	// 수집 대상이 제공하는 데이터 종류(퀸알바=공고·커뮤니티). 종류 선택기가 이 목록을 그린다.
	const availableTypes = (
		settingsQuery.data?.availableTargets ?? [
			{ contentType: "job_post" as const, site: SOURCE_SITE },
		]
	)
		.filter((target) => target.site === SOURCE_SITE)
		.map((target) => target.contentType);
	// 파서가 구현된 조합. 선택은 되지만 미구현 조합은 "준비 중"으로 안내하고 즉시 수집을 잠근다.
	const implementedTargets = settingsQuery.data?.implementedTargets ?? [
		{ contentType: "job_post" as const, site: SOURCE_SITE },
	];
	const targetImplemented = (type: CrawlContentType) =>
		implementedTargets.some(
			(target) => target.site === SOURCE_SITE && target.contentType === type
		);
	const selectedTargetReady = targetImplemented(contentType);

	return (
		<div className="mx-auto flex w-full flex-col gap-4 px-5 py-6 md:px-6">
			<Card>
				<CardHeader>
					<CardTitle>외부 공고 수집</CardTitle>
				</CardHeader>
				<CardContent>
					<form className="flex flex-col gap-5" onSubmit={onSubmit}>
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
								aria-label="수집 데이터 종류"
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
								공고는 채용 공고를, 커뮤니티는 게시판 글을 수집합니다. 한 번에
								한 종류만 수집해요.
							</p>
							{selectedTargetReady ? null : (
								<Alert>
									<AlertDescription>
										{CRAWL_SOURCE_SITE_LABELS[SOURCE_SITE]}{" "}
										{CRAWL_CONTENT_TYPE_LABELS[contentType]} 수집기는 아직 준비
										중이라, 선택해 저장해도 실제 수집은 돌지 않습니다. 파서가
										준비되면 자동으로 켜집니다.
									</AlertDescription>
								</Alert>
							)}
						</div>

						<div className="flex items-start justify-between gap-4">
							<div className="flex flex-col gap-1">
								<Label htmlFor="crawlEnabled">수집 스케줄러</Label>
								<p className="m-0 text-muted-foreground text-xs">
									켜두면 아래 수집 주기마다 자동으로 한 회차가 돕니다. 꺼도
									「즉시 수집」은 언제든 실행할 수 있어요. 기본값은 꺼짐이라
									배포만으로는 자동 수집이 돌지 않습니다.
								</p>
							</div>
							<Switch
								checked={enabled}
								disabled={settingsQuery.isLoading}
								id="crawlEnabled"
								onCheckedChange={setEnabled}
							/>
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
								이 시간이 지날 때마다 선택한 사이트의 공개 공고를 한 회차
								수집합니다. 비워두면 기본값({defaultHours}시간)을 사용해요.
								마지막 실행 시각을 기준으로 판단하므로 서버를 재시작해도 주기가
								밀리지 않습니다.
							</p>
							<p className="m-0 text-muted-foreground text-xs">
								마지막 실행:{" "}
								{formatCrawlTimestamp(settingsQuery.data?.lastRunAt ?? null)}
							</p>
						</div>

						<div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
							<Button
								disabled={
									runNowMutation.isPending ||
									settingsQuery.isLoading ||
									!selectedTargetReady
								}
								onClick={() => runNowMutation.mutate({})}
								type="button"
								variant="outline"
							>
								{runNowMutation.isPending ? "시작하는 중…" : "즉시 수집"}
							</Button>
							<Button
								disabled={saveMutation.isPending || settingsQuery.isLoading}
								type="submit"
							>
								{saveMutation.isPending ? "저장 중…" : "저장"}
							</Button>
						</div>
						<p className="m-0 text-muted-foreground text-xs">
							즉시 수집은 주기를 기다리지 않고 한 회차를 지금 시작합니다. 저장한
							설정을 기준으로 돌기 때문에, 방금 바꾼 값이 있다면 먼저 저장해
							주세요.
						</p>
					</form>
				</CardContent>
			</Card>

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
								수집한 커뮤니티 글이 「일 이야기」 게시판과 수다방 홈 미리보기에
								섞입니다. 우리 회원 글이 항상 먼저 나오고 남은 자리에 붙으며,
								「외부 수집」 배지가 달립니다. 좋아요·댓글·신고는 제공되지
								않아요.
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
					<div className="grid grid-cols-2 gap-3 md:grid-cols-4">
						{statusKeys.map((status) => (
							<div
								className="flex flex-col gap-1 rounded-md border p-3"
								key={status}
							>
								<span className="text-muted-foreground text-xs">
									{CRAWLED_POST_STATUS_LABELS[status]}
								</span>
								<span className="font-semibold text-lg">
									{byStatus[status] ?? 0}
								</span>
							</div>
						))}
						<div className="flex flex-col gap-1 rounded-md border p-3">
							<span className="text-muted-foreground text-xs">전환됨</span>
							<span className="font-semibold text-lg">
								{summaryQuery.data?.converted ?? 0}
							</span>
						</div>
					</div>
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
											<TableCell className="text-right">
												{run.itemsSeen}
											</TableCell>
											<TableCell className="text-right">
												{run.itemsNew}
											</TableCell>
											<TableCell className="text-right">
												{run.itemsUpdated}
											</TableCell>
											<TableCell className="text-right">
												{run.itemsFailed}
											</TableCell>
											<TableCell className="text-muted-foreground text-xs">
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
