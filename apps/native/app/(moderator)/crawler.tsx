import { buildCrawledLeadsCsv } from "@bambi-app/api/services/bambi-crawled-leads-csv";
import {
	CRAWL_RUN_STATUS_LABELS,
	CRAWL_SOURCE_SITE_LABELS,
	CRAWLED_POST_STATUS_LABELS,
} from "@bambi-app/api/services/bambi-crawler-labels";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { type Href, router } from "expo-router";
import {
	Button,
	Input,
	Surface,
	Switch,
	TextField,
	useToast,
} from "heroui-native";
import { useState } from "react";
import { Alert, Text, View } from "react-native";
import {
	BambiHeader,
	BambiScreen,
	Pill,
	StateCard,
} from "@/src/components/bambi-screen";
import { FieldSelect } from "@/src/components/field-select";
import { CrawledExposureSettings } from "@/src/components/moderation/crawled-exposure-settings";
import { FilterChips } from "@/src/components/moderation/filter-chips";
import { industryOptions } from "@/src/lib/bambi-native";
import { saveManagedFile } from "@/src/lib/managed-file";
import { orpc } from "@/src/lib/orpc";

type Tab = "settings" | "jobs" | "community" | "runs";
const TABS = [
	{ label: "설정", value: "settings" },
	{ label: "공고", value: "jobs" },
	{ label: "수집 글", value: "community" },
	{ label: "회차", value: "runs" },
] as const;

