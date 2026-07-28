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
		// 제목 바로 아래에 버튼이 붙지 않도록 pt로 한 칸 띄운다 — 제목과 첫 액션이
		// 맞닿으면 카드가 답답해 보인다.
		<div className="flex flex-col gap-2 pt-4">
			{/* 위계는 셋이 뚜렷이 달라야 한다: 채운 코럴(가입) > 테두리(둘러보기) > 텍스트(로그인).
			    글로우는 끈다 — 같은 카드의 가입·로그인 제출 버튼도 shadow-none이라 이 버튼만
			    빛나면 카드 안에서 혼자 떠 보인다. */}
			<PhoneVerifyDialog
				className="shadow-none"
				intent={SIGNUP_INTENT}
				onMockVerified={onMockVerifiedForSignup}
				onVerified={onVerifiedForSignup}
				triggerLabel="본인인증하고 계속하기"
				variant="primary"
			/>
			{/* ghost는 아이콘 붙은 글줄처럼 읽혀 버튼인지 알기 어려웠다. 테두리를 주고 한 단계
			    낮은 크기로 낮춰 "누를 수 있지만 주 액션은 아니다"를 형태로 말한다. */}
			<PhoneVerifyDialog
				intent={GUEST_INTENT}
				onMockVerified={onMockVerifiedForGuest}
				onVerified={onVerifiedForGuest}
				size="md"
				triggerLabel="비회원으로 목록만 보기"
				variant="secondary"
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
