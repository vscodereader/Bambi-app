"use client";

import { Button } from "@bambi-app/ui/components/button";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { AuthScreen } from "./auth-screen";

export function AdultGateScreen() {
	const router = useRouter();
	const [isEntering, setIsEntering] = useState(false);

	const enterAsGuest = async () => {
		setIsEntering(true);
		try {
			await fetch("/api/guest", { method: "POST" });
			router.push("/seeker");
			router.refresh();
		} finally {
			setIsEntering(false);
		}
	};

	return (
		<div className="min-h-dvh bg-secondary">
			<div className="mx-auto flex w-full max-w-5xl flex-col gap-4 px-4 py-6">
				<section className="flex items-center gap-4 rounded-xl border border-border bg-background p-5">
					<span className="flex size-14 items-center justify-center rounded-full border-2 border-destructive font-extrabold text-destructive text-xl">
						19
					</span>
					<p className="m-0 text-muted-foreground text-sm leading-relaxed">
						본 정보내용은 청소년 유해매체물로서 정보통신망 이용촉진 및 정보보호
						등에 관한 법률 및 청소년 보호법의 규정에 의하여 만 19세 미만의
						청소년이 이용할 수 없습니다.
					</p>
				</section>
				<AuthScreen />
				<div className="flex flex-col items-center gap-2 pb-6">
					<Button
						disabled={isEntering}
						onClick={() => {
							enterAsGuest().catch(() => setIsEntering(false));
						}}
						variant="secondary"
					>
						비회원으로 공고 둘러보기
					</Button>
					<p className="m-0 text-muted-foreground text-xs">
						비회원은 공고 목록만 볼 수 있어요. 상세 열람·채팅은 회원가입이
						필요해요.
					</p>
				</div>
			</div>
		</div>
	);
}
