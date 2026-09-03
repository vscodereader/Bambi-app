import { Ionicons } from "@expo/vector-icons";
import { useQuery } from "@tanstack/react-query";
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
import { type ComponentProps, Fragment } from "react";
import { Text, View } from "react-native";

import { authClient } from "@/lib/auth-client";
import {
	BambiHeader,
	BambiScreen,
	Pill,
	StateCard,
} from "@/src/components/bambi-screen";
import { LogoutButton } from "@/src/components/logout-button";
import { MemberOnly } from "@/src/components/member-only";
import { verificationStatusLabels } from "@/src/lib/bambi-native";
import { orpc } from "@/src/lib/orpc";

const ORG_HREF = "/(employer)/me/organization" as Href;
const BUSINESS_HREF = "/(employer)/me/business" as Href;
const SETTINGS_HREF = "/(seeker)/me/settings" as Href;

interface MenuItem {
	description: string;
	href: Href;
	icon: ComponentProps<typeof Ionicons>["name"];
	label: string;
}

const MENU_ITEMS: MenuItem[] = [
	{
		description: "공고에 노출되는 업체명을 관리해요.",
		href: ORG_HREF,
		icon: "business-outline",
		label: "업체 정보",
	},
	{
		description: "사업자등록번호와 서류로 업체를 인증해요.",
		href: BUSINESS_HREF,
		icon: "shield-checkmark-outline",
		label: "사업자 인증",
	},
	{
		description: "표시 이름·본인인증을 관리해요.",
		href: SETTINGS_HREF,
		icon: "settings-outline",
		label: "계정 설정",
	},
];

function ProfileCard() {
	const session = authClient.useSession();
	const mineQuery = useQuery({
		...orpc.bambi.onboarding.getMine.queryOptions(),
		enabled: Boolean(session.data?.user),
	});

	if (session.isPending || mineQuery.isPending) {
		return <Skeleton className="h-20 rounded-lg" />;
	}

	// 조회 실패를 삼키면 인증 배지가 "미인증"으로 거짓 확정된다 — seeker me.tsx와 같은
	// 규칙으로 카드 자리를 재시도 카드로 바꾼다. 세션은 살아 있어 화면 나머지는 그대로 렌더.
	if (mineQuery.isError) {
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
				title="프로필을 불러오지 못했어요"
			/>
		);
	}

	const organizationProfile = mineQuery.data?.employerOrganizationProfiles[0];
	const displayName =
		organizationProfile?.displayName?.trim() ||
		session.data?.user?.name?.trim() ||
		"구인자 회원";
	const status = organizationProfile?.verificationStatus ?? "none";

	return (
		<Surface className="gap-3 rounded-lg p-4" variant="secondary">
			<View className="flex-row items-center gap-3">
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
					<Pill tone={status === "verified" ? "success" : "neutral"}>
						{verificationStatusLabels[
							status as keyof typeof verificationStatusLabels
						] ?? status}
					</Pill>
				</View>
			</View>
		</Surface>
	);
}

function MeInner() {
	const foregroundColor = useThemeColor("foreground");

	return (
		<BambiScreen>
			<BambiHeader
				description="업체 정보와 계정을 관리합니다."
				title="내 정보"
			/>
			<ProfileCard />
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
							<ListGroup.ItemSuffix>{null}</ListGroup.ItemSuffix>
						</ListGroup.Item>
					</Fragment>
				))}
			</ListGroup>
			<StateCard
				description="팀 관리와 멤버 초대는 앱에서는 준비 중이에요. 웹에서 이용해 주세요."
				title="팀 관리는 웹에서"
			/>
			<View className="items-start">
				<LogoutButton />
			</View>
		</BambiScreen>
	);
}

export default function EmployerMeScreen() {
	return (
		<MemberOnly>
			<MeInner />
		</MemberOnly>
	);
}
