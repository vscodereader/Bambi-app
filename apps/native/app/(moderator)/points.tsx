import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { type Href, router, useLocalSearchParams } from "expo-router";
import { Button, Input, Surface, TextField, useToast } from "heroui-native";
import { useState } from "react";
import { Alert, Text, View } from "react-native";
import {
	BambiHeader,
	BambiScreen,
	Pill,
	StateCard,
} from "@/src/components/bambi-screen";
import { FilterChips } from "@/src/components/moderation/filter-chips";
import { GradeEdit } from "@/src/components/moderation/grade-edit";
import { ModeratorPointSettings } from "@/src/components/moderation/point-settings";
import { orpc } from "@/src/lib/orpc";

type Tab = "attendance" | "grades" | "settings";
const TABS = [
	{ label: "출석·회원", value: "attendance" },
	{ label: "등급", value: "grades" },
	{ label: "설정", value: "settings" },
] as const;
const number = (value: string) => (value.trim() ? Number(value) : Number.NaN);

function Attendance() {
	const [role, setRole] = useState<"job_seeker" | "employer" | "all">("all");
	const [sort, setSort] = useState<"recent" | "idle" | "total" | "month">(
		"recent"
	);
	const [search, setSearch] = useState("");
	const [cursor, setCursor] = useState(0);
	const [target, setTarget] = useState<string | null>(null);
	const [amount, setAmount] = useState("");
	const [reason, setReason] = useState("");
	const client = useQueryClient();
	const { toast } = useToast();
	const query = useQuery(
		orpc.bambi.attendance.adminList.queryOptions({
			input: {
				cursor,
				limit: 20,
				search: search.trim() || undefined,
				sort,
				role: role === "all" ? undefined : role,
			},
		})
	);
	const adjust = useMutation(
		orpc.bambi.attendance.adminAdjustPoints.mutationOptions()
	);
	const submit = async () => {
		if (!target) {
			return;
		}
		try {
			const result = await adjust.mutateAsync({
				amount: number(amount),
				reason: reason.trim(),
				userId: target,
			});
			await client.invalidateQueries({ queryKey: orpc.bambi.attendance.key() });
			toast.show({
				label: `${result.applied.toLocaleString("ko-KR")}P 반영 · 잔액 ${result.pointBalance.toLocaleString("ko-KR")}P`,
			});
			setTarget(null);
			setAmount("");
			setReason("");
		} catch (error) {
			toast.show({
				label: error instanceof Error ? error.message : "조정하지 못했어요.",
				variant: "danger",
			});
		}
	};
	return (
		<View className="gap-3">
			<FilterChips
				onChange={(value) => {
					setRole(value);
					setCursor(0);
					setTarget(null);
				}}
				options={[
					{ value: "all", label: "전체 회원" },
					{ value: "job_seeker", label: "구직자" },
					{ value: "employer", label: "구인자" },
				]}
				value={role}
			/>
			<FilterChips
				onChange={(value) => {
					setSort(value);
					setCursor(0);
					setTarget(null);
				}}
				options={[
					{ value: "recent", label: "최근 출석" },
					{ value: "idle", label: "오래 미출석" },
					{ value: "total", label: "누적 출석" },
					{ value: "month", label: "이번 달 출석" },
				]}
				value={sort}
			/>
			<TextField>
				<Input
					onChangeText={(v) => {
						setSearch(v);
						setCursor(0);
					}}
					placeholder="이름·아이디 검색"
					value={search}
				/>
			</TextField>
			{query.data ? (
				<Text className="text-muted text-sm">
					오늘 출석 {query.data.summary.attendedToday} / 대상{" "}
					{query.data.summary.eligibleUsers}
				</Text>
			) : null}
			{query.isError ? (
				<StateCard
					description="잠시 후 다시 시도해 주세요."
					title="출석 현황을 불러오지 못했어요"
				/>
			) : null}
			{query.data?.items.map((item) => (
				<Surface
					className="gap-2 rounded-lg p-4"
					key={item.userId}
					variant="secondary"
				>
					<View className="flex-row flex-wrap gap-2">
						<Text className="font-bold text-foreground">
							{item.displayName}
						</Text>
						<Pill>{item.role === "employer" ? "구인자" : "구직자"}</Pill>
						{item.isOnline ? <Pill tone="success">접속 중</Pill> : null}
					</View>
					<Text className="text-muted text-sm">
						잔액 {item.pointBalance.toLocaleString("ko-KR")}P · 이번 달{" "}
						{item.monthDays}일 · 누적 {item.totalDays}일
					</Text>
					<Button
						onPress={() =>
							router.push(`/(moderator)/points/members/${item.userId}` as Href)
						}
						size="sm"
						variant="secondary"
					>
						<Button.Label>원장·등급 기준</Button.Label>
					</Button>
					<Button
						onPress={() => {
							setTarget(target === item.userId ? null : item.userId);
							setAmount("");
							setReason("");
						}}
						size="sm"
						variant="secondary"
					>
						<Button.Label>포인트 조정</Button.Label>
					</Button>
					{target === item.userId ? (
						<View className="gap-2">
							<TextField>
								<Input
									keyboardType="number-pad"
									onChangeText={setAmount}
									placeholder="지급은 양수, 차감은 음수"
									value={amount}
								/>
							</TextField>
							<TextField>
								<Input
									maxLength={200}
									onChangeText={setReason}
									placeholder="조정 사유"
									value={reason}
								/>
							</TextField>
							<Button
								isDisabled={
									!Number.isInteger(number(amount)) ||
									number(amount) === 0 ||
									!reason.trim() ||
									adjust.isPending
								}
								onPress={() =>
									Alert.alert(
										"포인트 조정",
										"입력한 금액을 원장에 반영할까요?",
										[
											{ text: "취소", style: "cancel" },
											{ text: "반영", onPress: submit },
										]
									)
								}
							>
								<Button.Label>확인</Button.Label>
							</Button>
						</View>
					) : null}
				</Surface>
			))}
			<View className="flex-row justify-between">
				<Button
					isDisabled={cursor === 0}
					onPress={() => setCursor(Math.max(0, cursor - 20))}
					size="sm"
					variant="secondary"
				>
					<Button.Label>이전</Button.Label>
				</Button>
				<Button
					isDisabled={query.data?.nextCursor === null}
					onPress={() => setCursor(query.data?.nextCursor ?? cursor)}
					size="sm"
					variant="secondary"
				>
					<Button.Label>다음</Button.Label>
				</Button>
			</View>
		</View>
	);
}

