import { Button } from "heroui-native";
import { useRef, useState } from "react";
import { Alert, Text, View } from "react-native";
import { runContentBatch } from "@/src/lib/moderation/content-batch";
import { ReasonDialog } from "./reason-dialog";

type Status = "published" | "hidden" | "deleted";
export function ContentBatchActions({
	rows,
	selected,
	onSelected,
	onStatus,
	onPurge,
	onRefresh,
}: {
	rows: { id: string; status: Status }[];
	selected: string[];
	onSelected: (ids: string[]) => void;
	onStatus: (id: string, status: Status, reason: string) => Promise<unknown>;
	onPurge?: (id: string) => Promise<unknown>;
	onRefresh: () => Promise<void>;
}) {
	const [action, setAction] = useState<{
		ids: string[];
		status: Status;
	} | null>(null);
	const [busy, setBusy] = useState(false);
	const busyRef = useRef(false);
	const [result, setResult] = useState("");
	const targets = rows.filter((row) => selected.includes(row.id));
	const purgeable = targets.filter((row) => row.status === "deleted");
	const execute = async (
		ids: string[],
		request: (id: string) => Promise<unknown>
	) => {
		if (busyRef.current) {
			return false;
		}
		setBusy(true);
		busyRef.current = true;
		try {
			const { failed, errors, succeeded } = await runContentBatch(ids, request);
			onSelected(failed);
			setResult(
				`성공 ${succeeded}건 · 실패 ${failed.length}건${errors.length ? `: ${errors.join(" / ")}` : ""}`
			);
			setAction(null);
			await onRefresh();
			return true;
		} finally {
			busyRef.current = false;
			setBusy(false);
		}
	};
	return (
		<View className="gap-2">
			<View className="flex-row flex-wrap gap-2">
				<Button
					isDisabled={busy}
					onPress={() =>
						onSelected(
							rows.every((row) => selected.includes(row.id))
								? []
								: rows.map((row) => row.id)
						)
					}
					size="sm"
					variant="secondary"
				>
					<Button.Label>현재 페이지 선택/해제</Button.Label>
				</Button>
				{(
					[
						{ status: "hidden", label: "선택 숨김" },
						{ status: "published", label: "선택 복구" },
						{ status: "deleted", label: "선택 삭제" },
					] as const
				).map(({ status, label }) => {
					const ids = targets
						.filter((row) => row.status !== status)
						.map((row) => row.id);
					return (
						<Button
							isDisabled={busy || !ids.length}
							key={status}
							onPress={() => setAction({ ids, status })}
							size="sm"
							variant="secondary"
						>
							<Button.Label>
								{label} ({ids.length})
							</Button.Label>
						</Button>
					);
				})}
				{onPurge ? (
					<Button
						isDisabled={busy || !purgeable.length}
						onPress={() =>
							Alert.alert(
								"선택 영구 삭제",
								`이미 삭제된 글 ${purgeable.length}개를 영구 삭제합니다. 되돌릴 수 없습니다.`,
								[
									{ text: "취소", style: "cancel" },
									{
										text: "영구 삭제",
										style: "destructive",
										onPress: () => {
											execute(
												purgeable.map((row) => row.id),
												onPurge
											).catch((error) =>
												setResult(
													error instanceof Error ? error.message : "재조회 실패"
												)
											);
										},
									},
								]
							)
						}
						size="sm"
						variant="danger-soft"
					>
						<Button.Label>선택 영구 삭제 ({purgeable.length})</Button.Label>
					</Button>
				) : null}
			</View>
			{result ? (
				<Text className="text-foreground text-sm">{result}</Text>
			) : null}
			<ReasonDialog
				confirmLabel="적용"
				defaultReason=""
				description={`${action?.ids.length ?? 0}건에 같은 사유를 적용합니다.`}
				isOpen={action !== null}
				onConfirm={(reason) =>
					action
						? execute(action.ids, (id) => onStatus(id, action.status, reason))
						: Promise.resolve(false)
				}
				onOpenChange={(open) => {
					if (!open) {
						setAction(null);
					}
				}}
				title="게시물 일괄 조치"
			/>
		</View>
	);
}
