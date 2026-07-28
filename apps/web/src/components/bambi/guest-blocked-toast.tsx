"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef } from "react";
import { toast } from "sonner";

// 게스트가 공고 목록(/seeker) 외 경로로 진입해 게이트가 /seeker로 돌려보냈을 때,
// "회원가입 후에 볼 수 있어요" 토스트를 1회 띄운다. 새로고침·재렌더로 토스트가
// 반복되지 않도록 신호 파라미터(guestBlocked)만 지우고, 함께 온 auth 파라미터는
// 남겨 방금 열린 인증 다이얼로그가 닫히지 않게 한다.
export function GuestBlockedToast() {
	const router = useRouter();
	const searchParams = useSearchParams();
	const shown = useRef(false);

	useEffect(() => {
		if (shown.current || searchParams.get("guestBlocked") !== "1") {
			return;
		}
		shown.current = true;
		toast("회원가입 후에 볼 수 있어요");
		router.replace("/seeker?auth=signup");
	}, [searchParams, router]);

	return null;
}
