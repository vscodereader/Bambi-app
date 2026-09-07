import { useQuery } from "@tanstack/react-query";
import { type Href, Redirect, Stack } from "expo-router";

import { authClient } from "@/lib/auth-client";
import { ErrorState, LoadingState } from "@/src/components/bambi-screen";
import {
	getNativeHomeRoute,
	type NativeProfileRole,
} from "@/src/lib/bambi-native";
import { orpc } from "@/src/lib/orpc";

export default function ModeratorLayout() {
	const session = authClient.useSession();
	const mineQuery = useQuery({
		...orpc.bambi.onboarding.getMine.queryOptions(),
		enabled: Boolean(session.data?.user),
	});

	if (session.isPending || (session.data?.user && mineQuery.isPending)) {
		return <LoadingState label="운영자 정보를 확인하고 있습니다." />;
	}

	if (!session.data?.user) {
		return <Redirect href={"/login" as Href} />;
	}

	if (mineQuery.isError) {
		return <ErrorState onRetry={() => mineQuery.refetch()} />;
	}

	const role = mineQuery.data?.bambiProfile?.role as
		| NativeProfileRole
		| null
		| undefined;

	// 운영자 영역은 admin 전용이다. 구인자 영역이 admin도 통과시키는 비대칭은 의도적 —
	// admin은 구인자 화면을 대신 봐줘야 하지만, employer가 검수·신고·사용자 관리를 볼
	// 이유는 없다. 서버가 403을 주더라도 셸 자체가 그려지지 않게 여기서 막는다.
	if (role !== "admin") {
		return <Redirect href={getNativeHomeRoute(role) as Href} />;
	}

	// 복귀 진입점(RoleSwitchMenu)은 탭 셸 헤더(ModeratorHomeHeader)가 맡는다. 상세는
	// 이 Stack에 push되므로 기본 뒤로 버튼으로 목록에 돌아간다.
	return (
		<Stack>
			<Stack.Screen name="(tabs)" options={{ headerShown: false }} />
			<Stack.Screen name="queue/[id]" options={{ title: "공고 검수" }} />
			<Stack.Screen name="reports/[id]" options={{ title: "신고 상세" }} />
			<Stack.Screen name="users/[id]" options={{ title: "사용자 상세" }} />
		</Stack>
	);
}
