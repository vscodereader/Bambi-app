import { env } from "@bambi-app/env/native";
import { Ionicons } from "@expo/vector-icons";
import type { IdentityVerificationResponse } from "@portone/browser-sdk/v2";
import {
	IdentityVerification,
	type PortOneController,
} from "@portone/react-native-sdk";
import { useThemeColor } from "heroui-native";
import { useRef } from "react";
import { Alert, Modal, Pressable, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

// 포트원 KCP 인증창을 @portone/react-native-sdk의 인앱 WebView로 앱 안에서 연다(방안 B).
// SDK가 redirectUrl을 portone://blank로 강제하고 WebView가 결과를 가로채므로 OS 딥링크·앱
// 스킴과 무관하고, windowType/redirectUrl은 넘기지 않는다. 성공/실패는 onComplete로만
// 오고(취소는 어떤 콜백도 호출하지 않아 상단 닫기 버튼이 필수), CDN 스크립트 로드 실패는
// 아무 콜백도 오지 않아 빈 화면이 남는다 — 이때도 상단 닫기 버튼이 유일한 탈출구다.
// KCP 페이지로의 2차 메인 프레임 이동 실패만 renderError로 덮인다.

const STORE_ID = env.EXPO_PUBLIC_PORTONE_STORE_ID;
const CHANNEL_KEY = env.EXPO_PUBLIC_PORTONE_CHANNEL_KEY;

// 두 값이 모두 있어야 인증을 열 수 있다 — hook 2개가 isAvailable로 재사용한다.
// 미설정(포트원 콘솔 발급 전)이면 호출부가 기존 "웹에서 이용" 안내로 폴백한다.
export const isIdentityVerificationConfigured = Boolean(
	STORE_ID && CHANNEL_KEY
);

export function IdentityVerificationModal({
	identityVerificationId,
	onCancel,
	onComplete,
}: {
	identityVerificationId: null | string;
	onCancel: () => void;
	onComplete: (response: IdentityVerificationResponse) => void;
}) {
	const insets = useSafeAreaInsets();
	const foreground = useThemeColor("foreground");
	const ref = useRef<PortOneController>(null);

	// Android 하드웨어 back: WebView 내부 이동이면 뒤로, 최상단이면 취소한다.
	const handleBack = () => {
		if (ref.current?.canGoBack) {
			ref.current.webview?.goBack();
			return;
		}

		onCancel();
	};

	// SDK 레벨 오류(스크립트 로드·네트워크)는 code가 없어 서버·PG 실패와 문구가 같으므로
	// 모달이 자체 처리한다. 서버 oRPC/PG 실패 문구는 hook이 담당한다.
	const handleError = (_error: Error) => {
		Alert.alert(
			"인증하지 못했어요",
			"본인인증을 마치지 못했어요. 잠시 후 다시 시도해 주세요."
		);
		onCancel();
	};

	return (
		<Modal
			animationType="slide"
			onRequestClose={handleBack}
			presentationStyle="fullScreen"
			visible={identityVerificationId !== null}
		>
			<View className="flex-1 bg-background" style={{ paddingTop: insets.top }}>
				<View className="h-14 flex-row items-center justify-between border-border border-b px-4">
					<Text className="font-bold text-foreground text-lg">본인인증</Text>
					<Pressable
						accessibilityLabel="본인인증 닫기"
						accessibilityRole="button"
						className="h-11 w-11 items-center justify-center rounded-2xl border border-border bg-surface active:opacity-75"
						hitSlop={8}
						onPress={onCancel}
					>
						<Ionicons color={foreground} name="close" size={22} />
					</Pressable>
				</View>
				{/* WebView는 명시 크기가 없으면 렌더되지 않는다. 미표시(id null)일 때는 아예
				    언마운트해 인증 세션을 초기화한다. */}
				{identityVerificationId === null ? null : (
					<IdentityVerification
						onComplete={onComplete}
						onError={handleError}
						ref={ref}
						// SDK가 WebView의 onError를 자기 콜백으로 가로채므로 메인 프레임 로드
						// 실패는 WebView 기본 영어 오류 화면으로 떨어진다 — 한국어로 덮는다.
						// 닫기는 상단 X 버튼이 담당한다.
						renderError={() => (
							<Text className="p-4 text-center text-muted text-sm">
								인증 화면을 불러오지 못했어요. 닫고 다시 시도해 주세요.
							</Text>
						)}
						request={{
							channelKey: CHANNEL_KEY,
							identityVerificationId,
							storeId: STORE_ID as string,
						}}
						// 초기 스크립트 로드 동안 중앙 스피너를 그린다(react-native-webview
						// 기본 defaultRenderLoading). ponytail: 첫 로드만 덮고 KCP로의 2차
						// 내비게이션은 덮지 못하는 것이 ceiling.
						startInLoadingState
						style={{ flex: 1 }}
					/>
				)}
			</View>
		</Modal>
	);
}
