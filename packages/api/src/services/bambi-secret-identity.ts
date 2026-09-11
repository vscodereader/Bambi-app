import { randomUUID } from "node:crypto";

import { db } from "@bambi-app/db";
import {
	bambiIdentityVerificationLog,
	bambiProfile,
} from "@bambi-app/db/schema/bambi";
import { and, eq, isNotNull, sql } from "drizzle-orm";

import { isGuestIdentityFresh } from "./bambi-guest-token";

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
			gender: bambiProfile.gender,
			isPhoneVerified: bambiProfile.isPhoneVerified,
			phoneNumber: bambiProfile.phoneNumber,
		})
		.from(bambiProfile)
		.where(eq(bambiProfile.userId, userId))
		.limit(1);
	if (!(profile?.isPhoneVerified && profile.gender && profile.phoneNumber)) {
		return null;
	}
	return { gender: profile.gender, phoneNumber: profile.phoneNumber };
};

const guestIdentity = async (
	guestId: string,
	freshOnly: boolean,
	now = new Date()
) => {
	const conditions = [
		eq(bambiIdentityVerificationLog.guestId, guestId),
		completeIdentityWhere(),
	];
	const [row] = await db
		.select({
			birth8: bambiIdentityVerificationLog.birthDate,
			gender: bambiIdentityVerificationLog.gender,
			id: bambiIdentityVerificationLog.id,
			name: bambiIdentityVerificationLog.name,
			phoneNumber: bambiIdentityVerificationLog.phoneNumber,
			updatedAt: bambiIdentityVerificationLog.updatedAt,
		})
		.from(bambiIdentityVerificationLog)
		.where(and(...conditions))
		.limit(1);
	if (row && freshOnly && !isGuestIdentityFresh(row.updatedAt, now)) {
		return null;
	}
	return row ?? null;
};

export const hasMemberVerifiedIdentity = async (
	userId: string
): Promise<boolean> => Boolean(await memberIdentity(userId));

export const hasFreshGuestVerifiedIdentity = async (
	guestId: string
): Promise<boolean> => Boolean(await guestIdentity(guestId, true));

export const getFreshGuestVerifiedIdentity = async (
	guestId: string,
	now = new Date()
) => await guestIdentity(guestId, true, now);

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
	if (!(row?.gender && row.phoneNumber)) {
		return null;
	}
	return {
		gender: row.gender,
		phoneNumber: row.phoneNumber,
	};
};

export const recordMockIdentityLog = async (input: {
	birthDate: string;
	gender: "female" | "male";
	guestId?: string;
	kind: "admin" | "employer" | "guest" | "job_seeker" | "legal_advisor";
	name?: string;
	phoneNumber: string;
}): Promise<void> => {
	const values = {
		birthDate: input.birthDate,
		gender: input.gender,
		guestId: input.guestId,
		identityVerificationId: `mock-${randomUUID()}`,
		kind: input.kind,
		...(input.name ? { name: input.name } : {}),
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
