import { env } from "@bambi-app/env/native";
import { deleteItemAsync, getItem, setItemAsync } from "expo-secure-store";

const STORAGE_KEY = "bambi-app.support-chat-token";
let cachedToken: null | string = (() => {
	try {
		return getItem(STORAGE_KEY);
	} catch {
		return null;
	}
})();

export const readSupportChatToken = (): null | string => cachedToken;

export const clearSupportChatToken = async (): Promise<void> => {
	cachedToken = null;
	await deleteItemAsync(STORAGE_KEY).catch(() => undefined);
};

export const ensureSupportChatToken = async (): Promise<string> => {
	if (cachedToken) {
		return cachedToken;
	}
	const response = await fetch(
		`${env.EXPO_PUBLIC_SERVER_URL}/support-chat/session`,
		{ method: "POST" }
	);
	if (!response.ok) {
		throw new Error("상담을 시작하지 못했어요. 잠시 후 다시 시도해 주세요.");
	}
	const result = (await response.json()) as { token?: unknown };
	if (typeof result.token !== "string" || !result.token) {
		throw new Error("상담 신원을 확인하지 못했어요.");
	}
	cachedToken = result.token;
	await setItemAsync(STORAGE_KEY, result.token);
	return result.token;
};
