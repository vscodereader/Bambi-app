import { useQuery } from "@tanstack/react-query";
import { type Href, Redirect } from "expo-router";

import { authClient } from "@/lib/auth-client";
import { LoadingState } from "@/src/components/bambi-screen";
import {
	getNativeRoleTab,
	type NativeProfileRole,
} from "@/src/lib/bambi-native";
import { orpc } from "@/src/lib/orpc";

// 역할 탭의 자리를 채우는 화면. 평소에는 탭 눌림을 (tabs)/_layout의 tabPress에서 가로채
// 역할 영역으로 push하므로 여기까지 오지 않는다. 딥링크·상태 복원처럼 이 경로가 직접
// 열린 경우에만 렌더되며, 그때도 역할 영역(또는 구직자 홈)으로 넘긴다.
export default function SeekerRoleTabRoute() {
	const session = authClient.useSession();
	const mineQuery = useQuery({
		...orpc.bambi.onboarding.getMine.queryOptions(),
		enabled: Boolean(session.data?.user),
	});

	if (session.isPending || (session.data?.user && mineQuery.isPending)) {
		return <LoadingState label="역할 정보를 확인하고 있습니다." />;
	}

	const roleTab = getNativeRoleTab(
		mineQuery.data?.bambiProfile?.role as NativeProfileRole | null | undefined
	);

	// 조회 실패·구직자·비회원은 되돌릴 곳이 구직자 홈뿐이다(빈 탭을 남기지 않는다).
	return <Redirect href={(roleTab?.href ?? "/(seeker)") as Href} />;
}