function Grades() {
	const [name, setName] = useState("");
	const [minPoints, setMinPoints] = useState("");
	const [cap, setCap] = useState<string | undefined>();
	const client = useQueryClient();
	const { toast } = useToast();
	const grades = useQuery(orpc.bambi.memberGrades.list.queryOptions());
	const capQuery = useQuery(
		orpc.bambi.memberGrades.getPointsCap.queryOptions()
	);
	const capInput =
		cap ??
		(capQuery.data?.maxPoints == null ? "" : String(capQuery.data.maxPoints));
	const create = useMutation(orpc.bambi.memberGrades.create.mutationOptions());
	const remove = useMutation(orpc.bambi.memberGrades.remove.mutationOptions());
	const saveCap = useMutation(
		orpc.bambi.memberGrades.updatePointsCap.mutationOptions()
	);
	const refresh = () =>
		client.invalidateQueries({ queryKey: orpc.bambi.memberGrades.key() });
	return (
		<View className="gap-3">
			<Surface className="gap-2 rounded-lg p-4" variant="secondary">
				<Text className="font-bold text-foreground">등급 추가</Text>
				<TextField>
					<Input
						maxLength={20}
						onChangeText={setName}
						placeholder="등급 이름"
						value={name}
					/>
				</TextField>
				<TextField>
					<Input
						keyboardType="number-pad"
						onChangeText={setMinPoints}
						placeholder="기준 포인트"
						value={minPoints}
					/>
				</TextField>
				<Button
					isDisabled={!name.trim() || number(minPoints) < 0 || create.isPending}
					onPress={async () => {
						try {
							await create.mutateAsync({
								name: name.trim(),
								minPoints: number(minPoints),
							});
							setName("");
							setMinPoints("");
							await refresh();
						} catch (error) {
							toast.show({
								label:
									error instanceof Error ? error.message : "추가하지 못했어요.",
								variant: "danger",
							});
						}
					}}
				>
					<Button.Label>등급 추가</Button.Label>
				</Button>
			</Surface>
			<Surface className="gap-2 rounded-lg p-4" variant="secondary">
				<Text className="font-bold text-foreground">최대 보유 포인트</Text>
				<Text className="text-muted text-sm">
					현재{" "}
					{capQuery.data?.maxPoints === null
						? "제한 없음"
						: `${capQuery.data?.maxPoints.toLocaleString("ko-KR")}P`}
				</Text>
				<TextField>
					<Input
						keyboardType="number-pad"
						onChangeText={setCap}
						placeholder="비우면 제한 없음"
						value={capInput}
					/>
				</TextField>
				<Button
					isDisabled={
						saveCap.isPending ||
						!capQuery.isSuccess ||
						cap === undefined ||
						(capInput !== "" && !Number.isInteger(number(capInput)))
					}
					onPress={async () => {
						try {
							await saveCap.mutateAsync({
								maxPoints: capInput === "" ? null : number(capInput),
							});
							await refresh();
						} catch (error) {
							toast.show({
								label:
									error instanceof Error
										? error.message
										: "상한을 저장하지 못했어요.",
								variant: "danger",
							});
						}
					}}
				>
					<Button.Label>상한 저장</Button.Label>
				</Button>
			</Surface>
			{grades.data?.map((grade) => (
				<Surface
					className="gap-3 rounded-lg p-4"
					key={grade.id}
					variant="secondary"
				>
					<View>
						<Text className="font-bold text-foreground">{grade.name}</Text>
						<Text className="text-muted text-sm">
							{grade.minPoints.toLocaleString("ko-KR")}P 이상
						</Text>
					</View>
					<GradeEdit grade={grade} />
					<Button
						isDisabled={remove.isPending}
						onPress={() =>
							Alert.alert("등급 삭제", `${grade.name} 등급을 삭제할까요?`, [
								{ text: "취소", style: "cancel" },
								{
									text: "삭제",
									style: "destructive",
									onPress: async () => {
										try {
											await remove.mutateAsync({ id: grade.id });
											await refresh();
										} catch (error) {
											toast.show({
												label:
													error instanceof Error
														? error.message
														: "삭제하지 못했어요.",
												variant: "danger",
											});
										}
									},
								},
							])
						}
						size="sm"
						variant="danger-soft"
					>
						<Button.Label>삭제</Button.Label>
					</Button>
				</Surface>
			))}
		</View>
	);
}

export default function ModeratorPointsScreen() {
	const params = useLocalSearchParams<{ tab?: string }>();
	const [tab, setTab] = useState<Tab>(
		params.tab === "grades" || params.tab === "settings"
			? params.tab
			: "attendance"
	);
	let content = <ModeratorPointSettings />;
	if (tab === "attendance") {
		content = <Attendance />;
	}
	if (tab === "grades") {
		content = <Grades />;
	}
	return (
		<BambiScreen>
			<BambiHeader
				description="출석 현황, 회원 포인트, 등급과 적립 정책을 관리합니다."
				title="포인트 관리"
			/>
			<FilterChips onChange={setTab} options={TABS} value={tab} />
			{content}
		</BambiScreen>
	);
}
