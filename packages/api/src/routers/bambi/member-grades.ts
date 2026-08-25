import { db } from "@bambi-app/db";
import {
	bambiCommentMilestone,
	bambiCommentMilestoneAward,
	bambiMemberGrade,
	bambiSiteSettings,
	communityComment,
} from "@bambi-app/db/schema/bambi";
import { ORPCError } from "@orpc/server";
import { asc, count, desc, eq, sql } from "drizzle-orm";
import z from "zod";

import { adminProcedure } from "../../index";
import {
	assertGradeDeletable,
	getMemberPointsCap,
	isPointsCapAllowed,
} from "../../services/bambi-member-points";
import {
	createGradeIconUploadIntent,
	deleteGradeIconObject,
	isOwnedGradeIconKey,
	resolveGradeIconUrl,
} from "../../services/bambi-storage";

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

const updateGradeWithIconInput = updateGradeInput.extend({
	iconStorageKey: z.string().min(1).max(512).nullable().optional(),
});

const createIconUploadInput = z.object({
	byteSize: z
		.number()
		.int()
		.positive()
		.max(2 * 1024 * 1024),
	fileName: z.string().trim().min(1).max(160),
	gradeId: z.string().uuid(),
	mimeType: z.literal("image/gif"),
});

const gradeIdInput = z.object({ id: z.string().uuid() });

const DUP_MIN_POINTS = "이미 같은 기준 포인트의 등급이 있습니다.";

// 댓글 마일스톤 — 누적 댓글 회차에 도달하면 1회성 보너스 포인트를 지급한다. comment_count는
// unique라 같은 회차를 두 벌 만들 수 없다(위반 시 사용자 문구로 바꿔 던진다).
const MILESTONE_COUNT_MAX = 1_000_000;
const MILESTONE_BONUS_MAX = 1_000_000;
const createMilestoneInput = z.object({
	bonusPoints: z
		.number()
		.int("보너스 포인트는 정수로 입력해 주세요.")
		.min(1, "보너스 포인트는 1 이상으로 입력해 주세요.")
		.max(
			MILESTONE_BONUS_MAX,
			"보너스 포인트가 너무 큽니다. 자릿수를 확인해 주세요."
		),
	commentCount: z
		.number()
		.int("댓글 회차는 정수로 입력해 주세요.")
		.min(1, "댓글 회차는 1 이상으로 입력해 주세요.")
		.max(
			MILESTONE_COUNT_MAX,
			"댓글 회차가 너무 큽니다. 자릿수를 확인해 주세요."
		),
});
const updateMilestoneInput = createMilestoneInput.extend({
	id: z.string().uuid(),
});
const milestoneIdInput = z.object({ id: z.string().uuid() });
const DUP_MILESTONE = "이미 같은 댓글 회차의 마일스톤이 있습니다.";

// 댓글 마일스톤 CRUD. 등급 라우터 안에 두어 index.ts를 건드리지 않는다 — 운영자 UI는
// memberGrades.commentMilestones.* 로 접근한다. 삭제는 자유이며 지급 기록(award)은
// FK cascade가 함께 지운다.
const commentMilestonesRouter = {
	// 전역 선착 모델이라 달성 상태를 함께 내린다: award 유무(당첨 완료)와 현재 사이트 전체 댓글 수
	// (회차와 비교해 대기/지나감 판정). award는 마일스톤당 1행(unique)이라 조인이 안 불린다.
	list: adminProcedure.handler(async () => {
		const [milestones, [totalRow]] = await Promise.all([
			db
				.select({
					id: bambiCommentMilestone.id,
					commentCount: bambiCommentMilestone.commentCount,
					bonusPoints: bambiCommentMilestone.bonusPoints,
					createdAt: bambiCommentMilestone.createdAt,
					awarded: sql<boolean>`${bambiCommentMilestoneAward.id} is not null`,
				})
				.from(bambiCommentMilestone)
				.leftJoin(
					bambiCommentMilestoneAward,
					eq(bambiCommentMilestoneAward.milestoneId, bambiCommentMilestone.id)
				)
				.orderBy(asc(bambiCommentMilestone.commentCount)),
			db.select({ value: count() }).from(communityComment),
		]);
		return { milestones, totalCommentCount: totalRow?.value ?? 0 };
	}),

	create: adminProcedure
		.input(createMilestoneInput)
		.handler(async ({ input }) => {
			try {
				const [created] = await db
					.insert(bambiCommentMilestone)
					.values({
						bonusPoints: input.bonusPoints,
						commentCount: input.commentCount,
					})
					.returning({ id: bambiCommentMilestone.id });
				return created;
			} catch {
				// comment_count UNIQUE 위반을 사용자 문구로 바꾼다.
				throw new ORPCError("CONFLICT", { message: DUP_MILESTONE });
			}
		}),

	update: adminProcedure
		.input(updateMilestoneInput)
		.handler(async ({ input }) => {
			try {
				const [updated] = await db
					.update(bambiCommentMilestone)
					.set({
						bonusPoints: input.bonusPoints,
						commentCount: input.commentCount,
					})
					.where(eq(bambiCommentMilestone.id, input.id))
					.returning({ id: bambiCommentMilestone.id });
				if (!updated) {
					throw new ORPCError("NOT_FOUND", {
						message: "마일스톤을 찾을 수 없습니다.",
					});
				}
				return updated;
			} catch (error) {
				if (error instanceof ORPCError) {
					throw error;
				}
				throw new ORPCError("CONFLICT", { message: DUP_MILESTONE });
			}
		}),

	remove: adminProcedure.input(milestoneIdInput).handler(async ({ input }) => {
		await db
			.delete(bambiCommentMilestone)
			.where(eq(bambiCommentMilestone.id, input.id));
		return { id: input.id };
	}),
};

