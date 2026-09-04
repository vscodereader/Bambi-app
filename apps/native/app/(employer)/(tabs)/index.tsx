import type { AppRouterClient } from "@bambi-app/api/routers/index";
import { Ionicons } from "@expo/vector-icons";
import { useMutation, useQuery } from "@tanstack/react-query";
import { type Href, Link, router } from "expo-router";
import { Button, Dialog, Menu, Surface, useThemeColor } from "heroui-native";
import type { ComponentProps } from "react";
import { useState } from "react";
import { Alert, Pressable, Text, View } from "react-native";

import {
	BambiHeader,
	BambiScreen,
	ErrorState,
	formatPay,
	LoadingState,
	Pill,
	StateCard,
} from "@/src/components/bambi-screen";
import { FieldSelect } from "@/src/components/field-select";
import { localErrorMessage } from "@/src/lib/chat/chat-errors";
import { getEmployerGateNotice } from "@/src/lib/employer/business";
import {
	EMPLOYER_JOB_SORT_OPTIONS,
	type EmployerJobSort,
	sortEmployerJobs,
} from "@/src/lib/employer/job-sort";
import {
	countJobStatuses,
	type DeleteRefundPreview,
	getDeleteRefundDescription,
	getJobDisplayStatus,
	getJobStatusNote,
} from "@/src/lib/employer/job-status";
import { orpc, queryClient } from "@/src/lib/orpc";

const PLACEHOLDER_ID = "00000000-0000-0000-0000-000000000000";
const BUSINESS_HREF = "/(employer)/me/business" as Href;
const NEW_HREF = "/(employer)/new" as Href;
// 광고·성과는 공고관리에서만 닿는 하위 화면이다(웹 /employer 퀵링크와 같은 IA).
const QUICK_LINKS: {
	href: Href;
	icon: ComponentProps<typeof Ionicons>["name"];
	label: string;
}[] = [
	{
		href: "/(employer)/promotions" as Href,
		icon: "megaphone-outline",
		label: "광고 관리",
	},
	{
		href: "/(employer)/analytics" as Href,
		icon: "bar-chart-outline",
		label: "성과 분석",
	},
];
// 한 번에 보여줄 공고 수. 웹 목록 페이지 크기와 같다.
const JOB_PAGE_SIZE = 5;
// 옵션이 넷뿐이라 기본 시트(50%)보다 낮게 연다. 카드 액션 메뉴는 항목이 둘이라 같이 쓴다.
const SORT_SNAP_POINTS = ["35%"];
const MENU_SNAP_POINTS = SORT_SNAP_POINTS;

type EmployerJob = Awaited<
	ReturnType<AppRouterClient["bambi"]["jobs"]["listMine"]>
>[number];

// 광고·성과 화면 진입 타일. CardLink는 chevron 달린 전폭 행이라 두 개를 나란히 두면
// 화살표만 두 번 반복돼 시선이 갈린다 — 아이콘+라벨만 남긴 정사각 타일로 둔다.
function QuickLinks() {
	const foregroundColor = useThemeColor("foreground");

	return (
		<View className="flex-row gap-3">
			{QUICK_LINKS.map((item) => (
				<Link asChild href={item.href} key={item.label}>
					<Pressable
						accessibilityLabel={item.label}
						accessibilityRole="button"
						className="flex-1 rounded-lg active:opacity-75"
					>
						<Surface
							className="flex-row items-center gap-2 rounded-lg p-4"
							variant="secondary"
						>
							<Ionicons color={foregroundColor} name={item.icon} size={20} />
							<Text className="font-semibold text-foreground text-sm">
								{item.label}
							</Text>
						</Surface>
					</Pressable>
				</Link>
			))}
		</View>
	);
}

function StatTile({ label, value }: { label: string; value: number }) {
	return (
		<View className="flex-1 gap-1">
			<Text className="text-muted text-xs">{label}</Text>
			<Text className="font-extrabold text-foreground text-lg" selectable>
				{value}
			</Text>
		</View>
	);
}

