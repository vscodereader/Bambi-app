// 회원가입 1단계: 본인인증. 여기서 갈래가 둘로 나뉜다 — 인증 후 가입 폼으로 가거나,
// 인증만 하고 비회원으로 목록을 둘러보거나.

import type { MockPhoneVerifyInput } from "@/lib/bambi/guest";
import { PhoneVerifyDialog } from "../phone-verify-dialog";

// 모바일 인증은 리디렉션이라 두 버튼이 같은 화면으로 함께 복귀한다. 인증을 시작한
// 버튼만 결과를 처리하도록 서로 다른 intent를 준다(phone-verify-dialog 참고).
const SIGNUP_INTENT = "auth-panel:signup";
const GUEST_INTENT = "auth-panel:guest";

export function AuthVerifyStep({
	onMockVerifiedForGuest,
	onMockVerifiedForSignup,
	onToggleMode,
	onVerifiedForGuest,
	onVerifiedForSignup,
}: {
	onMockVerifiedForGuest: (input: MockPhoneVerifyInput) => Promise<void>;
	onMockVerifiedForSignup: (input: MockPhoneVerifyInput) => Promise<void>;
	onToggleMode: () => void;
	onVerifiedForGuest: (identityVerificationId: string) => Promise<void>;
	onVerifiedForSignup: (identityVerificationId: string) => Promise<void>;
}) {
	return (
		<div className="flex flex-col gap-3">
			{/* 뒤에 깔린 배경은 md 미만에서 감춰지므로, 문장만으로도 "지금은 가려져
			    있다 → 인증하면 열린다"가 성립해야 한다. */}
			<p className="m-0 text-muted-foreground text-sm leading-relaxed">
				지금은 공고가 흐리게 가려져 있어요. 본인인증을 마치면 업소명·급여·위치가
				그대로 열려요.
			</p>
			<PhoneVerifyDialog
				intent={SIGNUP_INTENT}
				onMockVerified={onMockVerifiedForSignup}
				onVerified={onVerifiedForSignup}
				triggerLabel="본인인증하고 계속하기"
				variant="primary"
			/>
			<PhoneVerifyDialog
				intent={GUEST_INTENT}
				onMockVerified={onMockVerifiedForGuest}
				onVerified={onVerifiedForGuest}
				triggerLabel="비회원으로 목록만 보기"
				variant="ghost"
			/>
			<p className="m-0 text-center text-muted-foreground text-sm">
				이미 계정이 있으신가요?{" "}
				<button
					className="font-bold text-primary underline-offset-2 hover:underline"
					onClick={onToggleMode}
					type="button"
				>
					로그인
				</button>
			</p>
		</div>
	);
}
