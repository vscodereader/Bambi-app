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
	CRAWL_RUN_STATUS_LABELS,
	CRAWL_RUN_STATUS_VARIANTS,
	CRAWL_SOURCE_SITE_LABELS,
	CRAWL_SOURCE_SITES,
	CRAWLED_POST_STATUS_LABELS,
	type CrawlSourceSite,
	formatCrawlTimestamp,
} from "@/lib/bambi/crawler";
import { orpc } from "@/utils/orpc";

export default function ModeratorCrawlerPage() {
	const queryClient = useQueryClient();

	const settingsQuery = useQuery(orpc.bambi.crawler.getSettings.queryOptions());
	const summaryQuery = useQuery(orpc.bambi.crawler.getSummary.queryOptions());
	const runsQuery = useQuery(orpc.bambi.crawler.listRuns.queryOptions());

	const [enabled, setEnabled] = useState(false);
	const [intervalHours, setIntervalHours] = useState("");
	const [sourceSite, setSourceSite] = useState<CrawlSourceSite>("foxalba");

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
		setSourceSite(data.sourceSite);
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
				if (result.reason === "disabled") {
					toast.error(
						"수집이 꺼져 있어요. 먼저 수집 사용을 켜고 저장해 주세요."
					);
					return;
				}

				if (result.reason === "already_running") {
					toast.error("이미 수집이 진행 중이에요. 끝난 뒤에 다시 눌러 주세요.");
					return;
				}

				if (result.reason === "not_implemented") {
					toast.error(
						"이 사이트 수집기는 아직 준비 중이에요. 여우알바를 선택해 주세요."
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

		saveMutation.mutate({ enabled, intervalHours: parsed, sourceSite });
	};

	const defaultHours = settingsQuery.data?.defaultIntervalHours ?? 6;
	const byStatus = summaryQuery.data?.byStatus ?? {};
	const statusKeys = Object.keys(
		CRAWLED_POST_STATUS_LABELS
	) as (keyof typeof CRAWLED_POST_STATUS_LABELS)[];
	// 파서가 구현된 사이트. 선택은 되지만 미구현 사이트는 "준비 중" 안내를 띄운다.
	const implementedSites = settingsQuery.data?.implementedSites ?? ["foxalba"];
	const selectedSiteReady = implementedSites.includes(sourceSite);

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
							<ToggleGroup
								aria-label="수집 대상 사이트"
								className="w-full flex-wrap"
								onValueChange={(value) => {
									const next = value.at(-1);
									if (next) {
										setSourceSite(next as CrawlSourceSite);
									}
								}}
								value={[sourceSite]}
							>
								{CRAWL_SOURCE_SITES.map((site) => (
									<ToggleGroupItem key={site} value={site}>
										{CRAWL_SOURCE_SITE_LABELS[site]}
										{implementedSites.includes(site) ? null : " (준비 중)"}
									</ToggleGroupItem>
								))}
							</ToggleGroup>
							<p className="m-0 text-muted-foreground text-xs">
								한 번에 한 사이트만 수집합니다. 대상을 바꾸면 다음 회차부터
								적용돼요.
							</p>
							{selectedSiteReady ? null : (
								<Alert>
									<AlertDescription>
										{CRAWL_SOURCE_SITE_LABELS[sourceSite]} 수집기는 아직 준비
										중이라, 선택해 저장해도 실제 수집은 돌지 않습니다. 파서가
										준비되면 자동으로 켜집니다.
									</AlertDescription>
								</Alert>
							)}
						</div>

						<div className="flex items-start justify-between gap-4">
							<div className="flex flex-col gap-1">
								<Label htmlFor="crawlEnabled">수집 사용</Label>
								<p className="m-0 text-muted-foreground text-xs">
									꺼두면 서버를 재시작하지 않아도 다음 틱부터 즉시 멈춥니다.
									기본값은 꺼짐이라 배포만으로는 아무것도 수집하지 않아요.
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
									!settingsQuery.data?.enabled ||
									!selectedSiteReady
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
							주세요. 수집이 꺼져 있으면 눌러도 실행되지 않습니다.
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
											<TableCell>
												{CRAWL_SOURCE_SITE_LABELS[run.sourceSite]}
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
									: "수집을 켜고 저장하면 다음 틱에 첫 회차가 시작됩니다. 지금 바로 돌려보려면 위 「즉시 수집」을 눌러 주세요."
							}
							title="아직 수집 기록이 없어요"
						/>
					)}
				</CardContent>
			</Card>
		</div>
	);
}
