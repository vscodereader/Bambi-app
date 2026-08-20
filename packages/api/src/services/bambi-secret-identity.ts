import { randomUUID } from "node:crypto";

import { db } from "@bambi-app/db";
import {
	bambiIdentityVerificationLog,
	bambiProfile,
} from "@bambi-app/db/schema/bambi";
import { and, desc, eq, gt, isNotNull, sql } from "drizzle-orm";

const GUEST_IDENTITY_RETENTION_DAYS = 30;
const DAY_MS = 24 * 60 * 60 * 1000;

const completeIdentityWhere = () =>
	and(
		isNotNull(bambiIdentityVerificationLog.name),
		isNotNull(bambiIdentityVerificationLog.phoneNumber),
		isNotNull(bambiIdentityVerificationLog.gender)
	);

export const linkGuestIdentityLog = async (
	guestId: string,
	identityVerificationId: string
): Promise<void> => {
	await db
		.update(bambiIdentityVerificationLog)
		.set({ guestId, kind: "guest", updatedAt: new Date() })
		.where(
			eq(
				bambiIdentityVerificationLog.identityVerificationId,
				identityVerificationId
			)
		);
};

const memberIdentity = async (userId: string) => {
	const [profile] = await db
		.select({
			birthDate: bambiProfile.birthDate,
			phoneNumber: bambiProfile.phoneNumber,
		})
		.from(bambiProfile)
		.where(eq(bambiProfile.userId, userId))
		.limit(1);
	if (!(profile?.birthDate && profile.phoneNumber)) {
		return null;
	}
	const [row] = await db
		.select({
			gender: bambiIdentityVerificationLog.gender,
			name: bambiIdentityVerificationLog.name,
			phoneNumber: bambiIdentityVerificationLog.phoneNumber,
		})
		.from(bambiIdentityVerificationLog)
		.where(
			and(
				eq(bambiIdentityVerificationLog.birthDate, profile.birthDate),
				eq(bambiIdentityVerificationLog.phoneNumber, profile.phoneNumber),
				completeIdentityWhere()
			)
		)
		.orderBy(desc(bambiIdentityVerificationLog.updatedAt))
		.limit(1);
	return row ?? null;
};

const guestIdentity = async (guestId: string, freshOnly: boolean) => {
	const conditions = [
		eq(bambiIdentityVerificationLog.guestId, guestId),
		completeIdentityWhere(),
	];
	if (freshOnly) {
		conditions.push(
			gt(
				bambiIdentityVerificationLog.updatedAt,
				new Date(Date.now() - GUEST_IDENTITY_RETENTION_DAYS * DAY_MS)
			)
		);
	}
	const [row] = await db
		.select({
			gender: bambiIdentityVerificationLog.gender,
			name: bambiIdentityVerificationLog.name,
			phoneNumber: bambiIdentityVerificationLog.phoneNumber,
		})
		.from(bambiIdentityVerificationLog)
		.where(and(...conditions))
		.limit(1);
	return row ?? null;
};

export const hasMemberVerifiedIdentity = async (
	userId: string
): Promise<boolean> => Boolean(await memberIdentity(userId));

export const hasFreshGuestVerifiedIdentity = async (
	guestId: string
): Promise<boolean> => Boolean(await guestIdentity(guestId, true));

const ownerIdentity = async (owner: {
	guestId?: string | null;
	userId?: string | null;
}) => {
	if (owner.userId) {
		return await memberIdentity(owner.userId);
	}
	if (owner.guestId) {
		return await guestIdentity(owner.guestId, false);
	}
	return null;
};

export const getVerifiedIdentityForAdmin = async (owner: {
	guestId?: string | null;
	userId?: string | null;
}) => {
	const row = await ownerIdentity(owner);
	if (!(row?.gender && row.name && row.phoneNumber)) {
		return null;
	}
	return {
		gender: row.gender,
		phoneNumber: row.phoneNumber,
		realName: row.name,
	};
};

export const recordMockIdentityLog = async (input: {
	birthDate: string;
	gender: "female" | "male";
	guestId?: string;
	kind: "admin" | "employer" | "guest" | "job_seeker" | "legal_advisor";
	name: string;
	phoneNumber: string;
}): Promise<void> => {
	const values = {
		birthDate: input.birthDate,
		gender: input.gender,
		guestId: input.guestId,
		identityVerificationId: `mock-${randomUUID()}`,
		kind: input.kind,
		name: input.name,
		phoneNumber: input.phoneNumber,
	};
	await db
		.insert(bambiIdentityVerificationLog)
		.values(values)
		.onConflictDoUpdate({
			set: { ...values, updatedAt: new Date() },
			target: [
				bambiIdentityVerificationLog.birthDate,
				bambiIdentityVerificationLog.phoneNumber,
			],
			targetWhere: sql`${bambiIdentityVerificationLog.phoneNumber} IS NOT NULL`,
		});
};