export default function ModeratorCrawlerScreen() {
	const [selectedJobs, setSelectedJobs] = useState<string[]>([]);
	const [jobStatus, setJobStatus] = useState<
		"active" | "needs_review" | "expired" | "removed" | undefined
	>(undefined);
	const industry = useMutation(
		orpc.bambi.crawler.setIndustryCategory.mutationOptions()
	);
	const removeSelected = useMutation(
		orpc.bambi.crawler.removePosts.mutationOptions()
	);
	const [exporting, setExporting] = useState(false);
	const [tab, setTab] = useState<Tab>("settings");
	const [topicFilter, setTopicFilter] = useState<"all" | "active" | "removed">(
		"all"
	);
	const [offset, setOffset] = useState(0);
	const client = useQueryClient();
	const { toast } = useToast();
	const settings = useQuery(orpc.bambi.crawler.getSettings.queryOptions());
	const summary = useQuery(orpc.bambi.crawler.getSummary.queryOptions());
	const jobs = useQuery(
		orpc.bambi.crawler.list.queryOptions({
			input: { limit: 30, offset, status: jobStatus },
		})
	);
	const topics = useQuery(
		orpc.bambi.crawler.listTopics.queryOptions({
			input: {
				limit: 30,
				offset,
				removed: topicFilter === "all" ? undefined : topicFilter === "removed",
			},
		})
	);
	const runs = useQuery(orpc.bambi.crawler.listRuns.queryOptions());
	const update = useMutation(
		orpc.bambi.crawler.updateSettings.mutationOptions()
	);
	const run = useMutation(orpc.bambi.crawler.runNow.mutationOptions());
	const clear = useMutation(orpc.bambi.crawler.clearRuns.mutationOptions());
	const removeJob = useMutation(
		orpc.bambi.crawler.removePost.mutationOptions()
	);
	const restoreJob = useMutation(
		orpc.bambi.crawler.restorePost.mutationOptions()
	);
	const removeTopic = useMutation(
		orpc.bambi.crawler.removeTopic.mutationOptions()
	);
	const restoreTopic = useMutation(
		orpc.bambi.crawler.restoreTopic.mutationOptions()
	);
	const refresh = () =>
		client.invalidateQueries({ queryKey: orpc.bambi.crawler.key() });
	const act = async (action: () => Promise<unknown>, label: string) => {
		try {
			await action();
			await refresh();
			toast.show({ label });
		} catch (error) {
			toast.show({
				label: error instanceof Error ? error.message : "처리하지 못했어요.",
				variant: "danger",
			});
		}
	};
	return (
		<BambiScreen>
			<BambiHeader
				description="수집 설정, 회차와 수집된 공고·게시물을 관리합니다."
				title="수집 관리"
			/>
			<FilterChips
				onChange={(next) => {
					setTab(next);
					setOffset(0);
				}}
				options={TABS}
				value={tab}
			/>
			<Button
				isDisabled={exporting}
				onPress={async () => {
					setExporting(true);
					try {
						const rows = await client.fetchQuery(
							orpc.bambi.crawler.exportLeads.queryOptions()
						);
						const csv = buildCrawledLeadsCsv(rows);
						const result = await saveManagedFile({
							bytes: new TextEncoder().encode(csv),
							fileName: `크롤링공고_${new Date().toISOString().slice(0, 10)}.csv`,
							mimeType: "text/csv",
						});
						if (result.status === "failed") {
							throw new Error(result.message);
						}
						if (result.status === "saved") {
							toast.show({ label: "CSV 파일을 저장했어요." });
						}
					} catch (error) {
						toast.show({
							label:
								error instanceof Error
									? error.message
									: "CSV를 저장하지 못했어요.",
							variant: "danger",
						});
					} finally {
						setExporting(false);
					}
				}}
				size="sm"
				variant="secondary"
			>
				<Button.Label>CSV 내보내기</Button.Label>
			</Button>
			{summary.data ? (
				<Text className="text-muted text-sm">
					변환 {summary.data.converted}건 · 상태{" "}
					{Object.entries(summary.data.byStatus)
						.map(
							([key, value]) =>
								`${(CRAWLED_POST_STATUS_LABELS as Record<string, string>)[key] ?? "상태 확인 필요"} ${value}`
						)
						.join(" · ")}
				</Text>
			) : null}
			{tab === "settings" && settings.data ? (
				<View className="gap-3">
					<CrawlerSettings
						data={settings.data}
						onRun={(input) =>
							act(() => run.mutateAsync(input), "수집 실행을 접수했어요.")
						}
						onSave={(input) =>
							act(() => update.mutateAsync(input), "수집 설정을 저장했어요.")
						}
						pending={update.isPending}
						running={run.isPending}
					/>
					<CrawledExposureSettings />
				</View>
			) : null}
			{tab === "jobs" ? (
				<>
					<View className="flex-row flex-wrap gap-2">
						{(
							[
								undefined,
								"active",
								"needs_review",
								"expired",
								"removed",
							] as const
						).map((status) => (
							<Button
								key={status ?? "all"}
								onPress={() => {
									setJobStatus(status);
									setOffset(0);
									setSelectedJobs([]);
								}}
								size="sm"
								variant={jobStatus === status ? "primary" : "secondary"}
							>
								<Button.Label>
									{status ? CRAWLED_POST_STATUS_LABELS[status] : "전체"}
								</Button.Label>
							</Button>
						))}
					</View>
					<Button
						isDisabled={!selectedJobs.length || removeSelected.isPending}
						onPress={() =>
							Alert.alert(
								"선택 공고 내리기",
								`${selectedJobs.length}개 수집 공고를 목록에서 내릴까요?`,
								[
									{ text: "취소", style: "cancel" },
									{
										text: "내리기",
										style: "destructive",
										onPress: () =>
											act(async () => {
												await removeSelected.mutateAsync({ ids: selectedJobs });
												setSelectedJobs([]);
											}, "선택한 공고를 내렸어요."),
									},
								]
							)
						}
						size="sm"
						variant="danger-soft"
					>
						<Button.Label>선택 {selectedJobs.length}개 내리기</Button.Label>
					</Button>
					{jobs.isError ? (
						<StateCard
							description="잠시 후 다시 시도해 주세요."
							title="수집 공고를 불러오지 못했어요"
						/>
					) : null}
					{jobs.data?.items.map((item) => (
						<Surface
							className="gap-2 rounded-lg p-4"
							key={item.id}
							variant="secondary"
						>
							<Switch
								accessibilityLabel="내릴 공고 선택"
								isSelected={selectedJobs.includes(item.id)}
								onSelectedChange={(checked) =>
									setSelectedJobs((current) =>
										checked
											? [...current, item.id]
											: current.filter((id) => id !== item.id)
									)
								}
							/>
							<Text className="font-bold text-foreground">{item.title}</Text>
							<FieldSelect
								label="업종 분류"
								onChange={(value) => {
									const category = industryOptions.find(
										(option) => option === value
									);
									if (category) {
										act(
											() =>
												industry.mutateAsync({
													id: item.id,
													industryCategory: category,
												}),
											"업종을 저장했어요."
										);
									}
								}}
								options={industryOptions.map((value) => ({
									value,
									label: value,
								}))}
								placeholder="업종 선택"
								value={item.industryCategory ?? ""}
							/>
							<View className="flex-row gap-2">
								<Pill>{CRAWLED_POST_STATUS_LABELS[item.status]}</Pill>
								{item.industryCategory ? (
									<Pill>{item.industryCategory}</Pill>
								) : null}
							</View>
							<Button
								onPress={() =>
									act(
										() =>
											item.status === "removed"
												? restoreJob.mutateAsync({ id: item.id })
												: removeJob.mutateAsync({ id: item.id }),
										item.status === "removed"
											? "복구했어요."
											: "목록에서 내렸어요."
									)
								}
								size="sm"
								variant="secondary"
							>
								<Button.Label>
									{item.status === "removed" ? "복구" : "내리기"}
								</Button.Label>
							</Button>
							{item.status === "active" ? (
								<Button
									onPress={() =>
										router.push(
											`/(moderator)/crawler/jobs/${item.id}/edit` as Href
										)
									}
									size="sm"
									variant="secondary"
								>
									<Button.Label>이미지 편집</Button.Label>
								</Button>
							) : null}
						</Surface>
					))}
					<Pager
						count={jobs.data?.items.length ?? 0}
						offset={offset}
						onChange={setOffset}
					/>
				</>
			) : null}
			{tab === "community" ? (
				<>
					<FilterChips
						onChange={(value) => {
							setTopicFilter(value);
							setOffset(0);
						}}
						options={[
							{ value: "all", label: "전체" },
							{ value: "active", label: "노출 중" },
							{ value: "removed", label: "내린 글" },
						]}
						value={topicFilter}
					/>
					{topics.data?.items.map((item) => (
						<Surface
							className="gap-2 rounded-lg p-4"
							key={item.id}
							variant="secondary"
						>
							<Text className="font-bold text-foreground">{item.title}</Text>
							<Text className="text-muted text-sm">
								조회 {item.viewCount} · 댓글 {item.commentCount}
							</Text>
							<Button
								onPress={() =>
									act(
										() =>
											item.removedAt
												? restoreTopic.mutateAsync({ id: item.id })
												: removeTopic.mutateAsync({ id: item.id }),
										item.removedAt ? "복구했어요." : "목록에서 내렸어요."
									)
								}
								size="sm"
								variant="secondary"
							>
								<Button.Label>
									{item.removedAt ? "복구" : "내리기"}
								</Button.Label>
							</Button>
							<Button
								onPress={() =>
									router.push(
										`/(moderator)/crawler/community/${item.id}/edit` as Href
									)
								}
								size="sm"
								variant="secondary"
							>
								<Button.Label>편집</Button.Label>
							</Button>
						</Surface>
					))}
					<Pager
						count={topics.data?.items.length ?? 0}
						offset={offset}
						onChange={setOffset}
					/>
				</>
			) : null}
			{tab === "runs" ? (
				<>
					<Button
						isDisabled={clear.isPending}
						onPress={() =>
							Alert.alert("수집 기록 비우기", "회차 기록을 모두 지울까요?", [
								{ text: "취소", style: "cancel" },
								{
									text: "비우기",
									style: "destructive",
									onPress: () =>
										act(() => clear.mutateAsync({}), "수집 기록을 비웠어요."),
								},
							])
						}
						variant="danger-soft"
					>
						<Button.Label>기록 비우기</Button.Label>
					</Button>
					{runs.data?.map((item) => (
						<Surface
							className="gap-1 rounded-lg p-4"
							key={item.id}
							variant="secondary"
						>
							<Text className="font-bold text-foreground">
								{CRAWL_RUN_STATUS_LABELS[item.status]}
							</Text>
							<Text className="text-muted text-sm">
								{new Date(item.startedAt).toLocaleString("ko-KR")}
							</Text>
							{item.error ? (
								<Text className="text-danger text-sm">{item.error}</Text>
							) : null}
						</Surface>
					))}
				</>
			) : null}
		</BambiScreen>
	);
}

