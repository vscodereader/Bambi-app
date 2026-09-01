import { useQuery } from "@tanstack/react-query";
import { Avatar, Skeleton, Surface } from "heroui-native";
import { Text, View } from "react-native";

import { authClient } from "@/lib/auth-client";
import {
	BambiHeader,
	BambiScreen,
	Pill,
	StateCard,
} from "@/src/components/bambi-screen";
import { LogoutButton } from "@/src/components/logout-button";
import { profileRoleLabel } from "@/src/lib/bambi-native";
import { orpc } from "@/src/lib/orpc";

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

export default function SeekerMeScreen() {
	return (
		<BambiScreen>
			<BambiHeader description="내 계정과 활동을 관리합니다." title="내 정보" />
			<ProfileCard />
			<StateCard
				description="포인트 요약과 메뉴를 준비하고 있어요."
				title="준비 중이에요"
			/>
			<View className="items-start">
				<LogoutButton />
			</View>
		</BambiScreen>
	);
}
