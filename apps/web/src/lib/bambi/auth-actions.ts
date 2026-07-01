import type { useRouter } from "next/navigation";
import { toast } from "sonner";
import { authClient } from "@/lib/auth-client";

type AppRouter = ReturnType<typeof useRouter>;

// 의도적 로그아웃 여부. 로그아웃은 세션을 비워 RequireAuth 가드의 로그인
// 리다이렉트를 유발하므로, 이 플래그로 가드가 잘못된 "로그인 필요" 토스트·
// 리다이렉트를 내지 않도록 조율한다(가드가 플래그를 소비한다).
let signingOut = false;

export function isSigningOut(): boolean {
	return signingOut;
}

export function clearSigningOut(): void {
	signingOut = false;
}

// 로그아웃 후 공개 마켓("/")으로 이동. 세션이 비워지는 동안 가드가 개입하지
// 않도록 signingOut 플래그를 세운다.
export async function signOutToHome(router: AppRouter): Promise<void> {
	signingOut = true;
	try {
		await authClient.signOut();
		router.push("/");
		router.refresh();
	} catch {
		signingOut = false;
		toast.error("로그아웃에 실패했어요. 다시 시도해 주세요.");
	}
}
