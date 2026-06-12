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
