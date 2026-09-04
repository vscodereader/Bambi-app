import type { AppRouterClient } from "@bambi-app/api/routers/index";
import { readGuestTokenFromCookieString } from "@bambi-app/api/services/bambi-guest-token";
import {
	readSupportChatTokenFromCookieString,
	SUPPORT_CHAT_HEADER,
} from "@bambi-app/api/services/bambi-support-chat-token";
import {
	USER_ACTIVITY_HEADER,
	USER_ACTIVITY_HEADER_VALUE,
} from "@bambi-app/api/services/bambi-user-presence";
import { env } from "@bambi-app/env/web";
import { createORPCClient } from "@orpc/client";
import { RPCLink } from "@orpc/client/fetch";
import { createTanstackQueryUtils } from "@orpc/tanstack-query";
import { QueryClient } from "@tanstack/react-query";
import { consumeUserActivityHeader } from "@/lib/bambi/user-activity-intent";

export const queryClient = new QueryClient({
	defaultOptions: {
		queries: {
			retry: false,
		},
	},
});

export const link = new RPCLink({
	url: `${env.NEXT_PUBLIC_SERVER_URL}/rpc`,
	fetch(url, options) {
		return fetch(url, {
			...options,
			credentials: "include",
		});
	},
	headers: async () => {
		if (typeof window !== "undefined") {
			// 게스트/문의 쿠키는 host-only라 다른 호스트인 API 서버에는 실리지 않는다.
			// httpOnly:false라 JS로 읽을 수 있으므로 헤더로 옮겨 붙여 신원을 서버까지
			// 전달한다(진위 판정은 서버가 서명 검증으로 한다).
			const token = readGuestTokenFromCookieString(document.cookie);
			const supportToken = readSupportChatTokenFromCookieString(
				document.cookie
			);
			return {
				...consumeUserActivityHeader(),
				...(token ? { "x-bambi-guest": token } : {}),
				...(supportToken ? { [SUPPORT_CHAT_HEADER]: supportToken } : {}),
			};
		}

		// SSR 경유 호출은 들어온 요청 헤더를 통째로 전달하므로 Cookie 헤더에 게스트
		// 쿠키가 그대로 실린다 — 서버 context가 그쪽도 폴백으로 읽는다.
		const { headers } = await import("next/headers");
		const requestHeaders = await headers();
		const isPrefetch =
			requestHeaders.has("next-router-prefetch") ||
			requestHeaders.get("purpose") === "prefetch";
		return {
			...Object.fromEntries(requestHeaders),
			...(isPrefetch
				? {}
				: { [USER_ACTIVITY_HEADER]: USER_ACTIVITY_HEADER_VALUE }),
		};
	},
});

export const client: AppRouterClient = createORPCClient(link);

export const orpc = createTanstackQueryUtils(client);
