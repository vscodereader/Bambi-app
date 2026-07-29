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

	if (session.isPending || mineQuery.isLoading) {
		return <LoadingState label="밤비알바 프로필을 확인하고 있습니다." />;
	}

	if (!session.data?.user) {
		return <Redirect href={"/login" as Href} />;
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
