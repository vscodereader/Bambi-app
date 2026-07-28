// 회원가입 1단계: 본인인증. 인증을 마쳐야 2단계인 가입 폼이 열린다.
// 비회원 둘러보기는 가입 흐름이 아니므로 여기가 아니라 로그인 폼 아래에 둔다(auth-panel).

import type { MockPhoneVerifyInput } from "@/lib/bambi/guest";
import { PhoneVerifyDialog } from "../phone-verify-dialog";

// 모바일 인증은 리디렉션이라, 복귀한 화면이 인증을 시작한 화면과 다를 수 있다(가입 단계에서
// 시작해도 쿼리에 auth=signup이 없으면 로그인 폼으로 돌아온다). 그 화면에 있는 게스트 버튼이
// 이 인증 결과를 가로채지 않도록 auth-panel의 GUEST_INTENT와 값을 다르게 둔다
// (처리 주체를 가리는 방식은 phone-verify-dialog 참고).
const SIGNUP_INTENT = "auth-panel:signup";

export function AuthVerifyStep({
	onMockVerifiedForSignup,
	onToggleMode,
	onVerifiedForSignup,
}: {
	onMockVerifiedForSignup: (input: MockPhoneVerifyInput) => Promise<void>;
	onToggleMode: () => void;
	onVerifiedForSignup: (identityVerificationId: string) => Promise<void>;
}) {
	return (
		// 제목 바로 아래에 버튼이 붙지 않도록 pt로 한 칸 띄운다 — 제목과 첫 액션이
		// 맞닿으면 카드가 답답해 보인다.
		<div className="flex flex-col gap-2 pt-4">
			{/* 위계는 채운 코럴(가입) > 텍스트(로그인)로 뚜렷이 갈린다. 글로우는 끈다 —
			    같은 카드의 가입·로그인 제출 버튼도 shadow-none이라 이 버튼만 빛나면
			    카드 안에서 혼자 떠 보인다. */}
			<PhoneVerifyDialog
				className="shadow-none"
				intent={SIGNUP_INTENT}
				onMockVerified={onMockVerifiedForSignup}
				onVerified={onVerifiedForSignup}
				triggerLabel="본인인증하고 계속하기"
				variant="primary"
			/>
			{/* 계정 전환은 이 화면의 과업이 아니라 빠져나가는 길이라, 버튼 묶음에서 떼어 둔다. */}
			<p className="m-0 pt-3 text-center text-muted-foreground text-sm">
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
