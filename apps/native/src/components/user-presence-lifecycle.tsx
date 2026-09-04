import { generateChatMessageId } from "@bambi-app/api/services/bambi-chat-message-id";
import { USER_PRESENCE_CONNECTION_RENEW_MS } from "@bambi-app/api/services/bambi-user-presence";
import { useEffect, useRef } from "react";
import { AppState } from "react-native";

import { authClient } from "@/lib/auth-client";
import { client, runWithoutNativeActivity } from "@/src/lib/orpc";

export function UserPresenceLifecycle() {
	const connectionId = useRef(generateChatMessageId()).current;
	const session = authClient.useSession();
	const userId = session.data?.user.id;

	useEffect(() => {
		if (!userId) {
			return;
		}
		let connected = false;
		const connect = async () => {
			await runWithoutNativeActivity(() =>
				client.bambi.presence.connect({ connectionId })
			);
			connected = true;
		};
		const disconnect = async () => {
			if (!connected) {
				return;
			}
			connected = false;
			await runWithoutNativeActivity(() =>
				client.bambi.presence.disconnect({ connectionId })
			).catch(() => undefined);
		};

		if (AppState.currentState === "active") {
			connect().catch(() => undefined);
		}
		const appStateSubscription = AppState.addEventListener(
			"change",
			(nextState) => {
				if (nextState === "active") {
					connect().catch(() => undefined);
				} else {
					disconnect().catch(() => undefined);
				}
			}
		);
		const renewTimer = setInterval(() => {
			if (!connected || AppState.currentState !== "active") {
				return;
			}
			runWithoutNativeActivity(() =>
				client.bambi.presence.renew({ connectionId })
			).catch(() => undefined);
		}, USER_PRESENCE_CONNECTION_RENEW_MS);

		return () => {
			appStateSubscription.remove();
			clearInterval(renewTimer);
			disconnect().catch(() => undefined);
		};
	}, [connectionId, userId]);

	return null;
}
