import { db } from "@bambi-app/db";
import { user } from "@bambi-app/db/schema/auth";
import {
	bambiPointTransaction,
	bambiProfile,
	bambiSiteSettings,
	communityBoard,
} from "@bambi-app/db/schema/bambi";
import { ORPCError } from "@orpc/server";
import {
	and,
	count,
	desc,
	eq,
	ilike,
	inArray,
	isNull,
	like,
	lt,
	or,
	sql,
} from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import z from "zod";

import {
	adminProcedure,
	protectedProcedure,
	publicProcedure,
} from "../../index";
import { requireActiveBambiProfile } from "../../services/bambi-authz";
import {
	getPointBalances,
	loadGradeBadges,
} from "../../services/bambi-member-points";
import {
	getPointSettings,
	SITE_SETTINGS_ROW_ID,
} from "../../services/bambi-point-settings";

const nonnegativePoints = z.number().int().min(0).max(100_000_000);
const saveInput = z.object({
	attendancePoints: nonnegativePoints,
	jobPaymentMaxPoints: nonnegativePoints.nullable(),
	jobPaymentMinPoints: nonnegativePoints.nullable(),
	reviewViewPoints: nonnegativePoints,
	reviewWritePoints: nonnegativePoints,
	signupPoints: nonnegativePoints,
});
const saveBoardInput = z.object({
	commentPoints: nonnegativePoints,
	key: z.string().min(1),
	postPoints: nonnegativePoints.optional(),
});
const historyCursorInput = z.object({
	createdAt: z.string().datetime(),
	id: z.string().uuid(),
});
const getMineHistoryInput = z.object({
	cursor: historyCursorInput.optional(),
	limit: z.number().int().min(1).max(50).default(10),
});
const adminMembersInput = z.object({
	page: z.number().int().min(1).default(1),
	pageSize: z.number().int().min(1).max(50).default(10),
	role: z.enum(["job_seeker", "employer"]).optional(),
	search: z.string().trim().max(100).optional(),
});
const adminMemberInput = z.object({ userId: z.string().min(1) });
const adminMemberHistoryInput = adminMemberInput.extend({
	page: z.number().int().min(1).default(1),
	pageSize: z.number().int().min(1).max(50).default(10),
});

const pointReasonLabel = (reason: string): string => {
	if (reason === "attendance") {
		return "출석체크";
	}
	if (reason === "signup_bonus") {
		return "회원가입 포인트";
	}
	if (reason === "community_post") {
		return "게시판 글 작성";
	}
	if (reason === "community_post_revoke") {
		return "게시판 글 포인트 회수";
	}
	if (reason === "community_comment") {
		return "게시판 댓글 작성";
	}
	if (reason === "community_comment_revoke") {
		return "게시판 댓글 포인트 회수";
	}
	if (reason === "review_write") {
		return "후기 작성";
	}
	if (reason === "review_write_revoke") {
		return "후기 작성 포인트 회수";
	}
	if (reason === "review_view") {
		return "다른 구직자 후기 열람";
	}
	if (reason.startsWith("운영자 지급:")) {
		return reason;
	}
	if (reason.startsWith("운영자 차감:")) {
		return reason;
	}
	if (reason.startsWith("공고 등록 포인트 사용:")) {
		return "공고 등록 결제에 사용";
	}
	if (reason.startsWith("공고 취소 포인트 환급")) {
		return "공고 취소 포인트 환급";
	}
	return "포인트 조정";
};

const pointProcessorLabel = (
	actorUserId: null | string,
	actorName: null | string,
	reason: string
): string => {
	if (actorUserId) {
		return actorName ?? "처리자 기록 없음";
	}
	return reason.startsWith("운영자 ") ? "처리자 기록 없음" : "시스템";
};

