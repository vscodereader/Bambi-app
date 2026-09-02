import { type Href, router } from "expo-router";
import { Button } from "heroui-native";
import { useState } from "react";
import { Alert } from "react-native";

import { authClient } from "@/lib/auth-client";
import { clearGuestToken } from "@/src/lib/guest-store";
import { queryClient } from "@/src/lib/orpc";

export function LogoutButton() {
	const [isPending, setIsPending] = useState(false);

	const runSignOut = async () => {
		setIsPending(true);

		// @better-auth/expo는 요청을 보내는 시점에 SecureStore 쿠키와 세션 캐시를 비운다.
		// 서버 응답이 실패해도 로컬 세션은 이미 해제되므로 실패 알림은 띄우지 않는다.
		await authClient.signOut().catch(() => undefined);
		// 게스트로 둘러보다 회원 로그인했다면 남은 게스트 토큰까지 지워야 완전 로그아웃이다(실패 무시).
		await clearGuestToken().catch(() => undefined);
		// invalidateQueries는 stale 표시만 하고 데이터를 남기며, 기본 refetchType "active"라
		// 비활성 쿼리는 재요청도 하지 않는다. 이전 계정의 role·목록이 캐시에 남으면 다음
		// 사용자가 그 값으로 잘못 라우팅되므로 캐시를 실제로 비운다.
		queryClient.clear();
		setIsPending(false);
		// expo-router의 <Redirect>는 useFocusEffect 안에서만 replace를 실행한다.
		// app/index.tsx는 진입 시 이미 역할 홈으로 replace되어 스택에서 빠지므로, 세션이
		// 사라져도 그 Redirect는 다시 돌지 않는다. 로그아웃 경로에서 직접 보낸다.
		// push가 아니라 replace여야 뒤로가기로 죽은 세션 화면에 돌아가지 않는다.
		router.replace("/login" as Href);
	};

	const confirmSignOut = () => {
		Alert.alert("로그아웃하시겠습니까?", "다시 이용하려면 로그인해야 합니다.", [
			{ style: "cancel", text: "취소" },
			{ onPress: runSignOut, style: "destructive", text: "로그아웃" },
		]);
	};

	return (
		<Button
			isDisabled={isPending}
			onPress={confirmSignOut}
			size="sm"
			variant="secondary"
		>
			<Button.Label>로그아웃</Button.Label>
		</Button>
	);
}
