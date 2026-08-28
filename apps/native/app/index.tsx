import { useQuery } from "@tanstack/react-query";
import { type Href, Redirect } from "expo-router";
import { authClient } from "@/lib/auth-client";
import { ErrorState, LoadingState } from "@/src/components/bambi-screen";
import {
	getNativeHomeRoute,
	type NativeProfileRole,
} from "@/src/lib/bambi-native";
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
