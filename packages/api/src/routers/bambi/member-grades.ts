import { db } from "@bambi-app/db";
import {
	bambiMemberGrade,
	bambiSiteSettings,
} from "@bambi-app/db/schema/bambi";
import { ORPCError } from "@orpc/server";
import { asc, desc, eq, sql } from "drizzle-orm";
import z from "zod";

import { adminProcedure } from "../../index";
import {
	assertGradeDeletable,
	getMemberPointsCap,
	isPointsCapAllowed,
} from "../../services/bambi-member-points";

const HEX_COLOR = /^#[0-9a-fA-F]{6}$/;
// site_settings 단일 행 고정 키(site-settings.ts SETTINGS_ROW_ID와 같은 값).
const SITE_SETTINGS_ROW_ID = "default";
// 회원 누적 포인트 상한 입력 한계. 등급 기준 포인트 상한(10,000,000)보다 넉넉히 크게 둔다.
const POINTS_CAP_MAX = 100_000_000;

const pointsCapInput = z.object({
	// null이면 상한 없음(무제한 적립)으로 저장한다.
	maxPoints: z
		.number()
		.int("상한은 정수로 입력해 주세요.")
		.min(0, "상한은 0 이상으로 입력해 주세요.")
		.max(POINTS_CAP_MAX, "상한이 너무 큽니다. 자릿수를 확인해 주세요.")
		.nullable(),
});

const createGradeInput = z.object({
	color: z.string().trim().regex(HEX_COLOR).nullable().optional(),
	minPoints: z.number().int().min(0).max(10_000_000),
	name: z.string().trim().min(1).max(20),
});

const updateGradeInput = createGradeInput.extend({ id: z.string().uuid() });

const gradeIdInput = z.object({ id: z.string().uuid() });

const DUP_MIN_POINTS = "이미 같은 기준 포인트의 등급이 있습니다.";

export const memberGradesRouter = {
	// 회원 누적 포인트 상한 조회. null이면 상한 없음(무제한).
	getPointsCap: adminProcedure.handler(async () => ({
		maxPoints: await getMemberPointsCap(),
	})),

	// 회원 누적 포인트 상한 저장(운영자). 최고 등급 기준 포인트보다 낮으면 그 등급이 도달
	// 불가가 되므로 거부한다. null은 상한 해제(무제한 적립).
	updatePointsCap: adminProcedure
		.input(pointsCapInput)
		.handler(async ({ input }) => {
			const [top] = await db
				.select({ minPoints: bambiMemberGrade.minPoints })
				.from(bambiMemberGrade)
				.orderBy(desc(bambiMemberGrade.minPoints))
				.limit(1);
			const topMinPoints = top?.minPoints ?? 0;
			if (!isPointsCapAllowed(input.maxPoints, topMinPoints)) {
				throw new ORPCError("BAD_REQUEST", {
					message: `상한은 최고 등급 기준 포인트(${topMinPoints.toLocaleString("ko-KR")}P) 이상이어야 합니다.`,
				});
			}
			await db
				.insert(bambiSiteSettings)
				.values({
					id: SITE_SETTINGS_ROW_ID,
					maxMemberPoints: input.maxPoints,
				})
				.onConflictDoUpdate({
					target: bambiSiteSettings.id,
					set: { maxMemberPoints: input.maxPoints },
				});
			return { maxPoints: input.maxPoints };
		}),

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
