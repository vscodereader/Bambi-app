// 회원가입 1단계: 본인인증. 여기서 갈래가 둘로 나뉜다 — 인증 후 가입 폼으로 가거나,
// 인증만 하고 비회원으로 목록을 둘러보거나.

import type { MockPhoneVerifyInput } from "@/lib/bambi/guest";
import { PhoneVerifyDialog } from "../phone-verify-dialog";

// 모바일 인증은 리디렉션이라 두 버튼이 같은 화면으로 함께 복귀한다. 인증을 시작한
// 버튼만 결과를 처리하도록 서로 다른 intent를 준다(phone-verify-dialog 참고).
const SIGNUP_INTENT = "auth-panel:signup";
const GUEST_INTENT = "auth-panel:guest";

// 배경 목록의 공고가 실제로 가려져 있는 그 문자다(lib/bambi/auth-backdrop의 마스크).
// 뒤에 깔린 화면을 문장 안으로 끌어와 "인증 전에는 여기까지만 보인다"를 카드 안에서도
// 성립시킨다 — 배경이 없는 모바일에서도 이 한 줄만으로 논지가 남는다.
// 스크린리더에는 "검은 사각형" 반복 대신 뜻으로 읽힌다.
function MaskedRun() {
	return (
		<>
			{/* coral-500은 흰 배경에서 3.35:1이라 본문 크기 글자로는 대비가 모자란다.
			    coral-700(5.86:1)이 AA를 넘기고, 더 짙어서 "먹칠"로도 잘 읽힌다. */}
			<span aria-hidden className="font-extrabold text-coral-700">
				■■■■
			</span>
			<span className="sr-only">가려진 채</span>
		</>
	);
}

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
			<p className="m-0 text-muted-foreground text-sm leading-relaxed">
				지금은 업소명·급여·위치가 <MaskedRun />로 보여요. 본인인증을 마치면
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
