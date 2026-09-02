// 게스트 본인인증 토큰을 SecureStore에 보관하고, 화면이 useSyncExternalStore로 구독한다.
// 서버 세션이 없는 방문자의 성인/커뮤니티 게이트 분기용이다. auth-client.ts가 이미
// expo-secure-store를 쓴다. orpc.ts를 import 하지 않는다(순환 방지) — orpc가 이 모듈의
// readGuestToken을 헤더에 싣기 때문이다.

import { deleteItemAsync, getItem, setItemAsync } from "expo-secure-store";
import { useSyncExternalStore } from "react";

import { authClient } from "@/lib/auth-client";

import {
	GUEST_TOKEN_STORAGE_KEY,
	type GuestVisitor,
	resolveGuestVisitor,
} from "./guest-token";

// 앱 시작 시 1회 동기 로드(getItem은 동기). SecureStore 접근이 실패하면 null로 시작한다.
let cached: string | null = (() => {
	try {
		return getItem(GUEST_TOKEN_STORAGE_KEY);
	} catch {
		return null;
	}
})();

const listeners = new Set<() => void>();

const notify = (): void => {
	for (const listener of listeners) {
		listener();
	}
};

const subscribe = (listener: () => void): (() => void) => {
	listeners.add(listener);
	return () => {
		listeners.delete(listener);
	};
};

// 만료 판정은 하지 않고 저장된 문자열을 그대로 돌려준다(호출부가 resolveGuestVisitor로
// 만료까지 본다). orpc.ts의 헤더 조립이 이 값을 쓴다.
export const readGuestToken = (): string | null => cached;

export const saveGuestToken = async (token: string): Promise<void> => {
	cached = token;
	notify();
	await setItemAsync(GUEST_TOKEN_STORAGE_KEY, token);
};

export const clearGuestToken = async (): Promise<void> => {
	cached = null;
	notify();
	try {
		await deleteItemAsync(GUEST_TOKEN_STORAGE_KEY);
	} catch {
		// 이미 없거나 SecureStore 실패는 무시한다 — 메모리 캐시는 이미 비웠다.
	}
};

// getSnapshot은 반드시 cached 문자열을 그대로 반환해 참조 안정성을 지킨다(매 렌더 새
// 객체를 만들면 useSyncExternalStore가 무한 렌더로 본다). 파싱은 스냅샷 밖에서 한다.
export function useGuestVisitor(): GuestVisitor | null {
	const token = useSyncExternalStore(subscribe, readGuestToken, readGuestToken);
	return resolveGuestVisitor(token, new Date());
}

export type VisitorState = "anon" | "guest" | "member" | "pending";

// 웹 visitor.ts와 같은 3분류 + 세션 로딩 중 pending. 세션이 있으면 member, 없으면
// 게스트 유무로 guest/anon.
export function useVisitor(): {
	guest: GuestVisitor | null;
	state: VisitorState;
} {
	const session = authClient.useSession();
	const guest = useGuestVisitor();

	if (session.isPending) {
		return { guest, state: "pending" };
	}
	if (session.data?.user) {
		return { guest, state: "member" };
	}
	return { guest, state: guest ? "guest" : "anon" };
}
