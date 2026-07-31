// 포트원 본인인증 결과를 "믿을 수 있는 형태"로 바꾸는 공통 절차. verifyMyPhone(기존
// 회원 재인증) · checkIdentityForSignup(가입 전 확인) · 프로필 생성이 같은 규칙을
// 쓰도록 한 곳에 모은다. DB는 건드리지 않는다 — 중복 판정은 호출부가 한다.

import { ORPCError } from "@orpc/server";
import {
	fetchIdentityVerification,
	hashIdentityValue,
	isAdultBirth8,
	mapPortOneGender,
	toBirth8,
	UNDERAGE_MESSAGE,
} from "./portone-identity";

export interface VerifiedIdentity {
	birth8: string;
	ciHash: string;
	diHash: string;
	gender: "female" | "male" | null;
	phoneNumber?: string;
}

export const resolveVerifiedIdentity = async (
	apiSecret: string,
	identityVerificationId: string,
	// 옵션을 통째로 생략하면 TEST 채널을 거부한다(안전 기본값). 나중에 누가 새 호출부를
	// 추가하면서 옵션을 깜빡해도 엄격한 쪽으로 떨어져야 하기 때문이다. 프로덕션 판정은
	// 호출부가 한다 — 이 모듈은 env·db에 의존하지 않는다(파일 상단 규칙).
	options?: { allowTestChannel?: boolean }
): Promise<VerifiedIdentity> => {
	const allowTestChannel = options?.allowTestChannel === true;
	const verification = await fetchIdentityVerification(
		apiSecret,
		identityVerificationId
	);
	if (allowTestChannel) {
		// 테스트 채널을 허용하는 개발 환경에서만 남기는 진단 로그. 테스트 채널이 인증창
		// 입력값을 그대로 돌려주는지(echo) 고정 더미를 주는지 판별할 수단이 이것뿐이다.
		// ci·di·name·phoneNumber·pgRawResponse는 민감정보라 절대 싣지 않는다.
		console.log("[identity] portone verification", {
			birthDate: verification.verifiedCustomer?.birthDate,
			channelType: verification.channel?.type,
			gender: verification.verifiedCustomer?.gender,
		});
	}
	// 테스트 채널은 통신사 대조 없이 아무 값이나 VERIFIED로 돌려준다. 사용자에게는
	// 내부 사정(잘못 연결된 채널)을 드러내지 않고 일시적 장애처럼 안내한다.
	if (verification.channel?.type === "TEST" && !allowTestChannel) {
		throw new ORPCError("INTERNAL_SERVER_ERROR", {
			message: "본인인증이 아직 준비되지 않았어요. 잠시 후 다시 시도해 주세요.",
		});
	}
	if (verification.status !== "VERIFIED") {
		throw new ORPCError("BAD_REQUEST", {
			message: "본인인증이 완료되지 않았습니다. 다시 시도해 주세요.",
		});
	}
	const customer = verification.verifiedCustomer;
	const birth8 = toBirth8(customer?.birthDate);
	// 생년월일을 못 읽으면 성인임을 증명할 수 없으므로 거부한다(안전 기본값).
	if (!(birth8 && isAdultBirth8(birth8, new Date()))) {
		throw new ORPCError("FORBIDDEN", { message: UNDERAGE_MESSAGE });
	}
	if (!customer?.ci) {
		throw new ORPCError("BAD_REQUEST", {
			message: "인증 정보에 개인 식별값(CI)이 없습니다.",
		});
	}
	if (!customer.di) {
		throw new ORPCError("BAD_REQUEST", {
			message: "인증 정보에 중복확인 식별값(DI)이 없습니다.",
		});
	}
	// CI·DI 원문은 저장하지 않는다 — 해시로 중복 계정만 판별한다.
	return {
		birth8,
		ciHash: await hashIdentityValue(customer.ci),
		diHash: await hashIdentityValue(customer.di),
		gender: mapPortOneGender(customer.gender),
		phoneNumber: customer.phoneNumber,
	};
};
