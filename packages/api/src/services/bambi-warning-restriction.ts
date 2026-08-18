import { db } from "@bambi-app/db";
import { bambiProfile } from "@bambi-app/db/schema/bambi";
import { ORPCError } from "@orpc/server";
import { and, eq, gt, lte } from "drizzle-orm";

export const WARNING_RESTRICTION_THRESHOLD = 5;
export const WARNING_RESTRICTION_DURATION_MS = 72 * 60 * 60 * 1000;
export const WARNING_RESTRICTED_COMMUNITY_BOARDS = new Set([
	"free",
	"work_talk",
	"market",
]);

export const normalizeExpiredWarningRestriction = async (
	userId: string,
	now = new Date()
): Promise<void> => {
	await db
		.update(bambiProfile)
		.set({ status: "active", warningRestrictionUntil: null })
		.where(
			and(
				eq(bambiProfile.userId, userId),
				eq(bambiProfile.status, "warned"),
				lte(bambiProfile.warningRestrictionUntil, now)
			)
		);
};

export const normalizeAllExpiredWarningRestrictions = async (
	now = new Date()
): Promise<void> => {
	await db
		.update(bambiProfile)
		.set({ status: "active", warningRestrictionUntil: null })
		.where(
			and(
				eq(bambiProfile.status, "warned"),
				lte(bambiProfile.warningRestrictionUntil, now)
			)
		);
};

export const getActiveWarningRestrictionUntil = async (
	userId: string,
	now = new Date()
): Promise<Date | null> => {
	await normalizeExpiredWarningRestriction(userId, now);
	const [row] = await db
		.select({ warningRestrictionUntil: bambiProfile.warningRestrictionUntil })
		.from(bambiProfile)
		.where(
			and(
				eq(bambiProfile.userId, userId),
				gt(bambiProfile.warningRestrictionUntil, now)
			)
		)
		.limit(1);

	return row?.warningRestrictionUntil ?? null;
};

const throwRestriction = (message: string, until: Date): never => {
	throw new ORPCError("FORBIDDEN", {
		message: `${message}\n${until.toISOString()}`,
	});
};

export const assertCommunityWarningRestriction = async ({
	board,
	role,
	userId,
}: {
	board: string;
	role: string;
	userId: string;
}): Promise<void> => {
	if (
		role !== "job_seeker" ||
		!WARNING_RESTRICTED_COMMUNITY_BOARDS.has(board)
	) {
		return;
	}

	const until = await getActiveWarningRestrictionUntil(userId);
	if (until) {
		throwRestriction(
			"경고 5회 누적으로 글과 댓글을 작성하실 수 없습니다.",
			until
		);
	}
};

export const assertJobPostWarningRestriction = async ({
	role,
	userId,
}: {
	role: string;
	userId: string;
}): Promise<void> => {
	if (role !== "employer") {
		return;
	}

	const until = await getActiveWarningRestrictionUntil(userId);
	if (until) {
		throwRestriction("경고 5회 누적으로 공고를 작성하실 수 없습니다.", until);
	}
};