export const memberGradesRouter = {
	// 댓글 마일스톤 CRUD(운영자). 등급과 같은 화면에서 관리한다.
	commentMilestones: commentMilestonesRouter,

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

	list: adminProcedure.handler(async () => {
		const rows = await db
			.select()
			.from(bambiMemberGrade)
			.orderBy(asc(bambiMemberGrade.minPoints));
		return rows.map((row) => ({
			...row,
			iconUrl: resolveGradeIconUrl(row.iconStorageKey),
		}));
	}),

	createIconUpload: adminProcedure
		.input(createIconUploadInput)
		.handler(async ({ input }) => {
			const [grade] = await db
				.select({ id: bambiMemberGrade.id })
				.from(bambiMemberGrade)
				.where(eq(bambiMemberGrade.id, input.gradeId))
				.limit(1);
			if (!grade) {
				throw new ORPCError("NOT_FOUND", {
					message: "등급을 찾을 수 없습니다.",
				});
			}
			return await createGradeIconUploadIntent(input);
		}),

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

	update: adminProcedure
		.input(updateGradeWithIconInput)
		.handler(async ({ input }) => {
			try {
				if (
					input.iconStorageKey &&
					!input.iconStorageKey.startsWith("builtin/") &&
					!isOwnedGradeIconKey({
						gradeId: input.id,
						storageKey: input.iconStorageKey,
					})
				) {
					throw new ORPCError("FORBIDDEN", {
						message: "이 등급에 업로드한 GIF만 사용할 수 있습니다.",
					});
				}
				const [existing] = await db
					.select({ iconStorageKey: bambiMemberGrade.iconStorageKey })
					.from(bambiMemberGrade)
					.where(eq(bambiMemberGrade.id, input.id))
					.limit(1);
				const [updated] = await db
					.update(bambiMemberGrade)
					.set({
						color: input.color ?? null,
						minPoints: input.minPoints,
						name: input.name,
						iconStorageKey: input.iconStorageKey,
					})
					.where(eq(bambiMemberGrade.id, input.id))
					.returning({ id: bambiMemberGrade.id });
				if (!updated) {
					throw new ORPCError("NOT_FOUND", {
						message: "등급을 찾을 수 없습니다.",
					});
				}
				if (
					input.iconStorageKey !== undefined &&
					existing?.iconStorageKey &&
					existing.iconStorageKey !== input.iconStorageKey
				) {
					await deleteGradeIconObject(existing.iconStorageKey);
				}
				return updated;
			} catch (error) {
				if (error instanceof ORPCError) {
					throw error;
				}
				throw new ORPCError("CONFLICT", { message: DUP_MIN_POINTS });
			}
		}),

	remove: adminProcedure.input(gradeIdInput).handler(async ({ input }) => {
		const removedIcon = await db.transaction(async (tx) => {
			const [grade] = await tx
				.select({
					iconStorageKey: bambiMemberGrade.iconStorageKey,
					minPoints: bambiMemberGrade.minPoints,
				})
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
			return grade.iconStorageKey;
		});
		await deleteGradeIconObject(removedIcon);
		return { id: input.id };
	}),
};
