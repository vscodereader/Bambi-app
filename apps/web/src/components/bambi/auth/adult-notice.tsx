import { cn } from "@bambi-app/ui/lib/utils";

// 청소년유해매체물 고지. 인증 UI에 상시 노출한다(로그인·회원가입 양쪽 모두).
// 법정 요건은 "명확히 고지"이지 "가장 크게"가 아니라서, 전문은 그대로 두되 시각 무게는
// 카드에서 가장 낮게 잡는다 — 카드 최상단의 히어로가 아니라 하단 fine print 자리다.
// 구분선·여백은 쓰는 쪽이 className으로 준다.
export function AdultNotice({ className }: { className?: string } = {}) {
	return (
		<section className={cn("flex items-start gap-2.5", className)}>
			<span className="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full border border-muted-foreground/60 font-extrabold text-muted-foreground text-xs">
				19
			</span>
			<p className="m-0 text-muted-foreground text-xs leading-relaxed">
				본 정보내용은 청소년 유해매체물로서 정보통신망 이용촉진 및 정보보호 등에
				관한 법률 및 청소년 보호법의 규정에 의하여 만 19세 미만의 청소년이
				이용할 수 없습니다.
			</p>
		</section>
	);
}
