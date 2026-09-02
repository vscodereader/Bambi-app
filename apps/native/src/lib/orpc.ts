import type { AppRouterClient } from "@bambi-app/api/routers/index";
import { env } from "@bambi-app/env/native";
import { createORPCClient } from "@orpc/client";
import { RPCLink } from "@orpc/client/fetch";
import { createTanstackQueryUtils } from "@orpc/tanstack-query";
import { QueryClient } from "@tanstack/react-query";
import { Platform } from "react-native";

import { authClient } from "@/lib/auth-client";

import { readGuestToken } from "./guest-store";

export const queryClient = new QueryClient();

export const link = new RPCLink({
	url: `${env.EXPO_PUBLIC_SERVER_URL}/rpc`,
	fetch(url, options) {
		return fetch(url, {
			...options,
			credentials: Platform.OS === "web" ? "include" : "omit",
		});
	},
	headers() {
		if (Platform.OS === "web") {
			return {};
		}

		const headers = new Map<string, string>();
		const cookies = authClient.getCookie();

		if (cookies) {
			headers.set("Cookie", cookies);
		} else {
			// 세션 쿠키가 없을 때만 게스트 토큰을 싣는다. 서버 context.ts가 이 헤더를
			// 읽어 게스트 신원을 해석하고, cors.ts도 x-bambi-guest를 이미 허용한다.
			const guestToken = readGuestToken();
			if (guestToken) {
				headers.set("x-bambi-guest", guestToken);
			}
		}

		return Object.fromEntries(headers);
	},
});

export const client: AppRouterClient = createORPCClient(link);

export const orpc = createTanstackQueryUtils(client);
