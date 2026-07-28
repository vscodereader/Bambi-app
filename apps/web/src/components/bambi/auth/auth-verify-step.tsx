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
		<div className="flex flex-col gap-4">
			<p className="m-0 text-muted-foreground text-sm leading-relaxed">
				밤비는 성인만 이용할 수 있어요. 본인인증을 마치면 가입 정보를 입력할 수
				있고, 가입하지 않고 공고 목록만 둘러볼 수도 있어요.
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
				triggerLabel="비회원으로 둘러보기"
			/>
			<p className="m-0 text-center text-muted-foreground text-xs">
				비회원은 공고 목록만 볼 수 있어요. 상세 열람·채팅은 회원가입이 필요해요.
			</p>
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
