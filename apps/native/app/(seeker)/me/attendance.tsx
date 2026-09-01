import { Ionicons } from "@expo/vector-icons";
import { useInfiniteQuery, useMutation, useQuery } from "@tanstack/react-query";
import { Stack } from "expo-router";
import { Button, cn, Skeleton, Surface, useThemeColor } from "heroui-native";
import { useState } from "react";
import { Alert, Pressable, Text, View } from "react-native";

import {
	BambiScreen,
	ErrorState,
	Pill,
	StateCard,
} from "@/src/components/bambi-screen";
import {
	buildMonthWeeks,
	formatPointAmount,
	formatPointDate,
	monthLabel,
	shiftMonth,
} from "@/src/lib/me-attendance";
import { orpc, queryClient } from "@/src/lib/orpc";

// (seeker)/_layout.tsx는 화면마다 Stack.Screen을 명시하지만 이 라우트는 통합 단계에서
// 등록된다 — 그전에도 헤더 제목이 비지 않도록 화면이 스스로 제목을 주입한다
// (jobs/[id].tsx가 headerRight를 같은 방식으로 넣는 선례). 로딩·에러 조기 반환에서도
// 제목이 유지되게 모든 분기에서 함께 렌더한다.
const SCREEN_TITLE = "포인트 내역";
const WEEKDAY_LABELS = ["일", "월", "화", "수", "목", "금", "토"];
const HISTORY_PAGE_SIZE = 20;

type HistoryCursor = null | { createdAt: string; id: string };

// 포인트 내역 — 웹 PointHistoryCard의 native 이식. 표 대신 행으로 그린다.
// FlatList를 쓰지 않는다: BambiScreen(=Container)이 ScrollView라 VirtualizedList가
// 중첩되면 경고가 나고 스크롤이 충돌한다. 페이지당 20행이라 map으로 충분하다.
function PointHistoryCard() {
	const query = useInfiniteQuery(
		orpc.bambi.pointSettings.getMineHistory.infiniteOptions({
			getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
			initialPageParam: null as HistoryCursor,
			input: (cursor: HistoryCursor) => ({
				cursor: cursor ?? undefined,
				limit: HISTORY_PAGE_SIZE,
			}),
		})
	);

	const pages = query.data?.pages ?? [];
	const items = pages.flatMap((page) => page.items);
	// 잔액은 첫 페이지 응답의 원장 합계다(페이지마다 같은 값이 실려 온다).
	const balance = pages[0]?.balance ?? 0;

	return (
		<Surface className="gap-3 rounded-lg p-4" variant="secondary">
			<View className="gap-1">
				<Text className="text-muted text-xs">보유 포인트</Text>
				{query.isLoading ? (
					<Skeleton className="h-7 rounded-lg" />
				) : (
					<Text
						className="font-extrabold text-accent-soft-foreground text-xl dark:text-accent"
						selectable
					>
						{`${balance.toLocaleString("ko-KR")}P`}
					</Text>
				)}
			</View>

			{/* 내역만 실패해도 위 출석·달력은 살려 둔다. */}
			{query.isError ? (
				<StateCard
					action={
						<Button
							accessibilityLabel="포인트 내역 다시 불러오기"
							isDisabled={query.isFetching}
							onPress={() => query.refetch()}
							size="sm"
							variant="secondary"
						>
							<Button.Label>다시 시도</Button.Label>
						</Button>
					}
					description="네트워크 연결을 확인한 뒤 다시 시도해 주세요."
					title="포인트 내역을 불러오지 못했어요"
				/>
			) : null}

			{query.isLoading ? (
				<View className="gap-2">
					<Skeleton className="h-12 rounded-lg" />
					<Skeleton className="h-12 rounded-lg" />
				</View>
			) : null}

			{query.isError || query.isLoading || items.length > 0 ? null : (
				<StateCard
					description="출석 체크나 활동으로 포인트를 모아 보세요."
					title="아직 포인트 내역이 없어요"
				/>
			)}

			{items.length > 0 ? (
				<View>
					{items.map((item, index) => (
						<View
							className={cn(
								"flex-row items-center gap-3 border-border border-b py-3",
								index === items.length - 1 && "border-b-0"
							)}
							key={item.id}
						>
							<Text
								className={cn(
									"shrink-0 font-semibold text-sm",
									item.amount > 0
										? "text-accent-soft-foreground dark:text-accent"
										: "text-muted"
								)}
							>
								{formatPointAmount(item.amount)}
							</Text>
							{/* label은 서버가 description ?? pointReasonLabel(reason)로 이미
							    한국어화해 내려준다 — 화면에서 reason enum을 다루지 않는다. */}
							<Text
								className="flex-1 text-foreground text-sm"
								numberOfLines={1}
								selectable
							>
								{item.label}
							</Text>
							<Text className="shrink-0 text-muted text-xs">
								{formatPointDate(item.createdAt)}
							</Text>
						</View>
					))}
				</View>
			) : null}

			{query.hasNextPage ? (
				<Button
					accessibilityLabel="포인트 내역 더 보기"
					className="w-full"
					isDisabled={query.isFetchingNextPage}
					onPress={() => query.fetchNextPage()}
					variant="secondary"
				>
					<Button.Label>
						{query.isFetchingNextPage ? "불러오는 중…" : "내역 더보기"}
					</Button.Label>
				</Button>
			) : null}
		</Surface>
	);
}

