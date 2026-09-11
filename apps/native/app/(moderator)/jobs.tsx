import { jobPostStatusLabel } from "@bambi-app/api/services/bambi-moderation-labels";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { type Href, router } from "expo-router";
import {
	Button,
	Input,
	SearchField,
	Surface,
	TextField,
	useToast,
} from "heroui-native";
import { useMemo, useState } from "react";
import { Alert, Text, View } from "react-native";

import {
	BambiHeader,
	BambiScreen,
	formatPay,
	Pill,
	StateCard,
} from "@/src/components/bambi-screen";
import { FieldSelect } from "@/src/components/field-select";
import { ReasonDialog } from "@/src/components/moderation/reason-dialog";
import { orpc } from "@/src/lib/orpc";
import { useDebouncedValue } from "@/src/lib/use-debounced-value";

type Status =
	| "all"
	| "hidden"
	| "on_hold"
	| "pending_review"
	| "published"
	| "rejected";
type Action = null | {
	id: string;
	kind: "listing" | "status" | "exposure" | "delete";
	status?: Exclude<Status, "all">;
};
const STATUS = [
	"all",
	"pending_review",
	"on_hold",
	"published",
	"hidden",
	"rejected",
].map((value) => ({
	label: value === "all" ? "전체 상태" : jobPostStatusLabel(value),
	value,
}));

