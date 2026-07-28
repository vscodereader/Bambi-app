import { cn } from "@bambi-app/ui/lib/utils";

// 청소년유해매체물 고지. 인증 UI 상단에 상시 노출한다(로그인·회원가입 양쪽 모두).
export function AdultNotice({ className }: { className?: string } = {}) {
	return (
		<section
			className={cn(
				"flex items-center gap-4 rounded-xl border border-border bg-background p-5",
				className
			)}
		>
			<span className="flex size-14 shrink-0 items-center justify-center rounded-full border-2 border-destructive font-extrabold text-destructive text-xl">
				19
			</span>
			<p className="m-0 text-muted-foreground text-sm leading-relaxed">
				본 정보내용은 청소년 유해매체물로서 정보통신망 이용촉진 및 정보보호 등에
				관한 법률 및 청소년 보호법의 규정에 의하여 만 19세 미만의 청소년이
				이용할 수 없습니다.
			</p>
		</section>
	);
}
