import { useQuery } from "@tanstack/react-query";
import { type Href, Redirect, Stack } from "expo-router";

import { authClient } from "@/lib/auth-client";
import { ErrorState, LoadingState } from "@/src/components/bambi-screen";
import { RoleSwitchMenu } from "@/src/components/role-switch-menu";
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

	return (
		<Stack
			screenOptions={{
				// 역할 영역은 루트 Stack에 push된 별도 셸이라 세 화면 모두에 복귀 진입점이 필요하다.
				headerRight: () => <RoleSwitchMenu currentArea="/(moderator)" />,
			}}
		>
			<Stack.Screen name="index" options={{ title: "관리자 검수" }} />
			<Stack.Screen name="reports" options={{ title: "신고" }} />
			<Stack.Screen name="users" options={{ title: "사용자" }} />
		</Stack>
	);
}
