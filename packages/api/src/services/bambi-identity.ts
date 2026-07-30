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
	identityVerificationId: string
): Promise<VerifiedIdentity> => {
	const verification = await fetchIdentityVerification(
		apiSecret,
		identityVerificationId
	);
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
