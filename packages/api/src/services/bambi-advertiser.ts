import { db } from "@bambi-app/db";
import { member } from "@bambi-app/db/schema/auth";
import { bambiProfile, jobPromotionCampaign } from "@bambi-app/db/schema/bambi";
import { and, eq, gt, inArray, lte } from "drizzle-orm";

// 수다방 "광고 중 업소" 자격을 부여하는 조직 멤버 역할: 소유자·관리자만.
export const ADVERTISER_MEMBER_ROLES = ["owner", "admin"] as const;

export const isAdvertiserEligibleRole = (
	role: string | null | undefined
): boolean => role === "owner" || role === "admin";

// 유저가 owner/admin으로 속한 조직 중 지금 실제로 활성(active AND startsAt<=now<endsAt)
// 캠페인을 가진 곳이 하나라도 있으면 true. 만료는 endsAt 필터로 조회 시 파생 처리한다
// (스케줄러 없음). 이 값이 수다방 광고 자격의 권위값이다.
export const hasActiveAdvertiserCampaign = async ({
	now,
	userId,
}: {
	now: Date;
	userId: string;
}): Promise<boolean> => {
	const [row] = await db
		.select({ campaignId: jobPromotionCampaign.id })
		.from(jobPromotionCampaign)
		.innerJoin(
			member,
			and(
				eq(member.organizationId, jobPromotionCampaign.organizationId),
				eq(member.userId, userId),
				inArray(member.role, [...ADVERTISER_MEMBER_ROLES])
			)
		)
		.where(
			and(
				eq(jobPromotionCampaign.status, "active"),
				lte(jobPromotionCampaign.startsAt, now),
				gt(jobPromotionCampaign.endsAt, now)
			)
		)
		.limit(1);

	return Boolean(row);
};

// 캠페인 상태가 바뀐 조직의 owner/admin 멤버들의 is_advertiser 캐시를 재계산해 동기화한다.
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
		const isAdvertiser = await hasActiveAdvertiserCampaign({ now, userId });
		await db
			.update(bambiProfile)
			.set({ isAdvertiser })
			.where(eq(bambiProfile.userId, userId));
	}
};
