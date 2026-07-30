import { cn } from "@bambi-app/ui/lib/utils";

// 청소년유해매체물 고지. 인증 UI에 상시 노출한다(로그인·회원가입 양쪽 모두).
// 법정 요건은 "명확히 고지"라서 fine print로 흘려보내지 않는다 — 카드 하단에 두되
// 자체 면(muted 패널)과 본문 크기 글자로 확실히 눈에 걸리게 한다.
// 다만 색은 muted 계열로만 쓴다: 코럴을 쓰면 주 액션(본인인증 CTA)과 위계가 뒤집힌다.
// shadcn Alert를 쓰지 않는 이유는 role="alert"(라이브 리전)다 — 상시 노출되는 법정
// 고지를 매 렌더마다 스크린리더가 경보로 읽어버린다.
// 여백은 쓰는 쪽이 className으로 준다.
export function AdultNotice({ className }: { className?: string } = {}) {
	return (
		<section
			className={cn(
				"flex items-start gap-3 rounded-lg border border-border bg-muted/60 p-4",
				className
			)}
		>
			<span className="flex size-9 shrink-0 items-center justify-center rounded-full border-2 border-muted-foreground/70 font-extrabold text-muted-foreground text-sm">
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
