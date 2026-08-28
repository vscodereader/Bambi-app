// ponytail: @better-auth/expo의 온라인 감지가 expo-network를 import()로 불러 lazy 청크로 쪼개지고,
// 그 첫 요청이 metro의 "Requiring unknown module" 에러를 콘솔에 남긴다(동작은 정상).
// 정적 import로 메인 번들에 포함시켜 분할 자체를 없앤다.
import "expo-network";
import { env } from "@bambi-app/env/native";
import { expoClient } from "@better-auth/expo/client";
import { organizationClient } from "better-auth/client/plugins";
import { createAuthClient } from "better-auth/react";
import Constants from "expo-constants";
import { getItem, setItem } from "expo-secure-store";

export const authClient = createAuthClient({
	baseURL: env.EXPO_PUBLIC_SERVER_URL,
	plugins: [
		expoClient({
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
	],
});
