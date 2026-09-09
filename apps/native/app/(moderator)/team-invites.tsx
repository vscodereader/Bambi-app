import { organizationRoleLabel } from "@bambi-app/api/services/bambi-team-labels";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button, Input, Surface, TextField, useToast } from "heroui-native";
import { useState } from "react";
import { Text, View } from "react-native";

import {
	BambiHeader,
	BambiScreen,
	Pill,
	StateCard,
} from "@/src/components/bambi-screen";
import { FilterChips } from "@/src/components/moderation/filter-chips";
import { orpc } from "@/src/lib/orpc";

type InviteStatus = "accepted" | "pending" | "rejected";
const PAGE_SIZE = 20;
const STATUS = [
	{ label: "대기", value: "pending" },
	{ label: "승인", value: "accepted" },
	{ label: "반려", value: "rejected" },
] as const;
const STATUS_LABELS: Record<InviteStatus, string> = {
	accepted: "승인 완료",
	pending: "승인 대기",
	rejected: "반려",
};

export default function ModeratorTeamInvitesScreen() {
	const [status, setStatus] = useState<InviteStatus>("pending");
	const [page, setPage] = useState(1);
	const [reasons, setReasons] = useState<Record<string, string>>({});
	const client = useQueryClient();
	const { toast } = useToast();
	const input = { page, pageSize: PAGE_SIZE, status } as const;
	const query = useQuery(
		orpc.bambi.moderation.listPendingTeamInvitations.queryOptions({ input })
	);
	const mutate = useMutation(
		orpc.bambi.moderation.setTeamInvitationStatus.mutationOptions({
			onSuccess: async () => {
				toast.show({ label: "팀 합류 요청을 처리했어요." });
				await client.invalidateQueries({
					queryKey: orpc.bambi.moderation.listPendingTeamInvitations.key(),
				});
			},
		})
	);
	const rows = query.data ?? [];
	const changeStatus = (next: InviteStatus) => {
		setStatus(next);
		setPage(1);
	};

	return (
		<BambiScreen>
			<BambiHeader
				description="업소가 보낸 팀 합류 요청을 확인하고 처리합니다."
				title="팀 합류 승인"
			/>
			<FilterChips onChange={changeStatus} options={STATUS} value={status} />
			{query.isError ? (
				<StateCard
					action={
						<Button onPress={() => query.refetch()} size="sm">
							<Button.Label>다시 시도</Button.Label>
						</Button>
					}
					description="네트워크 연결을 확인해 주세요."
					title="요청을 불러오지 못했어요"
				/>
			) : null}
			{query.isSuccess && rows.length === 0 ? (
				<StateCard
					description="이 상태의 팀 합류 요청이 없어요."
					title="표시할 요청이 없어요"
				/>
			) : null}
			{rows.map((row) => {
				const reason = (reasons[row.id] ?? "").trim();
				return (
					<Surface
						className="gap-3 rounded-lg p-4"
						key={row.id}
						variant="secondary"
					>
						<View className="flex-row flex-wrap gap-2">
							<Pill>{STATUS_LABELS[status]}</Pill>
							<Pill>{organizationRoleLabel(row.role)}</Pill>
						</View>
						<Text className="font-bold text-foreground">
							{row.organizationName ?? "업소 정보 없음"} ·{" "}
							{row.teamName ?? "팀 미지정"}
						</Text>
						<Text className="text-muted text-sm">
							초대자 {row.inviterName ?? "알 수 없음"} ·{" "}
							{row.inviterEmail ?? "이메일 없음"}
						</Text>
						<Text className="text-foreground text-sm">
							대상 {row.inviteeName ?? row.email}
						</Text>
						{row.inviteReason ? (
							<Text className="text-muted text-sm" selectable>
								초대 사유 · {row.inviteReason}
							</Text>
						) : null}
						{status === "pending" ? (
							<>
								<TextField>
									<Input
										onChangeText={(value) =>
											setReasons((current) => ({ ...current, [row.id]: value }))
										}
										placeholder="반려 사유(반려 시 2자 이상)"
										value={reasons[row.id] ?? ""}
									/>
								</TextField>
								<View className="flex-row gap-2">
									<Button
										isDisabled={mutate.isPending}
										onPress={() =>
											mutate.mutate({
												invitationId: row.id,
												status: "accepted",
											})
										}
										size="sm"
									>
										<Button.Label>승인</Button.Label>
									</Button>
									<Button
										isDisabled={mutate.isPending || reason.length < 2}
										onPress={() =>
											mutate.mutate({
												invitationId: row.id,
												reason,
												status: "rejected",
											})
										}
										size="sm"
										variant="danger"
									>
										<Button.Label>반려</Button.Label>
									</Button>
								</View>
							</>
						) : null}
					</Surface>
				);
			})}
			<View className="flex-row justify-between">
				<Button
					isDisabled={page <= 1 || query.isFetching}
					onPress={() => setPage((value) => value - 1)}
					size="sm"
					variant="tertiary"
				>
					<Button.Label>이전</Button.Label>
				</Button>
				<Text className="text-muted text-sm">{page} 페이지</Text>
				<Button
					isDisabled={rows.length < PAGE_SIZE || query.isFetching}
					onPress={() => setPage((value) => value + 1)}
					size="sm"
					variant="tertiary"
				>
					<Button.Label>다음</Button.Label>
				</Button>
			</View>
		</BambiScreen>
	);
}
