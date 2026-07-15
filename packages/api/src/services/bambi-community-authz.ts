import { ORPCError } from "@orpc/server";

import { hasActiveAdvertiserCampaign } from "./bambi-advertiser";
import {
	type BambiAccessProfile,
	requireActiveBambiProfile,
	type SessionLike,
} from "./bambi-authz";
import { resolveCommunityAccess } from "./bambi-community-access";

// 수다방 라우터 공용 가드. 클라이언트 게이트(RequireCommunityAccess)와 별개로 서버에서도
// 자격(여성 | 광고 중 업소 | 관리자)을 강제한다. isAdvertiser는 캐시 컬럼이 아니라
// 라이브 파생값(hasActiveAdvertiserCampaign)을 쓴다 — 캐시 불신 원칙(onboarding.getMine과 동일).
export const requireCommunityMember = async (
	session: SessionLike | null | undefined
): Promise<BambiAccessProfile> => {
	const profile = await requireActiveBambiProfile(session);
	const isAdvertiser =
		profile.role === "employer"
			? await hasActiveAdvertiserCampaign({
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
