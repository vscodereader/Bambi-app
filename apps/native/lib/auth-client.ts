// ponytail: @better-auth/expo의 온라인 감지가 expo-network를 import()로 불러 lazy 청크로 쪼개지고,
// 그 첫 요청이 metro의 "Requiring unknown module" 에러를 콘솔에 남긴다(동작은 정상).
// 정적 import로 메인 번들에 포함시켜 분할 자체를 없앤다.
import "expo-network";
import { env } from "@bambi-app/env/native";
import { expoClient } from "@better-auth/expo/client";
import { organizationClient, usernameClient } from "better-auth/client/plugins";
import { createAuthClient } from "better-auth/react";
import Constants from "expo-constants";
import { getItem, setItem } from "expo-secure-store";

export const authClient = createAuthClient({
	baseURL: env.EXPO_PUBLIC_SERVER_URL,
	plugins: [
		expoClient({
			// 서버가 내려주는 세션 쿠키 이름의 prefix. 여기와 어긋나면 @better-auth/expo가
			// Set-Cookie를 "우리 쿠키가 아니다"로 보고 SecureStore에 저장하지 않아,
			// 로그인 200 뒤에도 세션이 붙지 않는다. 값은 서버 packages/env의
			// BAMBI_COOKIE_PREFIX와 커플링되어 있다(prod=bambi, dev=bambi-dev, 로컬 미설정
			// =better-auth 기본). 서버 env를 바꾸면 이 배열도 같이 바꿔야 한다.
			cookiePrefix: ["bambi", "bambi-dev", "better-auth"],
			scheme: Constants.expoConfig?.scheme as string,
			storagePrefix: Constants.expoConfig?.scheme as string,
			storage: {
				getItem,
				setItem,
			},
		}),
		organizationClient({
			teams: {
				enabled: true,
			},
		}),
		usernameClient(),
	],
});
