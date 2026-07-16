import { db } from "@bambi-app/db";
import { member } from "@bambi-app/db/schema/auth";
import { bambiProfile, jobPost } from "@bambi-app/db/schema/bambi";
import { and, eq, gt, inArray, isNotNull, isNull, or } from "drizzle-orm";

// 수다방 "광고 중 업소" 자격을 부여하는 조직 멤버 역할: 소유자·관리자만.
export const ADVERTISER_MEMBER_ROLES = ["owner", "admin"] as const;

export const isAdvertiserEligibleRole = (
	role: string | null | undefined
): boolean => role === "owner" || role === "admin";

// 유저가 owner/admin으로 속한 조직 중, 광고 상품이 적용되고(adProductId 보유) 실제
// 공개 중(published AND paid)이며 노출이 유효(exposureEndsAt null 또는 미래)한 공고를
// 하나라도 가진 곳이 있으면 true. 만료는 조회 시 파생 처리한다(스케줄러 없음).
// 구 jobPromotionCampaign 축 판정을 광고 상품 축으로 전환했다(2026-07-16 스펙).
export const hasActiveAdExposure = async ({
	now,
	userId,
}: {
	now: Date;
	userId: string;
}): Promise<boolean> => {
	const [row] = await db
		.select({ jobPostId: jobPost.id })
		.from(jobPost)
		.innerJoin(
			member,
			and(
				eq(member.organizationId, jobPost.organizationId),
				eq(member.userId, userId),
				inArray(member.role, [...ADVERTISER_MEMBER_ROLES])
			)
		)
		.where(
			and(
				isNotNull(jobPost.adProductId),
				eq(jobPost.status, "published"),
				eq(jobPost.paymentStatus, "paid"),
				or(isNull(jobPost.exposureEndsAt), gt(jobPost.exposureEndsAt, now))
			)
		)
		.limit(1);

	return Boolean(row);
};

// 광고 상태가 바뀐 조직의 owner/admin 멤버들의 is_advertiser 캐시를 재계산해 동기화한다.
// 각 멤버는 여러 조직에 속할 수 있으므로 그 멤버의 전체 소속 기준으로 다시 판정한다.
export const syncAdvertiserFlagForOrganization = async ({
	now,
	organizationId,
}: {
	now: Date;
	organizationId: string;
}): Promise<void> => {
	const members = await db
		.select({ userId: member.userId })
		.from(member)
		.where(
			and(
				eq(member.organizationId, organizationId),
				inArray(member.role, [...ADVERTISER_MEMBER_ROLES])
			)
		);

	for (const { userId } of members) {
		const isAdvertiser = await hasActiveAdExposure({ now, userId });
		await db
			.update(bambiProfile)
			.set({ isAdvertiser })
			.where(eq(bambiProfile.userId, userId));
	}
};
