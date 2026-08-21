import {
	type bambiMemberItemReason,
	bambiMemberItemTransaction,
	type bambiMemberItemType,
} from "@bambi-app/db/schema/bambi";
import { and, eq, sql } from "drizzle-orm";

import type { PointTx } from "./bambi-point-ledger";

export type MemberItemType = (typeof bambiMemberItemType.enumValues)[number];
export type MemberItemReason =
	(typeof bambiMemberItemReason.enumValues)[number];

const MEMBER_ITEM_LOCK_NAMESPACE = 918_273_649;

export async function lockMemberItem(
	tx: PointTx,
	userId: string,
	itemType: MemberItemType
): Promise<void> {
	await tx.execute(
		sql`select pg_advisory_xact_lock(${MEMBER_ITEM_LOCK_NAMESPACE}, hashtext(${`${userId}:${itemType}`}))`
	);
}

export async function getMemberItemBalanceTx(
	tx: PointTx,
	userId: string,
	itemType: MemberItemType
): Promise<number> {
	const [row] = await tx
		.select({
			balance: sql<number>`coalesce(sum(${bambiMemberItemTransaction.quantity}), 0)::int`,
		})
		.from(bambiMemberItemTransaction)
		.where(
			and(
				eq(bambiMemberItemTransaction.userId, userId),
				eq(bambiMemberItemTransaction.itemType, itemType)
			)
		);
	return row?.balance ?? 0;
}

export async function adjustMemberItem(
	tx: PointTx,
	args: {
		description?: string;
		externalKey: string;
		itemType: MemberItemType;
		pointShopOrderId?: string;
		quantity: number;
		reason: MemberItemReason;
		referenceId?: string;
		referenceType?: string;
		userId: string;
	}
): Promise<{
	applied: number;
	balance: number;
	transactionId: string;
}> {
	if (!Number.isInteger(args.quantity) || args.quantity === 0) {
		throw new Error("아이템 변경 수량은 0이 아닌 정수여야 합니다.");
	}
	await lockMemberItem(tx, args.userId, args.itemType);
	const [existing] = await tx
		.select({
			balance: bambiMemberItemTransaction.balanceAfter,
			id: bambiMemberItemTransaction.id,
			quantity: bambiMemberItemTransaction.quantity,
		})
		.from(bambiMemberItemTransaction)
		.where(eq(bambiMemberItemTransaction.externalKey, args.externalKey))
		.limit(1);
	if (existing) {
		return {
			applied: existing.quantity,
			balance: existing.balance,
			transactionId: existing.id,
		};
	}

	const balance = await getMemberItemBalanceTx(tx, args.userId, args.itemType);
	const nextBalance = balance + args.quantity;
	if (nextBalance < 0) {
		throw new Error("보유한 아이템 수량이 부족합니다.");
	}
	const [inserted] = await tx
		.insert(bambiMemberItemTransaction)
		.values({
			balanceAfter: nextBalance,
			description: args.description,
			externalKey: args.externalKey,
			itemType: args.itemType,
			pointShopOrderId: args.pointShopOrderId,
			quantity: args.quantity,
			reason: args.reason,
			referenceId: args.referenceId,
			referenceType: args.referenceType,
			userId: args.userId,
		})
		.returning({ id: bambiMemberItemTransaction.id });
	if (!inserted) {
		throw new Error("아이템 이력을 저장하지 못했습니다.");
	}
	return {
		applied: args.quantity,
		balance: nextBalance,
		transactionId: inserted.id,
	};
}
