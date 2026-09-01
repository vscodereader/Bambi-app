import { Ionicons } from "@expo/vector-icons";
import { useMutation, useQuery } from "@tanstack/react-query";
import { type Href, router, useFocusEffect } from "expo-router";
import {
	Avatar,
	Button,
	ListGroup,
	Separator,
	Skeleton,
	Surface,
	useThemeColor,
} from "heroui-native";
import {
	type ComponentProps,
	Fragment,
	type ReactNode,
	useCallback,
} from "react";
import { Alert, Text, View } from "react-native";

import { authClient } from "@/lib/auth-client";
import {
	BambiHeader,
	BambiScreen,
	CardLink,
	Pill,
	StateCard,
} from "@/src/components/bambi-screen";
import { LogoutButton } from "@/src/components/logout-button";
import { pointsToNextLabel, profileRoleLabel } from "@/src/lib/bambi-native";
import { orpc, queryClient } from "@/src/lib/orpc";

const MESSAGES_HREF = "/(seeker)/me/messages" as Href;
const SETTINGS_HREF = "/(seeker)/me/settings" as Href;

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
		// 웹 ProfileCard와 같이 카드 전체가 계정 설정 진입점이다. CardLink가 표면·셰브런·
		// 누름 피드백을 이미 갖고 있어 Surface를 Pressable로 감싸는 대신 그걸 쓴다.
		// 표시명에 selectable을 두지 않는 이유는 Pill 주석과 같다 — Android에서 선택 가능한
		// TextView가 스스로 responder가 되어 카드 터치를 삼킨다.
		// CardLink는 라벨이 있으면 내부를 no-hide-descendants로 감추므로, 감춰지는
		// 표시명·역할·인증 상태를 라벨에 그대로 담는다(웹 my-page-shell과 같은 계약).
		<CardLink
			accessibilityLabel={`${displayName}, ${profileRoleLabel(profile?.role)}, ${isPhoneVerified ? "인증완료" : "인증 필요"}, 계정 설정으로 이동`}
			href={SETTINGS_HREF}
		>
			<View className="flex-row items-center gap-3">
				<Avatar alt={`${displayName} 프로필 사진`} size="lg">
					{session.data?.user.image ? (
						<Avatar.Image source={{ uri: session.data.user.image }} />
					) : null}
					<Avatar.Fallback />
				</Avatar>
				<View className="min-w-0 flex-1 gap-1">
					<Text className="font-bold text-foreground text-lg">
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
			</View>
		</CardLink>
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

interface MenuItem {
	description: string;
	href: Href;
	icon: ComponentProps<typeof Ionicons>["name"];
	label: string;
}

// 허브 메뉴 — 순서·라벨은 웹 NAV_ITEMS(my-page-shell.tsx), 설명은 웹 허브 카드
// (screens/seeker.tsx의 seekerMeSections)를 따른다. 역할 게이트(HIDDEN_MY_PAGE_HREFS)는
// 두지 않는다 — (seeker) 그룹에는 job_seeker만 들어오므로 감출 항목이 없다.
const MY_PAGE_ITEMS: MenuItem[] = [
	{
		description: "접수한 신고의 처리 상태를 확인해요.",
		href: "/(seeker)/me/reports" as Href,
		icon: "flag-outline" as const,
		label: "내 신고 내역",
	},
	{
		description: "좋아요 누른 글과 내가 쓴 글을 확인해요.",
		href: "/(seeker)/me/content" as Href,
		icon: "document-text-outline" as const,
		label: "글 관리",
	},
	{
		description: "확정·제안된 면접 일정을 한눈에 봐요.",
		href: "/(seeker)/me/interviews" as Href,
		icon: "time-outline" as const,
		label: "예정된 면접",
	},
	{
		description: "차단한 상대를 확인하고 해제해요.",
		href: "/(seeker)/me/blocks" as Href,
		icon: "lock-closed-outline" as const,
		label: "차단한 상대",
	},
	{
		description: "출석 기록과 포인트 사용 내역을 확인해요.",
		href: "/(seeker)/me/attendance" as Href,
		icon: "cash-outline" as const,
		label: "포인트 내역",
	},
	{
		description: "운영자가 보낸 쪽지를 확인해요.",
		href: MESSAGES_HREF,
		icon: "mail-outline" as const,
		label: "쪽지함",
	},
	{
		description: "표시 이름·본인인증을 관리해요.",
		href: SETTINGS_HREF,
		icon: "settings-outline" as const,
		label: "계정 설정",
	},
];

// 마이페이지 밖으로 나가는 바로가기 — 별도 그룹으로 떼어 위 7행과 섞이지 않게 한다.
const SHORTCUT_ITEMS: MenuItem[] = [
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

function MeMenuGroup({
	items,
	suffixFor,
}: {
	items: MenuItem[];
	suffixFor?: (href: Href) => { label: string; node: ReactNode } | null;
}) {
	const foregroundColor = useThemeColor("foreground");

	return (
		// 위 프로필·포인트 카드와 같은 표면 규칙(secondary + rounded-lg)로 맞춘다 —
		// 기본 variant는 bg-surface + rounded-3xl이라 이 카드만 어긋나 보인다.
		<ListGroup className="rounded-lg" variant="secondary">
			{items.map((item, index) => {
				const suffix = suffixFor?.(item.href) ?? null;

				return (
					<Fragment key={item.label}>
						{index > 0 ? <Separator className="mx-4" /> : null}
						<ListGroup.Item
							accessibilityLabel={`${item.label} — ${item.description}${suffix ? `, ${suffix.label}` : ""}`}
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
							{/* children이 null이면 ItemSuffix가 기본 셰브런으로 되돌아간다. */}
							<ListGroup.ItemSuffix>
								{suffix?.node ?? null}
							</ListGroup.ItemSuffix>
						</ListGroup.Item>
					</Fragment>
				);
			})}
		</ListGroup>
	);
}

function MeMenu() {
	// 쪽지함 안읽음 배지 — 웹 MyPageNav과 같은 계약(알림 벨과 별개 카운트, 99+ 캡).
	const unreadQuery = useQuery(
		orpc.bambi.directMessages.unreadCount.queryOptions()
	);
	const unreadCount = unreadQuery.data?.unreadCount ?? 0;
	// 이 화면은 Stack push(쪽지함) 뒤에도 마운트된 채로 남고, RN에는 focusManager가
	// 배선돼 있지 않아 refetchOnMount·refetchOnWindowFocus 어느 쪽도 발화하지 않는다.
	// 포커스 복귀에 직접 재조회를 걸어야 읽은 뒤 배지가 줄어든다.
	const { refetch } = unreadQuery;

	useFocusEffect(
		useCallback(() => {
			refetch();
		}, [refetch])
	);

	return (
		<>
			<MeMenuGroup
				items={MY_PAGE_ITEMS}
				suffixFor={(href) =>
					href === MESSAGES_HREF && unreadCount > 0
						? {
								label: `안 읽음 ${unreadCount}건`,
								// Chip은 Pressable이라 행 안에 두면 배지 영역이 터치를 삼킨다.
								// Pill(순수 Text)이 같은 룩을 내면서 그 구멍을 만들지 않는다.
								node: (
									<Pill tone="accent">
										{unreadCount > 99 ? "99+" : unreadCount}
									</Pill>
								),
							}
						: null
				}
			/>
			<MeMenuGroup items={SHORTCUT_ITEMS} />
		</>
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
