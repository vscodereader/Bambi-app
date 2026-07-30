"use client";

import { Alert, AlertDescription } from "@bambi-app/ui/components/alert";
import { Badge } from "@bambi-app/ui/components/badge";
import { Button } from "@bambi-app/ui/components/button";
import {
	Card,
	CardContent,
	CardHeader,
	CardTitle,
} from "@bambi-app/ui/components/card";
import { Input } from "@bambi-app/ui/components/input";
import { Label } from "@bambi-app/ui/components/label";
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
import { type FormEvent, useEffect, useState } from "react";
import { toast } from "sonner";

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
import { orpc } from "@/utils/orpc";

// 수집 대상은 퀸알바 하나뿐이라 선택기를 두지 않는다. 대상이 다시 늘면 이 상수를 state로
// 되돌리고 ToggleGroup을 세운다 — 서버 입력 스키마는 사이트를 계속 받는다.
const SOURCE_SITE: CrawlSourceSite = "queenalba";

export default function ModeratorCrawlerPage() {
	const queryClient = useQueryClient();

	const settingsQuery = useQuery(orpc.bambi.crawler.getSettings.queryOptions());
	const summaryQuery = useQuery(orpc.bambi.crawler.getSummary.queryOptions());
	const runsQuery = useQuery(orpc.bambi.crawler.listRuns.queryOptions());

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
						공고입니다. 버리지 않고 남겨두니 운영자가 직접 업종을 지정해 주세요.
					</p>
				</CardContent>
			</Card>

			<Card>
				<CardHeader>
					<CardTitle>최근 수집 회차</CardTitle>
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
				</CardContent>
			</Card>
		</div>
	);
}