export default function ModeratorJobsScreen() {
	const [status, setStatus] = useState<Status>("all");
	const [search, setSearch] = useState("");
	const [action, setAction] = useState<Action>(null);
	const [days, setDays] = useState<Record<string, string>>({});
	const client = useQueryClient();
	const { toast } = useToast();
	const query = useQuery(
		orpc.bambi.moderation.listJobPosts.queryOptions({
			input: { limit: 100, status: status === "all" ? undefined : status },
		})
	);
	const setStatusMutation = useMutation(
		orpc.bambi.moderation.setJobPostStatus.mutationOptions()
	);
	const removeListing = useMutation(
		orpc.bambi.moderation.removeFromListingQueue.mutationOptions()
	);
	const adjust = useMutation(
		orpc.bambi.moderation.adjustJobPostExposure.mutationOptions()
	);
	const remove = useMutation(
		orpc.bambi.moderation.adminDeleteJobPost.mutationOptions()
	);
	const keyword = useDebouncedValue(search).trim().toLowerCase();
	const rows = useMemo(
		() =>
			(query.data ?? []).filter(
				(row) =>
					!keyword ||
					[row.title, row.organizationDisplayName, row.region].some((value) =>
						value.toLowerCase().includes(keyword)
					)
			),
		[keyword, query.data]
	);
	const refresh = async () => {
		await Promise.all([
			client.invalidateQueries({
				queryKey: orpc.bambi.moderation.listJobPosts.key(),
			}),
			client.invalidateQueries({
				queryKey: orpc.bambi.moderation.listJobsForPayment.key(),
			}),
		]);
	};
	const confirmAction = async (reason: string) => {
		if (!action) {
			return false;
		}
		if (action.kind === "listing") {
			await removeListing.mutateAsync({ jobPostId: action.id, reason });
		} else if (action.kind === "exposure") {
			await adjust.mutateAsync({
				jobPostId: action.id,
				days: Number(days[action.id]),
				reason,
			});
		} else if (action.kind === "delete") {
			await remove.mutateAsync({ jobPostId: action.id, reason });
		} else if (action.status) {
			await setStatusMutation.mutateAsync({
				jobPostId: action.id,
				reason,
				status: action.status,
			});
		}
		await refresh();
		setAction(null);
		toast.show({ label: "공고 상태를 변경했어요." });
		return true;
	};
	const adjustDays = (id: string) => {
		const value = Number(days[id]);
		if (
			!Number.isInteger(value) ||
			value === 0 ||
			value < -365 ||
			value > 365
		) {
			toast.show({
				label: "조정 일수는 -365~365 사이의 0이 아닌 정수여야 해요.",
				variant: "danger",
			});
			return;
		}
		setAction({ id, kind: "exposure" });
	};
	const deleteJob = (id: string, title: string) =>
		Alert.alert(
			"공고를 삭제할까요?",
			`${title}과 연결된 채팅·후기·이미지가 함께 삭제되며 되돌릴 수 없어요.`,
			[
				{ style: "cancel", text: "취소" },
				{
					style: "destructive",
					text: "삭제",
					onPress: () => setAction({ id, kind: "delete" }),
				},
			]
		);

	return (
		<BambiScreen>
			<BambiHeader
				description="공고 상태·노출·대기열을 확인하고 조치합니다."
				title="공고 관리"
			/>
			<SearchField onChange={setSearch} value={search}>
				<SearchField.Group>
					<SearchField.SearchIcon />
					<SearchField.Input placeholder="제목·업소·지역 검색" />
					<SearchField.ClearButton />
				</SearchField.Group>
			</SearchField>
			<FieldSelect
				isLabelHidden
				label="공고 상태"
				onChange={(value) => setStatus(value as Status)}
				options={STATUS}
				placeholder="전체 상태"
				value={status}
			/>
			{query.isError ? (
				<StateCard
					action={
						<Button onPress={() => query.refetch()} size="sm">
							<Button.Label>다시 시도</Button.Label>
						</Button>
					}
					description="네트워크 연결을 확인해 주세요."
					title="공고를 불러오지 못했어요"
				/>
			) : null}
			{query.isSuccess && rows.length === 0 ? (
				<StateCard
					description="검색어나 상태 필터를 바꿔보세요."
					title="표시할 공고가 없어요"
				/>
			) : null}
			{rows.map((row) => (
				<Surface
					className="gap-3 rounded-lg p-4"
					key={row.id}
					variant="secondary"
				>
					<View className="flex-row flex-wrap gap-2">
						<Button
							onPress={() =>
								router.push(`/(moderator)/jobs/${row.id}/edit` as Href)
							}
							size="sm"
							variant="secondary"
						>
							<Button.Label>수정</Button.Label>
						</Button>
						<Pill>{jobPostStatusLabel(row.status)}</Pill>
						<Pill>{row.region}</Pill>
						{row.paymentStatus ? (
							<Pill tone={row.paymentStatus === "paid" ? "success" : "warning"}>
								{row.paymentStatus === "paid" ? "결제 완료" : "미결제"}
							</Pill>
						) : null}
					</View>
					<Text className="font-bold text-foreground">{row.title}</Text>
					<Text className="text-muted text-sm">
						{row.organizationDisplayName} ·{" "}
						{formatPay(row.payAmount, row.payUnit)}
					</Text>
					<View className="flex-row gap-2">
						<TextField className="flex-1">
							<Input
								keyboardType="numbers-and-punctuation"
								onChangeText={(value) =>
									setDays((current) => ({ ...current, [row.id]: value }))
								}
								placeholder="노출 조정 일수"
								value={days[row.id] ?? ""}
							/>
						</TextField>
						<Button
							isDisabled={adjust.isPending}
							onPress={() => adjustDays(row.id)}
							size="sm"
							variant="secondary"
						>
							<Button.Label>기간 조정</Button.Label>
						</Button>
					</View>
					<View className="flex-row flex-wrap gap-2">
						<Button
							onPress={() =>
								setAction({
									id: row.id,
									kind: "status",
									status: row.status === "hidden" ? "published" : "hidden",
								})
							}
							size="sm"
							variant="secondary"
						>
							<Button.Label>
								{row.status === "hidden" ? "복구" : "숨김"}
							</Button.Label>
						</Button>
						{row.listingQueuePosition === null ? null : (
							<Button
								onPress={() => setAction({ id: row.id, kind: "listing" })}
								size="sm"
								variant="secondary"
							>
								<Button.Label>대기열 제거</Button.Label>
							</Button>
						)}
						<Button
							onPress={() => deleteJob(row.id, row.title)}
							size="sm"
							variant="danger"
						>
							<Button.Label>삭제</Button.Label>
						</Button>
					</View>
				</Surface>
			))}
			{action ? (
				<ReasonDialog
					confirmLabel="적용"
					danger={action.kind === "status" && action.status === "hidden"}
					defaultReason=""
					description="조치 사유는 감사 기록과 사용자 알림에 남아요."
					isOpen
					onConfirm={confirmAction}
					onOpenChange={(open) => {
						if (!open) {
							setAction(null);
						}
					}}
					title={action.kind === "listing" ? "대기열 제거" : "공고 상태 변경"}
				/>
			) : null}
		</BambiScreen>
	);
}
