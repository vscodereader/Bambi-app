import { db } from "@bambi-app/db";
import { bambiMemberGrade } from "@bambi-app/db/schema/bambi";
import { ORPCError } from "@orpc/server";
import { asc, eq, sql } from "drizzle-orm";
import z from "zod";

import { adminProcedure } from "../../index";
import { assertGradeDeletable } from "../../services/bambi-member-points";

const HEX_COLOR = /^#[0-9a-fA-F]{6}$/;

const createGradeInput = z.object({
	color: z.string().trim().regex(HEX_COLOR).nullable().optional(),
	minPoints: z.number().int().min(0).max(10_000_000),
	name: z.string().trim().min(1).max(20),
});

const updateGradeInput = createGradeInput.extend({ id: z.string().uuid() });

const gradeIdInput = z.object({ id: z.string().uuid() });

const DUP_MIN_POINTS = "이미 같은 기준 포인트의 등급이 있습니다.";

export const memberGradesRouter = {
	list: adminProcedure.handler(async () =>
		db.select().from(bambiMemberGrade).orderBy(asc(bambiMemberGrade.minPoints))
	),

	create: adminProcedure.input(createGradeInput).handler(async ({ input }) => {
		try {
			const [created] = await db
				.insert(bambiMemberGrade)
				.values({
					color: input.color ?? null,
					minPoints: input.minPoints,
					name: input.name,
				})
				.returning({ id: bambiMemberGrade.id });
			return created;
		} catch {
			// min_points UNIQUE 위반을 사용자 문구로 바꾼다.
			throw new ORPCError("CONFLICT", { message: DUP_MIN_POINTS });
		}
	}),

	update: adminProcedure.input(updateGradeInput).handler(async ({ input }) => {
		try {
			const [updated] = await db
				.update(bambiMemberGrade)
				.set({
					color: input.color ?? null,
					minPoints: input.minPoints,
					name: input.name,
				})
				.where(eq(bambiMemberGrade.id, input.id))
				.returning({ id: bambiMemberGrade.id });
			if (!updated) {
				throw new ORPCError("NOT_FOUND", {
					message: "등급을 찾을 수 없습니다.",
				});
			}
			return updated;
		} catch (error) {
			if (error instanceof ORPCError) {
				throw error;
			}
			throw new ORPCError("CONFLICT", { message: DUP_MIN_POINTS });
		}
	}),

	remove: adminProcedure.input(gradeIdInput).handler(async ({ input }) =>
		db.transaction(async (tx) => {
			const [grade] = await tx
				.select({ minPoints: bambiMemberGrade.minPoints })
				.from(bambiMemberGrade)
				.where(eq(bambiMemberGrade.id, input.id))
				.limit(1);
			if (!grade) {
				throw new ORPCError("NOT_FOUND", {
					message: "등급을 찾을 수 없습니다.",
				});
			}
			const [countRow] = await tx
				.select({ count: sql<number>`count(*)::int` })
				.from(bambiMemberGrade)
				.where(eq(bambiMemberGrade.minPoints, 0));
			if (!assertGradeDeletable(grade, countRow?.count ?? 0)) {
				throw new ORPCError("BAD_REQUEST", {
					message: "기본 등급(0포인트)은 최소 하나 남아 있어야 합니다.",
				});
			}
			await tx
				.delete(bambiMemberGrade)
				.where(eq(bambiMemberGrade.id, input.id));
			return { id: input.id };
		})
	),
};
