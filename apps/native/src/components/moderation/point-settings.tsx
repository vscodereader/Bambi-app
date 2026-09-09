import type { AppRouterClient } from "@bambi-app/api/routers/index";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
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
import { ErrorState, LoadingState } from "@/src/components/bambi-screen";
import { orpc } from "@/src/lib/orpc";
import { QueryFeedback } from "./query-feedback";

type Settings = Awaited<
	ReturnType<AppRouterClient["bambi"]["pointSettings"]["getAdmin"]>
>;
const FIELDS = [
	["signupPoints", "회원가입 포인트"],
	["attendancePoints", "출석 포인트"],
	["reviewWritePoints", "후기 작성 포인트"],
	["reviewViewPoints", "후기 열람 포인트"],
	["premiumPointJobRewardPoints", "프리미엄 공고 적립(빈값: 기본값)"],
	["premiumPointJobRotationHours", "프리미엄 교체 주기(시간)"],
	["specialPointJobRewardPoints", "스페셜 공고 적립(빈값: 기본값)"],
	["specialPointJobRotationHours", "스페셜 교체 주기(시간)"],
	["recommendedPointJobRewardPoints", "추천 공고 적립(빈값: 기본값)"],
	["recommendedPointJobRotationHours", "추천 교체 주기(시간)"],
	["jobPaymentMinPoints", "공고 결제 최소 포인트"],
	["jobPaymentMaxPoints", "공고 결제 최대 포인트"],
] as const;
const optional = (value: string) => (value.trim() ? Number(value) : null);

export function ModeratorPointSettings() {
	const query = useQuery(orpc.bambi.pointSettings.getAdmin.queryOptions());
	if (query.isError) {
		return <ErrorState onRetry={() => query.refetch()} />;
	}
	if (!query.data) {
		return <LoadingState label="포인트 설정을 불러오고 있어요." />;
	}
	return (
		<View className="gap-3">
			<SettingsForm data={query.data} />
			<CommentBonus />
			<Milestones />
		</View>
	);
}
function SettingsForm({ data }: { data: Settings }) {
	const [draft, setDraft] = useState(() =>
		Object.fromEntries(
			FIELDS.map(([key]) => [key, data[key] == null ? "" : String(data[key])])
		)
	);
	const membership = useMutation(
		orpc.bambi.pointSettings.saveMembershipAdmin.mutationOptions()
	);
	const jobs = useMutation(
		orpc.bambi.pointSettings.savePointJobsAdmin.mutationOptions()
	);
	const payment = useMutation(
		orpc.bambi.pointSettings.saveJobPaymentAdmin.mutationOptions()
	);
	const client = useQueryClient();
	const { toast } = useToast();
	const number = (key: string) => Number(draft[key]);
	const nullable = (key: string) => optional(draft[key] ?? "");
	const save = async (section: "membership" | "jobs" | "payment") => {
		try {
			if (section === "membership") {
				await membership.mutateAsync({
					signupPoints: number("signupPoints"),
					attendancePoints: number("attendancePoints"),
				});
			}
			if (section === "jobs") {
				await jobs.mutateAsync({
					reviewWritePoints: number("reviewWritePoints"),
					reviewViewPoints: number("reviewViewPoints"),
					premiumPointJobRewardPoints: nullable("premiumPointJobRewardPoints"),
					premiumPointJobRotationHours: number("premiumPointJobRotationHours"),
					specialPointJobRewardPoints: nullable("specialPointJobRewardPoints"),
					specialPointJobRotationHours: number("specialPointJobRotationHours"),
					recommendedPointJobRewardPoints: nullable(
						"recommendedPointJobRewardPoints"
					),
					recommendedPointJobRotationHours: number(
						"recommendedPointJobRotationHours"
					),
				});
			}
			if (section === "payment") {
				await payment.mutateAsync({
					jobPaymentMinPoints: nullable("jobPaymentMinPoints"),
					jobPaymentMaxPoints: nullable("jobPaymentMaxPoints"),
				});
			}
			await Promise.all([
				client.invalidateQueries({ queryKey: orpc.bambi.pointSettings.key() }),
				client.invalidateQueries({
					queryKey: orpc.bambi.pointJobRewards.key(),
				}),
			]);
			toast.show({ label: "포인트 설정을 저장했어요." });
		} catch (error) {
			toast.show({
				label: error instanceof Error ? error.message : "저장하지 못했어요.",
				variant: "danger",
			});
		}
	};
	return (
		<Surface className="gap-3 rounded-lg p-4" variant="secondary">
			{FIELDS.map(([key, label]) => (
				<TextField key={key}>
					<Text className="text-foreground text-sm">{label}</Text>
					<Input
						accessibilityLabel={label}
						keyboardType="number-pad"
						onChangeText={(value) =>
							setDraft((current) => ({ ...current, [key]: value }))
						}
						value={draft[key] ?? ""}
					/>
				</TextField>
			))}
			<Button
				isDisabled={membership.isPending}
				onPress={() => save("membership")}
			>
				<Button.Label>가입·출석 설정 저장</Button.Label>
			</Button>
			<Button isDisabled={jobs.isPending} onPress={() => save("jobs")}>
				<Button.Label>공고·후기 설정 저장</Button.Label>
			</Button>
			<Button isDisabled={payment.isPending} onPress={() => save("payment")}>
				<Button.Label>결제 포인트 설정 저장</Button.Label>
			</Button>
		</Surface>
	);
}

