import type { db } from "@bambi-app/db";
import {
	bambiPointTransaction,
	bambiSiteSettings,
} from "@bambi-app/db/schema/bambi";
import { eq, sql } from "drizzle-orm";

import { SITE_SETTINGS_ROW_ID } from "./bambi-point-settings";

export type PointTx = Parameters<Parameters<typeof db.transaction>[0]>[0];

export async function lockMemberPoints(
	tx: PointTx,
	userId: string
): Promise<void> {
	await tx.execute(
		sql`select pg_advisory_xact_lock(hashtextextended(${userId}, 0))`
	);
}

export async function getPointBalanceTx(
	tx: PointTx,
	userId: string
): Promise<number> {
	const [row] = await tx
		.select({
			balance: sql<number>`coalesce(sum(${bambiPointTransaction.amount}), 0)::int`,
		})
		.from(bambiPointTransaction)
		.where(eq(bambiPointTransaction.userId, userId));
	return row?.balance ?? 0;
}

async function getPointsCapTx(tx: PointTx): Promise<number | null> {
	const [row] = await tx
		.select({ cap: bambiSiteSettings.maxMemberPoints })
		.from(bambiSiteSettings)
		.where(eq(bambiSiteSettings.id, SITE_SETTINGS_ROW_ID))
		.limit(1);
	return row?.cap ?? null;
}

export async function awardMemberPoints(
	tx: PointTx,
	args: {
		actorUserId?: string;
		amount: number;
		description?: string;
		externalKey?: string;
		reason: string;
		userId: string;
	}
): Promise<{ awarded: number; balance: number; transactionId: null | string }> {
	await lockMemberPoints(tx, args.userId);
	const balance = await getPointBalanceTx(tx, args.userId);
	const cap = await getPointsCapTx(tx);
	const requested = Math.max(0, args.amount);
	const awarded =
		cap === null ? requested : Math.min(requested, Math.max(0, cap - balance));
	let transactionId: null | string = null;
	if (awarded > 0) {
		const [inserted] = await tx
			.insert(bambiPointTransaction)
			.values({
				actorUserId: args.actorUserId,
				amount: awarded,
				balanceAfter: balance + awarded,
				description: args.description,
				externalKey: args.externalKey,
				reason: args.reason,
				userId: args.userId,
			})
			.onConflictDoNothing({ target: bambiPointTransaction.externalKey })
			.returning({ id: bambiPointTransaction.id });
		transactionId = inserted?.id ?? null;
		if (!inserted) {
			return { awarded: 0, balance, transactionId: null };
		}
	}
	return { awarded, balance: balance + awarded, transactionId };
}

export async function adjustMemberPoints(
	tx: PointTx,
	args: {
		actorUserId?: string;
		amount: number;
		description?: string;
		externalKey?: string;
		reason: string;
		userId: string;
	}
): Promise<{ applied: number; balance: number; transactionId: null | string }> {
	if (args.amount >= 0) {
		const result = await awardMemberPoints(tx, args);
		return {
			applied: result.awarded,
			balance: result.balance,
			transactionId: result.transactionId,
		};
	}
	await lockMemberPoints(tx, args.userId);
	const balance = await getPointBalanceTx(tx, args.userId);
	if (balance + args.amount < 0) {
		throw new Error("잔액보다 많이 차감할 수 없습니다.");
	}
	const [inserted] = await tx
		.insert(bambiPointTransaction)
		.values({
			actorUserId: args.actorUserId,
			amount: args.amount,
			balanceAfter: balance + args.amount,
			description: args.description,
			externalKey: args.externalKey,
			reason: args.reason,
			userId: args.userId,
		})
		.returning({ id: bambiPointTransaction.id });
	return {
		applied: args.amount,
		balance: balance + args.amount,
		transactionId: inserted?.id ?? null,
	};
}
