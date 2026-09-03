import { useQuery } from "@tanstack/react-query";
import { type Href, Redirect, Stack } from "expo-router";

import { authClient } from "@/lib/auth-client";
import { ErrorState, LoadingState } from "@/src/components/bambi-screen";
import { SeekerStackHeader } from "@/src/components/seeker-header";
import {
	getNativeHomeRoute,
	type NativeProfileRole,
} from "@/src/lib/bambi-native";
import { orpc } from "@/src/lib/orpc";

export default function EmployerLayout() {
	const session = authClient.useSession();
	const mineQuery = useQuery({
		...orpc.bambi.onboarding.getMine.queryOptions(),
		enabled: Boolean(session.data?.user),
	});

	if (session.isPending || (session.data?.user && mineQuery.isPending)) {
		return <LoadingState label="구인자 정보를 확인하고 있습니다." />;
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

	// 구인자 영역은 employer·admin만. 그 외 역할(구직자 등)은 자기 홈으로 되돌린다.
	if (role !== "admin" && role !== "employer") {
		return <Redirect href={getNativeHomeRoute(role) as Href} />;
	}

	return (
		<Stack
			screenOptions={{
				header: (props) => <SeekerStackHeader {...props} />,
			}}
		>
			<Stack.Screen name="(tabs)" options={{ headerShown: false }} />
			<Stack.Screen name="new" options={{ title: "새 공고" }} />
			<Stack.Screen name="jobs/[id]/edit" options={{ title: "공고 편집" }} />
			<Stack.Screen
				name="me/organization"
				options={{ title: "업체 정보 수정" }}
			/>
			<Stack.Screen name="me/business" options={{ title: "사업자 인증" }} />
		</Stack>
	);
}
