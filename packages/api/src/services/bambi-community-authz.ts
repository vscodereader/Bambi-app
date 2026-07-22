import { ORPCError } from "@orpc/server";

import { hasActiveAdExposure } from "./bambi-advertiser";
import {
	type BambiAccessProfile,
	requireActiveBambiProfile,
	type SessionLike,
} from "./bambi-authz";
import { resolveCommunityAccess } from "./bambi-community-access";

// 수다방 라우터 공용 가드. 클라이언트 게이트(RequireCommunityAccess)와 별개로 서버에서도
// 자격(여성 | 광고 중 업소 | 관리자)을 강제한다. isAdvertiser는 캐시 컬럼이 아니라
// 라이브 파생값(hasActiveAdExposure)을 쓴다 — 캐시 불신 원칙(onboarding.getMine과 동일).
// 판정 축은 PR #29에서 광고 캠페인 → 광고 상품 적용 공고로 바뀌었다(2026-07-16 스펙).
export const requireCommunityMember = async (
	session: SessionLike | null | undefined
): Promise<BambiAccessProfile> => {
	const profile = await requireActiveBambiProfile(session);
	const isAdvertiser =
		profile.role === "employer"
			? await hasActiveAdExposure({
					now: new Date(),
					userId: profile.userId,
				})
			: false;
	const access = resolveCommunityAccess({
		gender: profile.gender,
		isAdvertiser,
		role: profile.role,
		status: profile.status,
	});

	if (!access.canAccess) {
		throw new ORPCError("FORBIDDEN", {
			message: "여성회원과 광고 중인 업소회원만 이용가능합니다",
		});
	}

	return profile;
};

// 자격이 없어도 실패하지 않는 판정 — 홈 미리보기(overview)처럼 미자격자·비로그인에게도
// 요약을 보여주는 public 경로에서 쓴다. 자격 실패(ORPCError)만 null로 접고, DB 오류
// 같은 예기치 못한 실패는 그대로 던진다.
export const findCommunityMember = async (
	session: SessionLike | null | undefined
): Promise<BambiAccessProfile | null> => {
	try {
		return await requireCommunityMember(session);
	} catch (error) {
		if (error instanceof ORPCError) {
			return null;
		}
		throw error;
	}
};