function Pager({
	offset,
	count,
	onChange,
}: {
	offset: number;
	count: number;
	onChange: (value: number) => void;
}) {
	return (
		<View className="flex-row justify-between">
			<Button
				isDisabled={offset === 0}
				onPress={() => onChange(Math.max(0, offset - 30))}
				size="sm"
				variant="secondary"
			>
				<Button.Label>이전</Button.Label>
			</Button>
			<Button
				isDisabled={count < 30}
				onPress={() => onChange(offset + 30)}
				size="sm"
				variant="secondary"
			>
				<Button.Label>다음</Button.Label>
			</Button>
		</View>
	);
}

function CrawlerSettings({
	data,
	pending,
	running,
	onSave,
	onRun,
}: {
	data: {
		boardKey: string | null;
		editorGradeId: string | null;
		contentType: "job_post" | "community";
		enabled: boolean;
		intervalHours: number | null;
		defaultIntervalHours: number;
		sourceSite: "foxalba" | "queenalba";
	};
	pending: boolean;
	running: boolean;
	onSave: (input: {
		boardKey?: string | null;
		editorGradeId?: string | null;
		contentType: "job_post" | "community";
		enabled: boolean;
		intervalHours: number;
		sourceSite: "foxalba" | "queenalba";
	}) => void;
	onRun: (input: {
		contentType: "job_post" | "community";
		boardKey?: string;
	}) => void;
}) {
	const [enabled, setEnabled] = useState(data.enabled);
	const [hours, setHours] = useState(
		String(data.intervalHours ?? data.defaultIntervalHours)
	);
	const [contentType, setContentType] = useState(data.contentType);
	const [boardKey, setBoardKey] = useState(data.boardKey);
	const [editorGradeId, setEditorGradeId] = useState(data.editorGradeId);
	const boards = useQuery(orpc.bambi.communityBoards.list.queryOptions());
	const grades = useQuery(orpc.bambi.memberGrades.list.queryOptions());
	return (
		<Surface className="gap-3 rounded-lg p-4" variant="secondary">
			<View className="flex-row items-center justify-between">
				<Text className="font-bold text-foreground">자동 수집</Text>
				<Switch isSelected={enabled} onSelectedChange={setEnabled} />
			</View>
			<Text className="text-muted text-sm">
				{CRAWL_SOURCE_SITE_LABELS[data.sourceSite]} ·{" "}
				{contentType === "job_post" ? "공고" : "커뮤니티"}
			</Text>
			<Button
				onPress={() =>
					setContentType(contentType === "job_post" ? "community" : "job_post")
				}
				size="sm"
				variant="secondary"
			>
				<Button.Label>수집 종류 변경</Button.Label>
			</Button>
			{contentType === "community" ? (
				<>
					<FieldSelect
						label="수집 목적 게시판"
						onChange={setBoardKey}
						options={(boards.data ?? []).map((board) => ({
							value: board.key,
							label: board.label,
						}))}
						placeholder="게시판 선택"
						value={boardKey ?? ""}
					/>
					<FieldSelect
						label="수집 글 편집 등급"
						onChange={setEditorGradeId}
						options={(grades.data ?? []).map((grade) => ({
							value: grade.id,
							label: grade.name,
						}))}
						placeholder="등급 선택"
						value={editorGradeId ?? ""}
					/>
				</>
			) : null}
			<TextField>
				<Input
					keyboardType="number-pad"
					onChangeText={setHours}
					placeholder="수집 주기(시간)"
					value={hours}
				/>
			</TextField>
			<Button
				isDisabled={pending || Number(hours) < 1 || Number(hours) > 720}
				onPress={() =>
					onSave({
						boardKey,
						editorGradeId,
						contentType,
						enabled,
						intervalHours: Number(hours),
						sourceSite: data.sourceSite,
					})
				}
			>
				<Button.Label>설정 저장</Button.Label>
			</Button>
			<Button
				isDisabled={
					running ||
					(contentType === "community" && !(boardKey && boards.isSuccess))
				}
				onPress={() =>
					onRun({
						contentType,
						boardKey:
							contentType === "community" ? (boardKey ?? undefined) : undefined,
					})
				}
				variant="secondary"
			>
				<Button.Label>지금 수집</Button.Label>
			</Button>
		</Surface>
	);
}