function CommentBonus() {
	const query = useQuery(
		orpc.bambi.siteSettings.getCommentBonus.queryOptions()
	);
	if (!query.data) {
		return <QueryFeedback query={query} title="댓글 보너스 설정" />;
	}
	return <BonusForm initial={query.data} />;
}
function BonusForm({
	initial,
}: {
	initial: Awaited<
		ReturnType<AppRouterClient["bambi"]["siteSettings"]["getCommentBonus"]>
	>;
}) {
	const [enabled, setEnabled] = useState(initial.enabled);
	const [chance, setChance] = useState(String(initial.chancePercent));
	const [minimum, setMinimum] = useState(String(initial.minPoints));
	const [maximum, setMaximum] = useState(String(initial.maxPoints));
	const mutation = useMutation(
		orpc.bambi.siteSettings.updateCommentBonus.mutationOptions()
	);
	const client = useQueryClient();
	const { toast } = useToast();
	return (
		<Surface className="gap-3 rounded-lg p-4" variant="secondary">
			<Text className="font-bold text-foreground">댓글 랜덤 보너스</Text>
			<Switch isSelected={enabled} onSelectedChange={setEnabled} />
			<TextField>
				<Input
					accessibilityLabel="당첨 확률"
					keyboardType="number-pad"
					onChangeText={setChance}
					placeholder="당첨 확률(%)"
					value={chance}
				/>
			</TextField>
			<TextField>
				<Input
					accessibilityLabel="최소 포인트"
					keyboardType="number-pad"
					onChangeText={setMinimum}
					placeholder="최소 포인트"
					value={minimum}
				/>
			</TextField>
			<TextField>
				<Input
					accessibilityLabel="최대 포인트"
					keyboardType="number-pad"
					onChangeText={setMaximum}
					placeholder="최대 포인트"
					value={maximum}
				/>
			</TextField>
			<Button
				isDisabled={mutation.isPending}
				onPress={async () => {
					try {
						await mutation.mutateAsync({
							enabled,
							chancePercent: Number(chance),
							minPoints: Number(minimum),
							maxPoints: Number(maximum),
						});
						await client.invalidateQueries({
							queryKey: orpc.bambi.siteSettings.getCommentBonus.key(),
						});
						toast.show({ label: "댓글 보너스를 저장했어요." });
					} catch (error) {
						toast.show({
							label:
								error instanceof Error ? error.message : "저장하지 못했어요.",
							variant: "danger",
						});
					}
				}}
			>
				<Button.Label>보너스 저장</Button.Label>
			</Button>
		</Surface>
	);
}

function Milestones() {
	const query = useQuery(
		orpc.bambi.memberGrades.commentMilestones.list.queryOptions()
	);
	const [count, setCount] = useState("");
	const [points, setPoints] = useState("");
	const [editing, setEditing] = useState<string | null>(null);
	const create = useMutation(
		orpc.bambi.memberGrades.commentMilestones.create.mutationOptions()
	);
	const update = useMutation(
		orpc.bambi.memberGrades.commentMilestones.update.mutationOptions()
	);
	const remove = useMutation(
		orpc.bambi.memberGrades.commentMilestones.remove.mutationOptions()
	);
	const client = useQueryClient();
	const { toast } = useToast();
	const act = async (fn: () => Promise<unknown>) => {
		try {
			await fn();
			await client.invalidateQueries({
				queryKey: orpc.bambi.memberGrades.commentMilestones.key(),
			});
		} catch (error) {
			toast.show({
				label: error instanceof Error ? error.message : "처리하지 못했어요.",
				variant: "danger",
			});
		}
	};
	return (
		<Surface className="gap-3 rounded-lg p-4" variant="secondary">
			<QueryFeedback
				empty={query.data?.milestones.length === 0}
				query={query}
				title="댓글 마일스톤"
			/>
			<Text className="font-bold text-foreground">
				댓글 마일스톤 · 현재 {query.data?.totalCommentCount ?? "—"}개
			</Text>
			<TextField>
				<Input
					accessibilityLabel="댓글 회차"
					keyboardType="number-pad"
					onChangeText={setCount}
					placeholder="댓글 회차"
					value={count}
				/>
			</TextField>
			<TextField>
				<Input
					accessibilityLabel="보너스 포인트"
					keyboardType="number-pad"
					onChangeText={setPoints}
					placeholder="보너스 포인트"
					value={points}
				/>
			</TextField>
			<Button
				isDisabled={create.isPending || update.isPending || !count || !points}
				onPress={() =>
					act(async () => {
						const payload = {
							commentCount: Number(count),
							bonusPoints: Number(points),
						};
						if (editing) {
							await update.mutateAsync({ ...payload, id: editing });
						} else {
							await create.mutateAsync(payload);
						}
						setEditing(null);
						setCount("");
						setPoints("");
					})
				}
			>
				<Button.Label>
					{editing ? "마일스톤 수정" : "마일스톤 추가"}
				</Button.Label>
			</Button>
			{query.data?.milestones.map((item) => (
				<View className="gap-2" key={item.id}>
					<Text className="text-foreground">
						{item.commentCount}회 · {item.bonusPoints}P ·{" "}
						{item.awarded ? "당첨 완료" : "대기"}
					</Text>
					<Button
						onPress={() => {
							setEditing(item.id);
							setCount(String(item.commentCount));
							setPoints(String(item.bonusPoints));
						}}
						size="sm"
						variant="secondary"
					>
						<Button.Label>수정</Button.Label>
					</Button>
					<Button
						isDisabled={remove.isPending}
						onPress={() =>
							Alert.alert("마일스톤 삭제", "마일스톤 설정을 삭제할까요?", [
								{ text: "취소", style: "cancel" },
								{
									text: "삭제",
									style: "destructive",
									onPress: () => act(() => remove.mutateAsync({ id: item.id })),
								},
							])
						}
						size="sm"
						variant="danger-soft"
					>
						<Button.Label>삭제</Button.Label>
					</Button>
				</View>
			))}
		</Surface>
	);
}
