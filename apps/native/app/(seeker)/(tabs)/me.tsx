import { Ionicons } from "@expo/vector-icons";
import { useMutation, useQuery } from "@tanstack/react-query";
import { type Href, router } from "expo-router";
import {
	Avatar,
	Button,
	ListGroup,
	Separator,
	Skeleton,
	Surface,
	useThemeColor,
} from "heroui-native";
import { Fragment } from "react";
import { Alert, Text, View } from "react-native";

import { authClient } from "@/lib/auth-client";
import {
	BambiHeader,
	BambiScreen,
	Pill,
	StateCard,
} from "@/src/components/bambi-screen";
import { LogoutButton } from "@/src/components/logout-button";
import { pointsToNextLabel, profileRoleLabel } from "@/src/lib/bambi-native";
import { orpc, queryClient } from "@/src/lib/orpc";

// 프로필 아이덴티티 카드 — 표시명 정본은 세션 user.name(웹과 동일 규칙),
// 역할·본인인증 여부는 onboarding.getMine의 bambiProfile에서 온다.
function ProfileCard() {
	const session = authClient.useSession();
	const mineQuery = useQuery({
		...orpc.bambi.onboarding.getMine.queryOptions(),
		// enabled:false 구간에서 isLoading은 false지만 isPending은 true다(app/index.tsx와
		// 같은 함정) — (seeker) 그룹은 로그인 뒤에만 열리므로 스켈레톤이 계속 남지는 않는다.
		enabled: Boolean(session.data?.user),
	});
	const profile = mineQuery.data?.bambiProfile ?? null;
	const displayName = session.data?.user?.name?.trim() || "구직자 회원";
	const isPhoneVerified = Boolean(profile?.isPhoneVerified);

	if (session.isPending || mineQuery.isPending) {
		return <Skeleton className="h-20 rounded-lg" />;
	}

	return (
		<Surface
			className="flex-row items-center gap-3 rounded-lg p-4"
			variant="secondary"
		>
			<Avatar alt={`${displayName} 프로필 사진`} size="lg">
				{session.data?.user.image ? (
					<Avatar.Image source={{ uri: session.data.user.image }} />
				) : null}
				<Avatar.Fallback />
			</Avatar>
			<View className="min-w-0 flex-1 gap-1">
				<Text className="font-bold text-foreground text-lg" selectable>
					{displayName}
				</Text>
				<View className="flex-row flex-wrap items-center gap-2">
					<Text className="text-muted text-sm">
						{profileRoleLabel(profile?.role)}
					</Text>
					<Pill tone={isPhoneVerified ? "accent" : "neutral"}>
						{isPhoneVerified ? "인증완료" : "인증 필요"}
					</Pill>
				</View>
			</View>
		</Surface>
	);
}