export const pointSettingsRouter = {
	getPublicSignupBonus: publicProcedure.handler(async () => {
		const settings = await getPointSettings();
		return { signupPoints: settings.signupPoints };
	}),
	getAdmin: adminProcedure.handler(getPointSettings),
	getAdminMember: adminProcedure
		.input(adminMemberInput)
		.handler(async ({ input }) => {
			const pointBalanceSql = sql<number>`(
				select coalesce(sum(${bambiPointTransaction.amount}), 0)::int
				from ${bambiPointTransaction}
				where ${bambiPointTransaction.userId} = ${user.id}
			)`;
			const [member] = await db
				.select({
					createdAt: user.createdAt,
					email: user.email,
					isPhoneVerified: bambiProfile.isPhoneVerified,
					loginId: user.login_id,
					name: user.name,
					phoneNumber: bambiProfile.phoneNumber,
					pointBalance: pointBalanceSql,
					role: bambiProfile.role,
					status: bambiProfile.status,
					userId: user.id,
				})
				.from(user)
				.innerJoin(bambiProfile, eq(bambiProfile.userId, user.id))
				.where(
					and(
						eq(user.id, input.userId),
						inArray(bambiProfile.role, ["job_seeker", "employer"])
					)
				)
				.limit(1);
			if (!member) {
				throw new ORPCError("NOT_FOUND", {
					message: "대상 회원을 찾을 수 없습니다.",
				});
			}
			const usageFilter = and(
				eq(bambiPointTransaction.userId, input.userId),
				or(
					like(bambiPointTransaction.reason, "공고 등록 포인트 사용:%"),
					like(bambiPointTransaction.reason, "공고 취소 포인트 환급%")
				)
			);
			const [usageRows, [usageCount]] = await Promise.all([
				db
					.select({
						amount: bambiPointTransaction.amount,
						createdAt: bambiPointTransaction.createdAt,
						description: bambiPointTransaction.description,
						id: bambiPointTransaction.id,
						reason: bambiPointTransaction.reason,
					})
					.from(bambiPointTransaction)
					.where(usageFilter)
					.orderBy(
						desc(bambiPointTransaction.createdAt),
						desc(bambiPointTransaction.id)
					),
				db
					.select({ value: count() })
					.from(bambiPointTransaction)
					.where(usageFilter),
			]);
			return {
				...member,
				usageCount: usageCount?.value ?? 0,
				usageItems: usageRows.map(({ reason, ...item }) => ({
					...item,
					description: item.description ?? pointReasonLabel(reason),
				})),
			};
		}),
	listAdminMemberHistory: adminProcedure
		.input(adminMemberHistoryInput)
		.handler(async ({ input }) => {
			const actor = alias(user, "point_transaction_actor");
			const where = eq(bambiPointTransaction.userId, input.userId);
			const offset = (input.page - 1) * input.pageSize;
			const [rows, [totalRow]] = await Promise.all([
				db
					.select({
						actorName: actor.name,
						actorUserId: bambiPointTransaction.actorUserId,
						amount: bambiPointTransaction.amount,
						balanceAfter: sql<number>`coalesce(
							${bambiPointTransaction.balanceAfter},
							sum(${bambiPointTransaction.amount}) over (
								partition by ${bambiPointTransaction.userId}
								order by ${bambiPointTransaction.createdAt}, ${bambiPointTransaction.id}
								rows between unbounded preceding and current row
							)
						)::int`,
						createdAt: bambiPointTransaction.createdAt,
						description: bambiPointTransaction.description,
						id: bambiPointTransaction.id,
						reason: bambiPointTransaction.reason,
					})
					.from(bambiPointTransaction)
					.leftJoin(actor, eq(actor.id, bambiPointTransaction.actorUserId))
					.where(where)
					.orderBy(
						desc(bambiPointTransaction.createdAt),
						desc(bambiPointTransaction.id)
					)
					.limit(input.pageSize)
					.offset(offset),
				db.select({ value: count() }).from(bambiPointTransaction).where(where),
			]);
			return {
				items: rows.map(({ reason, ...item }) => ({
					...item,
					description: item.description ?? pointReasonLabel(reason),
					processor: pointProcessorLabel(
						item.actorUserId,
						item.actorName,
						reason
					),
				})),
				page: input.page,
				pageSize: input.pageSize,
				totalCount: totalRow?.value ?? 0,
			};
		}),
	listAdminMembers: adminProcedure
		.input(adminMembersInput)
		.handler(async ({ input }) => {
			const conditions = [
				inArray(bambiProfile.role, ["job_seeker", "employer"]),
				isNull(user.deletedAt),
			];
			if (input.role) {
				conditions.push(eq(bambiProfile.role, input.role));
			}
			if (input.search) {
				const pattern = `%${input.search}%`;
				conditions.push(
					or(ilike(user.name, pattern), ilike(user.login_id, pattern)) ??
						sql`false`
				);
			}
			const where = and(...conditions);
			const offset = (input.page - 1) * input.pageSize;
			const pointBalanceSql = sql<number>`(
				select coalesce(sum(${bambiPointTransaction.amount}), 0)::int
				from ${bambiPointTransaction}
				where ${bambiPointTransaction.userId} = ${user.id}
			)`;
			const [rows, [totalRow]] = await Promise.all([
				db
					.select({
						loginId: user.login_id,
						name: user.name,
						pointBalance: pointBalanceSql,
						role: bambiProfile.role,
						userId: user.id,
					})
					.from(user)
					.innerJoin(bambiProfile, eq(bambiProfile.userId, user.id))
					.where(where)
					.orderBy(desc(user.createdAt), desc(user.id))
					.limit(input.pageSize)
					.offset(offset),
				db
					.select({ value: count() })
					.from(user)
					.innerJoin(bambiProfile, eq(bambiProfile.userId, user.id))
					.where(where),
			]);
			const badges = await loadGradeBadges(rows.map((row) => row.userId));
			return {
				items: rows.map((row) => ({
					...row,
					grade: badges.get(row.userId) ?? null,
				})),
				page: input.page,
				pageSize: input.pageSize,
				totalCount: totalRow?.value ?? 0,
			};
		}),
	getJobPayment: protectedProcedure.handler(async ({ context }) => {
		const profile = await requireActiveBambiProfile(context.session);
		const settings = await getPointSettings();
		const balances = await getPointBalances([profile.userId]);
		return {
			balance: balances.get(profile.userId) ?? 0,
			jobPaymentMaxPoints: settings.jobPaymentMaxPoints,
			jobPaymentMinPoints: settings.jobPaymentMinPoints,
		};
	}),
	getMineHistory: protectedProcedure
		.input(getMineHistoryInput)
		.handler(async ({ context, input }) => {
			const profile = await requireActiveBambiProfile(context.session);
			if (!(profile.role === "job_seeker" || profile.role === "employer")) {
				throw new ORPCError("FORBIDDEN", {
					message: "구직자·구인자 회원만 포인트 내역을 확인할 수 있습니다.",
				});
			}
			const cursorCreatedAt = input.cursor
				? new Date(input.cursor.createdAt)
				: null;
			const olderThanCursor =
				cursorCreatedAt && input.cursor
					? or(
							lt(bambiPointTransaction.createdAt, cursorCreatedAt),
							and(
								eq(bambiPointTransaction.createdAt, cursorCreatedAt),
								lt(bambiPointTransaction.id, input.cursor.id)
							)
						)
					: undefined;

			const [balanceRow, rows] = await Promise.all([
				db
					.select({
						balance: sql<number>`coalesce(sum(${bambiPointTransaction.amount}), 0)::int`,
					})
					.from(bambiPointTransaction)
					.where(eq(bambiPointTransaction.userId, profile.userId)),
				db
					.select({
						amount: bambiPointTransaction.amount,
						createdAt: bambiPointTransaction.createdAt,
						description: bambiPointTransaction.description,
						id: bambiPointTransaction.id,
						reason: bambiPointTransaction.reason,
					})
					.from(bambiPointTransaction)
					.where(
						and(
							eq(bambiPointTransaction.userId, profile.userId),
							olderThanCursor
						)
					)
					.orderBy(
						desc(bambiPointTransaction.createdAt),
						desc(bambiPointTransaction.id)
					)
					.limit(input.limit + 1),
			]);
			const hasMore = rows.length > input.limit;
			const items = (hasMore ? rows.slice(0, input.limit) : rows).map(
				({ description, reason, ...row }) => ({
					...row,
					label: description ?? pointReasonLabel(reason),
				})
			);
			const last = items.at(-1);

			return {
				balance: balanceRow[0]?.balance ?? 0,
				items,
				nextCursor:
					hasMore && last
						? { createdAt: last.createdAt.toISOString(), id: last.id }
						: null,
			};
		}),
	saveBoard: adminProcedure.input(saveBoardInput).handler(async ({ input }) => {
		const [existing] = await db
			.select({ key: communityBoard.key })
			.from(communityBoard)
			.where(eq(communityBoard.key, input.key))
			.limit(1);
		if (!existing) {
			throw new ORPCError("NOT_FOUND", {
				message: "게시판을 찾을 수 없습니다.",
			});
		}
		const postPoints = input.key === "notice" ? 0 : input.postPoints;
		if (postPoints === undefined) {
			throw new ORPCError("BAD_REQUEST", {
				message: "글 작성 포인트를 입력해 주세요.",
			});
		}
		await db
			.update(communityBoard)
			.set({ commentPoints: input.commentPoints, postPoints })
			.where(eq(communityBoard.key, input.key));
		return { ...input, postPoints };
	}),
	saveAdmin: adminProcedure.input(saveInput).handler(async ({ input }) => {
		const normalizedMin = input.jobPaymentMinPoints || null;
		if (
			normalizedMin !== null &&
			input.jobPaymentMaxPoints !== null &&
			input.jobPaymentMaxPoints < normalizedMin
		) {
			throw new ORPCError("BAD_REQUEST", {
				message: "최대 사용 포인트는 최소 사용 포인트 이상이어야 합니다.",
			});
		}
		return await db.transaction(async (tx) => {
			await tx
				.insert(bambiSiteSettings)
				.values({
					attendancePoints: input.attendancePoints,
					id: SITE_SETTINGS_ROW_ID,
					jobPaymentMaxPoints: input.jobPaymentMaxPoints,
					jobPaymentMinPoints: normalizedMin,
					reviewViewPoints: input.reviewViewPoints,
					reviewWritePoints: input.reviewWritePoints,
					signupPoints: input.signupPoints,
				})
				.onConflictDoUpdate({
					set: {
						attendancePoints: input.attendancePoints,
						jobPaymentMaxPoints: input.jobPaymentMaxPoints,
						jobPaymentMinPoints: normalizedMin,
						reviewViewPoints: input.reviewViewPoints,
						reviewWritePoints: input.reviewWritePoints,
						signupPoints: input.signupPoints,
					},
					target: bambiSiteSettings.id,
				});
			return { ...input, jobPaymentMinPoints: normalizedMin };
		});
	}),
};
