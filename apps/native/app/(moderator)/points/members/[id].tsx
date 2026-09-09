import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocalSearchParams } from "expo-router";
import { Button, Surface } from "heroui-native";
import { useState } from "react";
import { Text, View } from "react-native";
import {
	BambiHeader,
	BambiScreen,
	ErrorState,
	LoadingState,
} from "@/src/components/bambi-screen";
import { AttendanceCalendar } from "@/src/components/moderation/attendance-calendar";
import { ReasonDialog } from "@/src/components/moderation/reason-dialog";
import { orpc } from "@/src/lib/orpc";

export default function PointMemberScreen() {
	const { id } = useLocalSearchParams<{ id: string }>();
	const [page, setPage] = useState(1);
	const [gradeId, setGradeId] = useState<string | null>(null);
	const member = useQuery(
		orpc.bambi.pointSettings.getAdminMember.queryOptions({
			input: { userId: id },
		})
	);
	const history = useQuery(
		orpc.bambi.pointSettings.listAdminMemberHistory.queryOptions({
			input: { userId: id, page, pageSize: 10 },
		})
	);
	const grades = useQuery(orpc.bambi.memberGrades.list.queryOptions());
	const setGrade = useMutation(
		orpc.bambi.attendance.adminSetGradeAnchor.mutationOptions()
	);
	const client = useQueryClient();
	if (member.isPending) {
		return <LoadingState label="회원 포인트를 불러오고 있어요." />;
	}
	if (member.isError || !member.data) {
		return <ErrorState onRetry={() => member.refetch()} />;
	}
	return (
		<BambiScreen>
			<BambiHeader
				description={`현재 잔액 ${member.data.pointBalance.toLocaleString("ko-KR")}P`}
				title={`${member.data.name} 포인트`}
			/>
			<AttendanceCalendar userId={id} />
			<Text className="font-bold text-foreground">등급 기준 변경</Text>
			<View className="flex-row flex-wrap gap-2">
				{grades.data?.map((grade) => (
					<Button
						key={grade.id}
						onPress={() => setGradeId(grade.id)}
						size="sm"
						variant="secondary"
					>
						<Button.Label>{grade.name}</Button.Label>
					</Button>
				))}
			</View>
			<Text className="font-bold text-foreground">포인트 원장</Text>
			{history.isError ? (
				<ErrorState onRetry={() => history.refetch()} />
			) : null}
			{history.data?.items.map((item) => (
				<Surface
					className="gap-2 rounded-lg p-3"
					key={item.id}
					variant="secondary"
				>
					<Text className="font-semibold text-foreground">
						{item.description}
					</Text>
					<Text className="text-muted text-sm">
						{item.amount.toLocaleString("ko-KR")}P · 잔액{" "}
						{item.balanceAfter.toLocaleString("ko-KR")}P
					</Text>
					<Text className="text-muted text-xs">
						{item.processor} ·{" "}
						{new Date(item.createdAt).toLocaleString("ko-KR", {
							timeZone: "Asia/Seoul",
						})}
					</Text>
				</Surface>
			))}
			<View className="flex-row justify-between">
				<Button
					isDisabled={page <= 1}
					onPress={() => setPage(page - 1)}
					size="sm"
					variant="secondary"
				>
					<Button.Label>이전</Button.Label>
				</Button>
				<Text className="text-muted">{page}</Text>
				<Button
					isDisabled={
						!history.data ||
						page * history.data.pageSize >= history.data.totalCount
					}
					onPress={() => setPage(page + 1)}
					size="sm"
					variant="secondary"
				>
					<Button.Label>다음</Button.Label>
				</Button>
			</View>
			<Text className="font-bold text-foreground">공고 결제 사용·환불</Text>
			{member.data.usageItems.map((item) => (
				<Text className="text-foreground text-sm" key={item.id}>
					{item.description} · {item.amount.toLocaleString("ko-KR")}P
				</Text>
			))}
			<ReasonDialog
				confirmLabel="변경"
				defaultReason=""
				description="포인트 잔액과 별도로 회원 등급의 기준을 변경합니다."
				isOpen={gradeId !== null}
				onConfirm={async (reason) => {
					if (!gradeId) {
						return false;
					}
					await setGrade.mutateAsync({ gradeId, reason, userId: id });
					await Promise.all([
						client.invalidateQueries({ queryKey: orpc.bambi.attendance.key() }),
						client.invalidateQueries({
							queryKey: orpc.bambi.pointSettings.key(),
						}),
					]);
					setGradeId(null);
					return true;
				}}
				onOpenChange={(open) => {
					if (!open) {
						setGradeId(null);
					}
				}}
				title="등급 기준 변경"
			/>
		</BambiScreen>
	);
}