function MonthNavButton({
	direction,
	onPress,
}: {
	direction: "next" | "previous";
	onPress: () => void;
}) {
	const foregroundColor = useThemeColor("foreground");

	return (
		<Pressable
			accessibilityLabel={direction === "previous" ? "이전 달" : "다음 달"}
			accessibilityRole="button"
			className="h-11 w-11 items-center justify-center rounded-2xl border border-border bg-surface active:opacity-75"
			hitSlop={4}
			onPress={onPress}
		>
			<Ionicons
				color={foregroundColor}
				name={direction === "previous" ? "chevron-back" : "chevron-forward"}
				size={20}
			/>
		</Pressable>
	);
}

export default function SeekerAttendanceScreen() {
	// null이면 서버가 정한 이번 달(KST)을 본다 — 클라이언트가 "이번 달"을 계산하면
	// 자정 전후 시계 차이로 서버와 다른 달을 요청한다(웹 AttendancePanel과 같은 이유).
	const [month, setMonth] = useState<null | string>(null);
	const mineQuery = useQuery(
		orpc.bambi.attendance.getMine.queryOptions({
			input: month === null ? {} : { month },
		})
	);
	const checkIn = useMutation(
		orpc.bambi.attendance.checkIn.mutationOptions({
			onError: (error) => {
				Alert.alert(
					"출석하지 못했어요",
					error.message || "잠시 후 다시 시도해 주세요."
				);
			},
			onSuccess: async (result) => {
				Alert.alert(
					"출석 체크",
					result.alreadyAttended
						? "오늘은 이미 출석했어요."
						: `출석했어요. +${result.pointsAwarded} 포인트 적립!`
				);
				// 달을 이동한 상태여도 모든 월 캐시를 함께 갱신한다. 이 화면은 내역·잔액도
				// 같이 보여주므로 웹(getMine만 무효화)과 달리 원장 쿼리도 함께 친다.
				await Promise.all([
					queryClient.invalidateQueries({
						queryKey: orpc.bambi.attendance.getMine.key(),
					}),
					queryClient.invalidateQueries({
						queryKey: orpc.bambi.pointSettings.getMineHistory.key(),
					}),
				]);
			},
		})
	);

	if (mineQuery.isPending) {
		return (
			<>
				<Stack.Screen options={{ title: SCREEN_TITLE }} />
				<BambiScreen>
					<Skeleton className="h-32 rounded-lg" />
					<Skeleton className="h-72 rounded-lg" />
					<Skeleton className="h-40 rounded-lg" />
				</BambiScreen>
			</>
		);
	}

	if (mineQuery.isError || !mineQuery.data) {
		return (
			<>
				<Stack.Screen options={{ title: SCREEN_TITLE }} />
				<ErrorState
					onRetry={() => {
						// 이전 달 조회가 실패하면 그 달에 갇힌다 — 이번 달로 되돌리고 다시 부른다.
						setMonth(null);
						mineQuery.refetch();
					}}
					title="포인트 정보를 불러오지 못했어요"
				/>
			</>
		);
	}

	const {
		attendancePoints,
		attendedDates,
		checkedInToday,
		grade,
		nextGrade,
		pointBalance,
		pointsToNext,
		streakDays,
		today,
		totalDays,
	} = mineQuery.data;
	// today·attendedDates 모두 서버 KST 문자열이라 Date 파싱 없이 문자열로 대조한다.
	const viewMonth = mineQuery.data.month;
	const attended = new Set(attendedDates);

	return (
		<>
			<Stack.Screen options={{ title: SCREEN_TITLE }} />
			<BambiScreen>
				<Text className="text-muted text-sm leading-5">
					{`하루에 한 번 출석 도장을 찍고 ${attendancePoints.toLocaleString("ko-KR")}포인트를 받아요.`}
				</Text>

				<Surface className="gap-4 rounded-lg p-4" variant="secondary">
					<View className="flex-row gap-3">
						<View className="flex-1 gap-1">
							<Text className="text-muted text-xs">연속 출석</Text>
							<Text className="font-extrabold text-base text-foreground">
								{`${streakDays}일`}
							</Text>
						</View>
						<View className="flex-1 gap-1">
							<Text className="text-muted text-xs">총 출석</Text>
							<Text className="font-extrabold text-base text-foreground">
								{`${totalDays}일`}
							</Text>
						</View>
						<View className="flex-1 gap-1">
							<Text className="text-muted text-xs">포인트</Text>
							<Text
								className="font-extrabold text-accent-soft-foreground text-base dark:text-accent"
								selectable
							>
								{`${pointBalance.toLocaleString("ko-KR")}P`}
							</Text>
						</View>
					</View>
					<View className="flex-row flex-wrap items-center gap-2">
						{/* 등급 아이콘(iconUrl)·색은 아직 쓰지 않는다 — me.tsx와 같이 이름만. */}
						{grade ? (
							<Pill tone="accent">{grade.name}</Pill>
						) : (
							<Pill tone="neutral">등급 없음</Pill>
						)}
						<Text className="text-muted text-xs">
							{nextGrade
								? `${nextGrade.name}까지 ${(pointsToNext ?? 0).toLocaleString("ko-KR")}P`
								: "최고 등급입니다"}
						</Text>
					</View>
					{/* 이 화면의 유일한 primary 버튼. */}
					<Button
						accessibilityLabel={
							checkedInToday ? "오늘 출석 완료" : "오늘 출석하기"
						}
						isDisabled={checkedInToday || checkIn.isPending}
						onPress={() => checkIn.mutate({})}
					>
						<Button.Label>
							{checkedInToday ? "출석 완료" : "출석하기"}
						</Button.Label>
					</Button>
				</Surface>

				<Surface className="gap-3 rounded-lg p-4" variant="secondary">
					<View className="flex-row items-center justify-between gap-2">
						<Text className="font-bold text-base text-foreground">
							{monthLabel(viewMonth)}
						</Text>
						<View className="flex-row gap-2">
							{/* 달 이동은 항상 응답의 month 기준이다(요청 월과 어긋나지 않게). */}
							<MonthNavButton
								direction="previous"
								onPress={() => setMonth(shiftMonth(viewMonth, -1))}
							/>
							<MonthNavButton
								direction="next"
								onPress={() => setMonth(shiftMonth(viewMonth, 1))}
							/>
						</View>
					</View>
					<View className="flex-row gap-1">
						{WEEKDAY_LABELS.map((label) => (
							<View className="flex-1 items-center" key={label}>
								<Text className="font-bold text-muted text-xs">{label}</Text>
							</View>
						))}
					</View>
					{buildMonthWeeks(viewMonth).map((week) => (
						<View className="flex-row gap-1" key={week[0].key}>
							{week.map((cell) => {
								if (cell.date === null) {
									return (
										<View className="aspect-square flex-1" key={cell.key} />
									);
								}

								const isAttended = attended.has(cell.date);
								const isToday = cell.date === today;

								// 출석·오늘이 배경과 테두리로만 갈리면 스크린리더·색각이상 사용자에게
								// 전달되지 않는다(WCAG 1.4.1). 웹은 sr-only 텍스트를 쓰지만 native에는
								// 없으므로 칸을 단일 노드로 묶어 라벨로 읽힌다.
								return (
									<View
										accessibilityLabel={`${Number(cell.date.slice(8, 10))}일${isToday ? " 오늘" : ""}${isAttended ? " 출석" : ""}`}
										accessible
										className={cn(
											"aspect-square flex-1 items-center justify-center rounded-md border border-transparent",
											isAttended && "bg-accent/15",
											isToday && "border-accent"
										)}
										key={cell.key}
									>
										<Text
											className={cn(
												"text-sm",
												isAttended
													? "font-bold text-accent-soft-foreground dark:text-accent"
													: "text-muted"
											)}
										>
											{Number(cell.date.slice(8, 10))}
										</Text>
									</View>
								);
							})}
						</View>
					))}
					<Text className="text-muted text-xs">
						색이 채워진 날이 출석한 날이에요. 테두리는 오늘이에요.
					</Text>
				</Surface>

				<PointHistoryCard />
			</BambiScreen>
		</>
	);
}
