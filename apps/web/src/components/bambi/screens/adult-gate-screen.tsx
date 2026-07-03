import { AuthScreen } from "./auth-screen";

export function AdultGateScreen() {
	return (
		<div className="min-h-dvh bg-secondary">
			<div className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-4 py-8">
				<section className="flex items-center gap-4 rounded-xl border border-border bg-background p-5">
					<span className="flex size-14 shrink-0 items-center justify-center rounded-full border-2 border-destructive font-extrabold text-destructive text-xl">
						19
					</span>
					<p className="m-0 text-muted-foreground text-sm leading-relaxed">
						본 정보내용은 청소년 유해매체물로서 정보통신망 이용촉진 및 정보보호
						등에 관한 법률 및 청소년 보호법의 규정에 의하여 만 19세 미만의
						청소년이 이용할 수 없습니다.
					</p>
				</section>
				<AuthScreen embedded />
			</div>
		</div>
	);
}
