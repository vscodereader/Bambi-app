"use client";

// 이미 본인인증을 마친 게스트가 실제 목록 위에서 여는 로그인·회원가입 다이얼로그.
// anon 화면과 달리 닫을 수 있다(뒤에 볼 것이 있다). 패널 내용은 AuthPanel로 공유한다.

import { Dialog, DialogContent } from "@bambi-app/ui/components/dialog";
import type { Route } from "next";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { AuthPanel } from "./auth-panel";

export function AuthDialog() {
	const router = useRouter();
	const pathname = usePathname();
	const searchParams = useSearchParams();
	const auth = searchParams.get("auth");
	// 열림 상태의 원천은 URL이다 — 게이트 리다이렉트·헤더 링크·뒤로가기가 모두 같은
	// 신호를 쓰고, 별도 state를 두지 않아 URL과 화면이 어긋날 여지가 없다.
	const isOpen = auth === "login" || auth === "signup";

	// 닫기 = 쿼리를 지우는 것. history를 더럽히지 않도록 replace를 쓴다.
	const close = () => {
		router.replace(pathname as Route);
	};

	return (
		<Dialog onOpenChange={(open) => (open ? undefined : close())} open={isOpen}>
			{/* 패널이 자체 제목(h2)을 그리므로 DialogTitle을 겹쳐 넣지 않고 aria-label로
			    접근 이름만 준다. max-h로 잘라 두어야 좁은 화면에서 가입 폼이 길어져도
			    화면 밖으로 넘치지 않고 안에서 스크롤된다. */}
			<DialogContent aria-label="로그인 · 회원가입" className="max-h-[90dvh]">
				<AuthPanel compact onDone={close} />
			</DialogContent>
		</Dialog>
	);
}
