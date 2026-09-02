import { type Href, Redirect, router } from "expo-router";
import { Button } from "heroui-native";
import type { ReactNode } from "react";

import {
	BambiScreen,
	LoadingState,
	StateCard,
} from "@/src/components/bambi-screen";
import { useVisitor } from "@/src/lib/guest-store";
import { isCommunityGuest } from "@/src/lib/guest-token";

const LOGIN_HREF = "/login" as Href;

// 회원 전용 화면 가드. 웹 resolve-gate(익명/게스트/멤버 3분류)를 native로 옮긴 useVisitor로
// 분기한다. 탭 화면 안에서 쓰여도 헤더/탭바는 각 화면의 Stack.Screen이 계속 렌더하므로
// 여기서는 화면 컨텐츠만 교체한다.
export function MemberOnly({
	allowCommunityGuest = false,
	children,
}: {
	allowCommunityGuest?: boolean;
	children: ReactNode;
}) {
	const { guest, state } = useVisitor();

	if (state === "pending") {
		return <LoadingState label="회원 정보를 확인하고 있습니다." />;
	}
	if (state === "anon") {
		return <Redirect href={LOGIN_HREF} />;
	}
	if (state === "member") {
		return <>{children}</>;
	}
	// state === "guest" — 여성 인증 게스트만 커뮤니티 화면을 그대로 본다(웹 proxy.ts와 같은 축).
	if (allowCommunityGuest && isCommunityGuest(guest)) {
		return <>{children}</>;
	}
	return <GuestBlockedCard allowCommunityGuest={allowCommunityGuest} />;
}

// 웹 guest-blocked-toast("회원가입 후에 볼 수 있어요")·require-community-access와 같은 문구를
// 형제 화면의 빈 상태(StateCard)와 같은 모양으로 그린다. allowCommunityGuest 화면에서 막힌
// 게스트(남성·gid 없음)에게는 서버 커뮤니티 authz와 같은 문구를, 그 외에는 비회원 안내를 준다.
function GuestBlockedCard({
	allowCommunityGuest,
}: {
	allowCommunityGuest: boolean;
}) {
	return (
		<BambiScreen>
			<StateCard
				action={
					<Button
						onPress={() => router.push(LOGIN_HREF)}
						size="sm"
						variant="secondary"
					>
						<Button.Label>로그인</Button.Label>
					</Button>
				}
				description={
					allowCommunityGuest
						? "일반 여성회원과 광고 중인 업소회원만 이용가능합니다"
						: "비회원 인증으로는 공고 탐색과 수다방만 이용할 수 있어요."
				}
				title="회원가입 후에 볼 수 있어요"
			/>
		</BambiScreen>
	);
}