// 카드마다 붙는 액션 메뉴. 버튼 두 개를 늘어놓으면 카드 하단이 액션에 먹혀서
// 목록을 훑기 어려워진다 — 아이콘 하나로 접고 눌렀을 때만 펼친다.
function JobActionsMenu({
	job,
	onDelete,
}: {
	job: EmployerJob;
	onDelete: (id: string) => void;
}) {
	const foreground = useThemeColor("foreground");

	return (
		// 팝오버가 아니라 바텀시트다. heroui의 popover 배치는 bottom placement에서
		// Dimensions.get("screen") 기준으로만 클램프하고 maxHeight를 걸지 않아, 목록 맨
		// 아래 카드에서 메뉴 끝이 제스처 내비 영역 뒤로 잘린다(팀원 카드에서 실제로 났다).
		// 시트는 트리거 위치와 무관하게 화면 하단에 붙으므로 그 실패가 아예 없다.
		<Menu presentation="bottom-sheet">
			<Menu.Trigger asChild>
				{/* 아이콘만 담되 터치 타깃은 44dp를 지킨다. */}
				<Pressable
					accessibilityLabel="공고 관리 메뉴"
					accessibilityRole="button"
					className="h-11 w-11 shrink-0 items-center justify-center rounded-2xl active:opacity-75"
				>
					<Ionicons color={foreground} name="settings-outline" size={20} />
				</Pressable>
			</Menu.Trigger>
			<Menu.Portal>
				<Menu.Overlay />
				{/* 항목이 둘뿐이라 정렬 시트와 같은 높이로 둔다. */}
				<Menu.Content presentation="bottom-sheet" snapPoints={MENU_SNAP_POINTS}>
					<Menu.Item
						onPress={() =>
							router.push({
								params: { id: job.id },
								pathname: "/(employer)/jobs/[id]/edit",
							} as unknown as Href)
						}
					>
						<Menu.ItemTitle>공고 수정</Menu.ItemTitle>
					</Menu.Item>
					<Menu.Item onPress={() => onDelete(job.id)} variant="danger">
						<Menu.ItemTitle>공고 삭제</Menu.ItemTitle>
					</Menu.Item>
				</Menu.Content>
			</Menu.Portal>
		</Menu>
	);
}

function JobCard({
	job,
	onDelete,
}: {
	job: EmployerJob;
	onDelete: (id: string) => void;
}) {
	const display = getJobDisplayStatus(job);
	const note = getJobStatusNote(job);

	return (
		<Surface className="gap-2 rounded-lg p-4" variant="secondary">
			<View className="flex-row items-start gap-2">
				{/* min-w-0이 없으면 긴 제목이 아이콘 버튼을 카드 밖으로 밀어낸다. */}
				<View className="min-w-0 flex-1 gap-2">
					<View className="flex-row flex-wrap items-center gap-2">
						<Pill tone={display.tone}>{display.label}</Pill>
						<Pill>{job.region}</Pill>
						{/* 세부지역은 선택 항목이라 값이 있을 때만 — 크롤 공고 상세와 같은 축. */}
						{job.district ? <Pill>{job.district}</Pill> : null}
					</View>
					<Text className="font-bold text-foreground text-lg" selectable>
						{job.title}
					</Text>
				</View>
				<JobActionsMenu job={job} onDelete={onDelete} />
			</View>
			<Text className="text-muted text-sm" selectable>
				{job.industryCategory} · {formatPay(job.payAmount, job.payUnit)}
			</Text>
			{note ? (
				<Text className="text-muted text-xs" selectable>
					{note}
				</Text>
			) : null}
		</Surface>
	);
}

// 정렬·노출 개수 state를 화면이 아니라 여기 둔다 — 화면은 로딩/에러에서 조기 return하므로
// 그 위에 훅을 더 얹을 수 없다.
function OwnedJobsSection({
	jobs,
	onDelete,
}: {
	jobs: readonly EmployerJob[];
	onDelete: (id: string) => void;
}) {
	const [sort, setSort] = useState<EmployerJobSort>("recent");
	const [visibleCount, setVisibleCount] = useState(JOB_PAGE_SIZE);
	const sortedJobs = sortEmployerJobs(jobs, sort);
	const visibleJobs = sortedJobs.slice(0, visibleCount);
	const remaining = sortedJobs.length - visibleJobs.length;

	return (
		<View className="gap-3">
			<View className="flex-row items-center justify-between gap-2">
				<Text className="font-bold text-base text-foreground">등록한 공고</Text>
				<Text className="text-muted text-sm">총 {sortedJobs.length}건</Text>
			</View>
			<FieldSelect
				isLabelHidden
				label="정렬"
				onChange={(value) => {
					setSort(value as EmployerJobSort);
					// 정렬이 바뀌면 위에서부터 다시 본다 — 이어보던 개수는 의미가 없다.
					setVisibleCount(JOB_PAGE_SIZE);
				}}
				options={EMPLOYER_JOB_SORT_OPTIONS}
				placeholder="정렬 방식"
				snapPoints={SORT_SNAP_POINTS}
				value={sort}
			/>
			{visibleJobs.map((job) => (
				<JobCard job={job} key={job.id} onDelete={onDelete} />
			))}
			{remaining > 0 ? (
				<Button
					accessibilityLabel="공고 더보기"
					onPress={() => setVisibleCount((count) => count + JOB_PAGE_SIZE)}
					variant="secondary"
				>
					<Button.Label>공고 더보기 ({remaining}건)</Button.Label>
				</Button>
			) : null}
		</View>
	);
}

