import {
	bambiAttendance,
	bambiAttendanceStreakClaim,
} from "@bambi-app/db/schema/bambi";
import { and, asc, eq, gte, lte, sql } from "drizzle-orm";

import { resolveAttendanceRewardRun } from "./bambi-attendance";
import {
	adjustMemberItem,
	getMemberItemBalanceTx,
	lockMemberItem,
} from "./bambi-member-items";
import type { PointTx } from "./bambi-point-ledger";

export async function reconcileAttendanceDrawTicket(
	tx: PointTx,
	args: { triggerAttendedOn: string; userId: string }
): Promise<{
	awarded: boolean;
	balance: number;
	transactionId: null | string;
}> {
	await lockMemberItem(tx, args.userId, "draw_ticket");
	const rows = await tx
		.select({ attendedOn: bambiAttendance.attendedOn })
		.from(bambiAttendance)
		.where(eq(bambiAttendance.userId, args.userId))
		.orderBy(asc(bambiAttendance.attendedOn));
	const run = resolveAttendanceRewardRun(
		rows.map((row) => row.attendedOn),
		args.triggerAttendedOn
	);
	if (!run || run.entitledClaims === 0) {
		return {
			awarded: false,
			balance: await getMemberItemBalanceTx(tx, args.userId, "draw_ticket"),
			transactionId: null,
		};
	}
	const [claimCountRow] = await tx
		.select({ count: sql<number>`count(*)::int` })
		.from(bambiAttendanceStreakClaim)
		.where(
			and(
				eq(bambiAttendanceStreakClaim.userId, args.userId),
				gte(bambiAttendanceStreakClaim.runStartOn, run.startOn),
				lte(bambiAttendanceStreakClaim.runEndOn, run.endOn)
			)
		);
	if ((claimCountRow?.count ?? 0) >= run.entitledClaims) {
		return {
			awarded: false,
			balance: await getMemberItemBalanceTx(tx, args.userId, "draw_ticket"),
			transactionId: null,
		};
	}
	const itemResult = await adjustMemberItem(tx, {
		description: "7일 연속 출석 보상",
		externalKey: `attendance_streak:${args.userId}:${args.triggerAttendedOn}`,
		itemType: "draw_ticket",
		quantity: 1,
		reason: "attendance_streak",
		referenceId: args.triggerAttendedOn,
		referenceType: "attendance_streak_claim",
		userId: args.userId,
	});
	await tx.insert(bambiAttendanceStreakClaim).values({
		itemTransactionId: itemResult.transactionId,
		runEndOn: run.endOn,
		runStartOn: run.startOn,
		triggerAttendedOn: args.triggerAttendedOn,
		userId: args.userId,
	});
	return {
		awarded: true,
		balance: itemResult.balance,
		transactionId: itemResult.transactionId,
	};
}
