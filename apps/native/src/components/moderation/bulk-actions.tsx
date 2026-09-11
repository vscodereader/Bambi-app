import { BULK_MODERATION_TARGET_LIMIT } from "@bambi-app/api/services/bambi-moderation-bulk";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Button, Switch } from "heroui-native";
import { type ReactNode, useState } from "react";
import { Text, View } from "react-native";
import { ReasonDialog } from "@/src/components/moderation/reason-dialog";
import { orpc } from "@/src/lib/orpc";

type Kind = "jobs" | "reports" | "users";
interface Result {
	failed: number;
	failures: { targetId: string; message: string }[];
	succeeded: number;
}
export function useBulkSelection(scope: string) {
	const [state, setState] = useState({ scope, ids: [] as string[] });
	const ids = state.scope === scope ? state.ids : [];
	return {
		ids,
		setIds: (next: string[]) => setState({ scope, ids: next }),
		toggle: (id: string) =>
			setState({
				scope,
				ids: ids.includes(id)
					? ids.filter((item) => item !== id)
					: [...ids, id],
			}),
	};
}
export function SelectableModerationRow({
	children,
	selected,
	onToggle,
}: {
	children: ReactNode;
	selected: boolean;
	onToggle: () => void;
}) {
	return (
		<View className="gap-2">
			<View className="flex-row items-center gap-2">
				<Switch
					accessibilityLabel="일괄 처리 대상으로 선택"
					isSelected={selected}
					onSelectedChange={onToggle}
				/>
				<Text className="text-muted text-xs">선택</Text>
			</View>
			{children}
		</View>
	);
}
export function BulkActions({
	kind,
	ids,
	onChanged,
}: {
	kind: Kind;
	ids: string[];
	onChanged: (ids: string[]) => void;
}) {
	const [action, setAction] = useState<string | null>(null);
	const [result, setResult] = useState<Result | null>(null);
	const jobs = useMutation(
		orpc.bambi.moderation.bulkSetJobPostStatus.mutationOptions()
	);
	const reports = useMutation(
		orpc.bambi.moderation.bulkSetReportStatus.mutationOptions()
	);
	const users = useMutation(
		orpc.bambi.moderation.bulkSetUserStatus.mutationOptions()
	);
	const client = useQueryClient();
	const actions =
		kind === "jobs"
			? [
					{ value: "published", label: "승인" },
					{ value: "on_hold", label: "보류" },
					{ value: "rejected", label: "반려" },
				]
			: [
					{ value: "reviewing", label: "검토 중" },
					{ value: "resolved", label: "조치 완료" },
					{ value: "dismissed", label: "신고 기각" },
				];
	const options =
		kind === "users"
			? [
					{ value: "warned", label: "경고" },
					{ value: "suspended", label: "이용 제한" },
					{ value: "active", label: "정상 복구" },
				]
			: actions;
	const confirm = async (reason: string) => {
		let response: Result;
		if (
			kind === "jobs" &&
			(action === "published" || action === "on_hold" || action === "rejected")
		) {
			response = await jobs.mutateAsync({
				jobPostIds: ids,
				status: action,
				reason,
			});
		} else if (
			kind === "reports" &&
			(action === "dismissed" ||
				action === "reviewing" ||
				action === "resolved")
		) {
			response = await reports.mutateAsync({
				reportIds: ids,
				status: action,
				reason,
			});
		} else if (
			kind === "users" &&
			(action === "active" || action === "warned" || action === "suspended")
		) {
			response = await users.mutateAsync({
				targetUserIds: ids,
				status: action,
				reason,
			});
		} else {
			return false;
		}
		setResult(response);
		onChanged(response.failures.map((failure) => failure.targetId));
		setAction(null);
		await client.invalidateQueries({ queryKey: orpc.bambi.moderation.key() });
		return true;
	};
	return (
		<View className="gap-2 px-4 py-2">
			<Text className="text-muted text-xs">
				선택 {ids.length}건 · 한 번에 최대 {BULK_MODERATION_TARGET_LIMIT}건
			</Text>
			<View className="flex-row flex-wrap gap-2">
				{options.map((option) => (
					<Button
						isDisabled={
							!ids.length ||
							ids.length > BULK_MODERATION_TARGET_LIMIT ||
							jobs.isPending ||
							reports.isPending ||
							users.isPending
						}
						key={option.value}
						onPress={() => setAction(option.value)}
						size="sm"
						variant="secondary"
					>
						<Button.Label>{option.label}</Button.Label>
					</Button>
				))}
				{ids.length ? (
					<Button onPress={() => onChanged([])} size="sm" variant="ghost">
						<Button.Label>선택 해제</Button.Label>
					</Button>
				) : null}
			</View>
			{result ? (
				<View>
					<Text className="text-foreground text-sm">
						성공 {result.succeeded}건 · 실패 {result.failed}건
					</Text>
					{result.failures.map((failure) => (
						<Text className="text-danger text-xs" key={failure.targetId}>
							{failure.message}
						</Text>
					))}
				</View>
			) : null}
			<ReasonDialog
				confirmLabel="적용"
				defaultReason=""
				description={`${ids.length}건에 같은 조치와 사유를 적용합니다. 실패한 항목만 선택 상태로 남습니다.`}
				isOpen={action !== null}
				onConfirm={confirm}
				onOpenChange={(open) => {
					if (!open) {
						setAction(null);
					}
				}}
				title="선택 항목 일괄 처리"
			/>
		</View>
	);
}