function DeleteJobDialog({
	isDeleting,
	isOpen,
	isRefundLoading,
	onCancel,
	onConfirm,
	preview,
	title,
}: {
	isDeleting: boolean;
	isOpen: boolean;
	isRefundLoading: boolean;
	onCancel: () => void;
	onConfirm: () => void;
	preview: DeleteRefundPreview | undefined;
	title: string;
}) {
	const description = isRefundLoading
		? "환급 정보를 확인하고 있어요."
		: getDeleteRefundDescription(preview);

	return (
		<Dialog
			isOpen={isOpen}
			onOpenChange={(open) => {
				if (!open) {
					onCancel();
				}
			}}
		>
			<Dialog.Portal>
				<Dialog.Overlay />
				<Dialog.Content>
					<Dialog.Title>{`“${title}” 공고를 삭제할까요?`}</Dialog.Title>
					<Dialog.Description>{description}</Dialog.Description>
					<View className="flex-row justify-end gap-2 pt-2">
						<Pressable
							className="rounded-lg border border-border bg-background px-4 py-2 active:opacity-75"
							onPress={onCancel}
						>
							<Text className="font-semibold text-foreground">취소</Text>
						</Pressable>
						<Button
							isDisabled={isDeleting || isRefundLoading}
							onPress={onConfirm}
							variant="danger"
						>
							<Button.Label>{isDeleting ? "삭제 중" : "삭제"}</Button.Label>
						</Button>
					</View>
				</Dialog.Content>
			</Dialog.Portal>
		</Dialog>
	);
}

export default function EmployerJobsScreen() {
	const mineQuery = useQuery(orpc.bambi.onboarding.getMine.queryOptions());
	const jobsQuery = useQuery(orpc.bambi.jobs.listMine.queryOptions());
	const [deletingId, setDeletingId] = useState<null | string>(null);

	const refundQuery = useQuery({
		...orpc.bambi.jobs.getDeletePointRefundPreview.queryOptions({
			input: { id: deletingId ?? PLACEHOLDER_ID },
		}),
		enabled: deletingId !== null,
	});
	const preview = refundQuery.data as DeleteRefundPreview | undefined;

	const deleteMutation = useMutation(
		orpc.bambi.jobs.delete.mutationOptions({
			onError: (error) => {
				Alert.alert(
					"삭제하지 못했어요",
					localErrorMessage(
						error,
						"공고를 삭제하지 못했습니다. 삭제 권한을 확인한 뒤 다시 시도해 주세요."
					)
				);
			},
			onSuccess: async () => {
				setDeletingId(null);
				await queryClient.invalidateQueries({
					queryKey: orpc.bambi.jobs.listMine.queryKey(),
				});
				Alert.alert("삭제했어요", "공고가 삭제되었습니다.");
			},
		})
	);

	if (mineQuery.isLoading || jobsQuery.isLoading) {
		return <LoadingState label="공고를 불러오고 있습니다." />;
	}

	if (mineQuery.isError || jobsQuery.isError) {
		return (
			<ErrorState
				onRetry={() => {
					mineQuery.refetch();
					jobsQuery.refetch();
				}}
			/>
		);
	}

	const verificationStatus =
		mineQuery.data?.employerOrganizationProfiles[0]?.verificationStatus ??
		"none";
	const gate = getEmployerGateNotice(verificationStatus, "공고를 등록");
	const jobs = jobsQuery.data ?? [];
	const counts = countJobStatuses(jobs);
	const jobToDelete = jobs.find((job) => job.id === deletingId) ?? null;

	return (
		<BambiScreen>
			<BambiHeader
				action={
					<Link asChild href={NEW_HREF}>
						<Button size="sm" variant={gate ? "secondary" : undefined}>
							<Button.Label>공고 등록</Button.Label>
						</Button>
					</Link>
				}
				description="내 조직의 공고 상태를 확인하고 관리합니다."
				title="공고관리"
			/>

			{gate ? (
				<StateCard
					action={
						gate.actionLabel ? (
							<Link asChild href={BUSINESS_HREF}>
								<Button size="sm">
									<Button.Label>{gate.actionLabel}</Button.Label>
								</Button>
							</Link>
						) : undefined
					}
					description={gate.description}
					title={gate.title}
				/>
			) : null}

			{jobs.length > 0 ? (
				<Surface className="flex-row gap-3 rounded-lg p-4" variant="secondary">
					<StatTile label="게시" value={counts.published} />
					<StatTile label="검수 대기" value={counts.pendingReview} />
					<StatTile label="반려" value={counts.rejected} />
				</Surface>
			) : null}

			<QuickLinks />

			{jobs.length === 0 ? (
				<StateCard
					action={
						<Link asChild href={NEW_HREF}>
							<Button variant="secondary">
								<Button.Label>새 공고 등록</Button.Label>
							</Button>
						</Link>
					}
					description="조직 프로필을 선택해 첫 공고를 등록해 보세요."
					title="등록한 공고가 없어요"
				/>
			) : (
				<OwnedJobsSection jobs={jobs} onDelete={setDeletingId} />
			)}

			<DeleteJobDialog
				isDeleting={deleteMutation.isPending}
				isOpen={deletingId !== null}
				isRefundLoading={refundQuery.isLoading}
				onCancel={() => setDeletingId(null)}
				onConfirm={() => {
					if (!deletingId) {
						return;
					}
					deleteMutation.mutate({
						expectedForfeitedAmount: preview?.forfeitedAmount ?? 0,
						expectedRefundAmount: preview?.refundAmount ?? 0,
						id: deletingId,
					});
				}}
				preview={preview}
				title={jobToDelete?.title ?? ""}
			/>
		</BambiScreen>
	);
}