// 포인트·등급 요약 + 출석 체크 — 웹 MyPointsSummaryCard의 native 이식.
// 출석 상세 화면이 native에 아직 없어 카드 본문은 눌리지 않고 출석 버튼만 동작한다.
// (seeker) 그룹에는 job_seeker만 들어오므로(app/index.tsx 라우팅) 역할 게이트는 두지
// 않는다 — 서버(protectedProcedure+역할 검사)가 최종 방어선이고, 실패하면 아래
// StateCard 폴백으로 떨어진다.
function PointsSummaryCard() {
	const mineQuery = useQuery(
		orpc.bambi.attendance.getMine.queryOptions({ input: {} })
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
				await queryClient.invalidateQueries({
					queryKey: orpc.bambi.attendance.getMine.key(),
				});
			},
		})
	);

	if (mineQuery.isPending) {
		return <Skeleton className="h-24 rounded-lg" />;
	}

	if (mineQuery.isError || !mineQuery.data) {
		return (
			<StateCard
				action={
					<Button
						isDisabled={mineQuery.isFetching}
						onPress={() => mineQuery.refetch()}
						size="sm"
						variant="secondary"
					>
						<Button.Label>다시 시도</Button.Label>
					</Button>
				}
				description="로그인 상태와 네트워크 연결을 확인해 주세요."
				title="포인트 정보를 불러오지 못했어요"
			/>
		);
	}

	const { checkedInToday, grade, nextGrade, pointBalance, pointsToNext } =
		mineQuery.data;

	return (
		<Surface className="gap-4 rounded-lg p-4" variant="secondary">
			<View className="flex-row gap-3">
				<View className="flex-1 gap-1">
					<Text className="text-muted text-xs">포인트</Text>
					<Text
						className="font-extrabold text-accent-soft-foreground text-base dark:text-accent"
						selectable
					>
						{pointBalance.toLocaleString("ko-KR")}P
					</Text>
				</View>
				<View className="flex-1 gap-1">
					<Text className="text-muted text-xs">등급</Text>
					{grade ? (
						<Pill tone="accent">{grade.name}</Pill>
					) : (
						<Pill tone="neutral">등급 없음</Pill>
					)}
				</View>
				<View className="flex-1 gap-1">
					<Text className="text-muted text-xs">다음 등급까지</Text>
					<Text className="text-foreground text-sm" selectable>
						{pointsToNextLabel(nextGrade, pointsToNext)}
					</Text>
				</View>
			</View>
			<Button
				isDisabled={checkedInToday || checkIn.isPending}
				onPress={() => checkIn.mutate({})}
				size="sm"
			>
				<Button.Label>{checkedInToday ? "출석 완료" : "출석하기"}</Button.Label>
			</Button>
		</Surface>
	);
}

// 허브 메뉴 — 이미 존재하는 native 화면만 넣는다(범위 합의: 하위 화면 신규 제작 없음).
// 웹 NAV_ITEMS의 나머지 항목(신고 내역·글 관리·면접·차단·포인트 내역·쪽지함·계정 설정)은
// native 화면이 생길 때 이 배열에 행을 추가하는 것으로 충분하다.
const MENU_ITEMS = [
	{
		description: "새 소식과 받은 알림을 확인해요.",
		href: "/(seeker)/notifications" as Href,
		icon: "notifications-outline" as const,
		label: "알림",
	},
	{
		description: "모은 포인트로 아이템을 구매해요.",
		href: "/(seeker)/point-shop" as Href,
		// 헤더의 포인트몰 버튼(seeker-header.tsx)과 같은 글리프 — 같은 목적지는 같은 아이콘.
		icon: "storefront-outline" as const,
		label: "포인트몰",
	},
];

function MeMenu() {
	const foregroundColor = useThemeColor("foreground");

	return (
		// 위 프로필·포인트 카드와 같은 표면 규칙(secondary + rounded-lg)로 맞춘다 —
		// 기본 variant는 bg-surface + rounded-3xl이라 이 카드만 어긋나 보인다.
		<ListGroup className="rounded-lg" variant="secondary">
			{MENU_ITEMS.map((item, index) => (
				<Fragment key={item.label}>
					{index > 0 ? <Separator className="mx-4" /> : null}
					<ListGroup.Item
						accessibilityLabel={`${item.label} — ${item.description}`}
						accessibilityRole="button"
						className="active:opacity-75"
						onPress={() => router.push(item.href)}
					>
						<ListGroup.ItemPrefix>
							<Ionicons color={foregroundColor} name={item.icon} size={22} />
						</ListGroup.ItemPrefix>
						<ListGroup.ItemContent>
							<ListGroup.ItemTitle>{item.label}</ListGroup.ItemTitle>
							<ListGroup.ItemDescription>
								{item.description}
							</ListGroup.ItemDescription>
						</ListGroup.ItemContent>
						<ListGroup.ItemSuffix />
					</ListGroup.Item>
				</Fragment>
			))}
		</ListGroup>
	);
}

export default function SeekerMeScreen() {
	return (
		<BambiScreen>
			<BambiHeader description="내 계정과 활동을 관리합니다." title="내 정보" />
			<ProfileCard />
			<PointsSummaryCard />
			<MeMenu />
			<View className="items-start">
				<LogoutButton />
			</View>
		</BambiScreen>
	);
}
