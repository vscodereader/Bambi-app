import { useQuery } from "@tanstack/react-query";
import { type Href, Redirect } from "expo-router";
import { authClient } from "@/lib/auth-client";
import { ErrorState, LoadingState } from "@/src/components/bambi-screen";
import {
	getNativeHomeRoute,
	type NativeProfileRole,
} from "@/src/lib/bambi-native";
import { readGuestToken } from "@/src/lib/guest-store";
import { resolveGuestVisitor } from "@/src/lib/guest-token";
import { orpc } from "@/src/lib/orpc";

export default function IndexRoute() {
	const session = authClient.useSession();
	const mineQuery = useQuery({
		...orpc.bambi.onboarding.getMine.queryOptions(),
		enabled: Boolean(session.data?.user),
	});

	if (session.isPending) {
		return <LoadingState label="밤비알바 프로필을 확인하고 있습니다." />;
	}

	if (!session.data?.user) {
		// 웹 resolve-gate와 같은 축: 세션 없는 방문자 중 게스트(본인인증 토큰 보유)는
		// 로그인으로 보내지 않고 구직자 루트를 통과시킨다. 토큰이 없거나 만료면 로그인.
		if (resolveGuestVisitor(readGuestToken(), new Date())) {
			return <Redirect href={getNativeHomeRoute("job_seeker") as Href} />;
		}
		return <Redirect href={"/login" as Href} />;
	}

	// enabled:false 구간에서는 isLoading이 false라 로그인 직후 role=undefined로
	// 온보딩에 잘못 보낸다. isPending으로 대기 상태를 정확히 잡는다.
	if (mineQuery.isPending) {
		return <LoadingState label="밤비알바 프로필을 확인하고 있습니다." />;
	}

	if (mineQuery.isError) {
		return <ErrorState onRetry={() => mineQuery.refetch()} />;
	}

	return (
		<Redirect
			href={
				getNativeHomeRoute(
					mineQuery.data?.bambiProfile?.role as NativeProfileRole | null
				) as Href
			}
		/>
	);
}
