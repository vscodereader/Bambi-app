// 로그인·회원가입 폼의 인라인 안내(검증 오류·정보). 폼 흐름 안에 남아 있어야 해서
// 토스트가 아니라 폼 안에 렌더한다.

import { cn } from "@bambi-app/ui/lib/utils";

export interface Notice {
	text: string;
	tone: "error" | "info";
}

export function AuthNotice({ notice }: { notice: Notice | null }) {
	if (!notice) {
		return null;
	}
	return (
		<div
			className={cn(
				"rounded-lg border px-4 py-3 font-semibold text-sm",
				notice.tone === "error"
					? "border-destructive/30 bg-destructive/10 text-destructive"
					: "border-border bg-secondary text-muted-foreground"
			)}
			role={notice.tone === "error" ? "alert" : "status"}
		>
			{notice.text}
		</div>
	);
}
