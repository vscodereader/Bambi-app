import { db } from "@bambi-app/db";
import { user } from "@bambi-app/db/schema/auth";
import {
	adminModerationAction,
	bambiAttendance,
	bambiMemberGrade,
	bambiPointTransaction,
	bambiProfile,
	bambiSiteSettings,
} from "@bambi-app/db/schema/bambi";
import { ORPCError } from "@orpc/server";
import {
	and,
	asc,
	desc,
	eq,
	ilike,
	inArray,
	isNull,
	or,
	sql,
} from "drizzle-orm";
import z from "zod";

import { adminProcedure, protectedProcedure } from "../../index";
import {
	countAttendanceStreak,
	getKstDateString,
} from "../../services/bambi-attendance";
import {
	type BambiAccessProfile,
	requireActiveBambiProfile,
	type SessionLike,
} from "../../services/bambi-authz";
import {
	MEMBER_GRADE_ANCHOR_ACTION,
	MEMBER_GRADE_CHANGE_REASON_MAX_LENGTH,
} from "../../services/bambi-member-grade-policy";
import {
	gradeBasisPointsSql,
	loadGradeBadges,
	nextGrade,
	resolveEffectiveGradeBasis,
	resolveGrade,
} from "../../services/bambi-member-points";
import { notifyBambiNotification } from "../../services/bambi-notifications";
import {
	adjustMemberPoints,
	awardMemberPoints,
} from "../../services/bambi-point-ledger";
import { SITE_SETTINGS_ROW_ID } from "../../services/bambi-point-settings";
import { acquirePointShopUserLock } from "../../services/bambi-point-shop";
import { resolveGradeIconUrl } from "../../services/bambi-storage";
import { isUserOnline } from "../../services/bambi-user-presence";
import { getUserOfflineAfterMinutes } from "../../services/bambi-user-presence-db";

// 출석 대상 역할. 운영자·법률자문·게스트는 출석 대상이 아니다. 허용 목록으로 고정해
// bambi_user_role에 값이 하나 늘어도 기본 판정이 "거부"가 되게 한다(bambi-authz 관례).
const ATTENDANCE_ROLES = new Set<string>(["job_seeker", "employer"]);

// 잔액은 원장 합산이다(잔액 컬럼 없음). 행이 없으면 0.
const pointBalanceSql = sql<number>`coalesce(sum(${bambiPointTransaction.amount}), 0)::int`;

const getMineInput = z.object({
	// YYYY-MM. 생략하면 서버 KST 기준 이번 달.
	month: z
		.string()
		.regex(/^\d{4}-\d{2}$/)
		.optional(),
});

const adminListInput = z.object({
	// 오프셋 커서. 정렬 축이 전부 집계 파생값이라 keyset 커서는 컬럼별 tie-break를 네 벌
	// 만들어야 한다 — 운영자 전용 화면이고 대상 계정도 수천 단위라 오프셋으로 끊는다.
	// ponytail: 오프셋 페이지네이션, 대상 계정이 수만 단위가 되면 keyset으로 교체.
	cursor: z.number().int().min(0).default(0),
	limit: z.number().int().min(1).max(100).default(20),
	role: z.enum(["job_seeker", "employer"]).optional(),
	search: z.string().trim().max(100).optional(),
	// recent=마지막 출석 최신순, idle=오래 안 온 순, total=총 출석일, month=이번 달 출석일
	sort: z.enum(["recent", "idle", "total", "month"]).default("recent"),
});

const adminAdjustPointsInput = z.object({
	// 0은 원장에 의미 없는 행만 남긴다. 한 번에 움직일 수 있는 폭은 오타 방어로 10만까지.
	amount: z
		.number()
		.int()
		.min(-100_000)
		.max(100_000)
		.refine((value) => value !== 0, {
			message: "0 포인트는 조정할 수 없습니다.",
		}),
	reason: z.string().trim().min(1).max(MEMBER_GRADE_CHANGE_REASON_MAX_LENGTH),
	userId: z.string().min(1),
});

const adminSetGradeAnchorInput = z.object({
	gradeId: z.string().uuid(),
	reason: z.string().trim().min(1).max(200),
	userId: z.string().min(1),
});

const requireAttendanceProfile = async (
	session: SessionLike | null | undefined
): Promise<BambiAccessProfile> => {
	const profile = await requireActiveBambiProfile(session);

	if (!ATTENDANCE_ROLES.has(profile.role)) {
		throw new ORPCError("FORBIDDEN", {
			message: "출석체크는 구직자·업소 회원만 이용할 수 있어요.",
		});
	}

	return profile;
};

export const attendanceRouter = {
	adminSetGradeAnchor: adminProcedure
		.input(adminSetGradeAnchorInput)
		.handler(async ({ context, input }) =>
			db.transaction(async (tx) => {
				const [target] = await tx
					.select({
						deletedAt: user.deletedAt,
						previousGradeId: bambiProfile.gradeAnchorGradeId,
						role: bambiProfile.role,
					})
					.from(user)
					.innerJoin(bambiProfile, eq(bambiProfile.userId, user.id))
					.where(eq(user.id, input.userId))
					.limit(1);
				if (!target || target.deletedAt) {
					throw new ORPCError("NOT_FOUND", {
						message: "등급을 변경할 회원을 찾을 수 없습니다.",
					});
				}
				if (!ATTENDANCE_ROLES.has(target.role)) {
					throw new ORPCError("FORBIDDEN", {
						message: "구직자·구인자 등급만 변경할 수 있습니다.",
					});
				}
				const [grade] = await tx
					.select({
						id: bambiMemberGrade.id,
						minPoints: bambiMemberGrade.minPoints,
						name: bambiMemberGrade.name,
					})
					.from(bambiMemberGrade)
					.where(eq(bambiMemberGrade.id, input.gradeId))
					.limit(1);
				if (!grade) {
					throw new ORPCError("NOT_FOUND", {
						message: "변경할 등급을 찾을 수 없습니다.",
					});
				}
				const [basis] = await tx
					.select({ gradeBasis: gradeBasisPointsSql })
					.from(bambiPointTransaction)
					.where(eq(bambiPointTransaction.userId, input.userId));
				const currentBasis = basis?.gradeBasis ?? 0;
				const changedAt = new Date();
				await tx
					.update(bambiProfile)
					.set({
						gradeAnchorBasisPoints: currentBasis,
						gradeAnchorGradeId: grade.id,
						gradeAnchorSetAt: changedAt,
						gradeAnchorStartPoints: grade.minPoints,
					})
					.where(eq(bambiProfile.userId, input.userId));
				await tx.insert(adminModerationAction).values({
					action: MEMBER_GRADE_ANCHOR_ACTION,
					adminUserId: context.session.user.id,
					metadata: {
						basisPoints: currentBasis,
						gradeId: grade.id,
						gradeName: grade.name,
						previousGradeId: target.previousGradeId,
						startPoints: grade.minPoints,
					},
					reason: input.reason,
					targetId: input.userId,
					targetType: "user",
				});
				return {
					basisPoints: currentBasis,
					changedAt,
					gradeId: grade.id,
					gradeName: grade.name,
					startPoints: grade.minPoints,
				};
			})
		),

	adminAdjustPoints: adminProcedure
		.input(adminAdjustPointsInput)
		.handler(async ({ context, input }) => {
			const [target] = await db
				.select({ deletedAt: user.deletedAt, role: bambiProfile.role })
				.from(user)
				.innerJoin(bambiProfile, eq(bambiProfile.userId, user.id))
				.where(eq(user.id, input.userId))
				.limit(1);

			if (!target || target.deletedAt) {
				throw new ORPCError("NOT_FOUND", {
					message: "대상 회원을 찾을 수 없습니다.",
				});
			}
			if (!ATTENDANCE_ROLES.has(target.role)) {
				throw new ORPCError("BAD_REQUEST", {
					message: "구직자·업소 회원에게만 포인트를 조정할 수 있습니다.",
				});
			}

			const result = await db.transaction(async (tx) => {
				// 원장 adjustMemberPoints는 자체 lockMemberPoints(hashtextextended 기반 bigint
				// 네임스페이스)로 적립·차감을 직렬화하고 잔액 음수를 막는다. 하지만 포인트몰 구매의
				// 자동 차감은 별도 네임스페이스 락(acquirePointShopUserLock)을 써서, 이 락 없이는
				// 운영자 차감과 구매 차감이 서로 잔액을 못 보고 음수로 빠진다. 그래서 원장 호출 전에
				// 포인트몰과 같은 계정 단위 advisory lock에도 참여해 두 경로를 직렬화한다
				// (bambi-point-shop.purchase와 같은 네임스페이스 키).
				await acquirePointShopUserLock(tx, input.userId);
				try {
					const adjustmentLabel =
						input.amount > 0 ? "운영자 지급" : "운영자 차감";
					const adjusted = await adjustMemberPoints(tx, {
						actorUserId: context.session.user.id,
						amount: input.amount,
						description: `${adjustmentLabel}: ${input.reason}`,
						reason: `${adjustmentLabel}: ${input.reason}`,
						userId: input.userId,
					});
					return {
						applied: adjusted.applied,
						pointBalance: adjusted.balance,
						transactionId: adjusted.transactionId,
						userId: input.userId,
					};
				} catch (error) {
					throw new ORPCError("BAD_REQUEST", {
						message:
							error instanceof Error
								? error.message
								: "포인트를 조정하지 못했습니다.",
					});
				}
			});
			if (result.applied > 0 && result.transactionId) {
				await notifyBambiNotification({
					actorUserId: context.session.user.id,
					metadata: { action: "admin_awarded", amount: result.applied },
					recipientUserId: input.userId,
					targetId: result.transactionId,
					targetType: "point_transaction",
				});
			}
			return result;
		}),

	adminList: adminProcedure.input(adminListInput).handler(async ({ input }) => {
		const today = getKstDateString();
		const offlineAfterMinutes = await getUserOfflineAfterMinutes();
		const monthStart = `${today.slice(0, 7)}-01`;

		// 집계는 전부 상관 서브쿼리로 뽑는다 — 조인으로 붙이면 출석일 수만큼 user row가
		// 뻥튀기돼 검색·정렬·페이지네이션이 전부 어긋난다(moderation.listUsers와 같은 이유).
		const totalDaysSql = sql<number>`(
			select count(*)::int from ${bambiAttendance}
			where ${bambiAttendance.userId} = ${user.id}
		)`;
		// 출석일은 미래가 될 수 없으므로(서버가 오늘만 기록) 상한 없이 월초 이후만 세면 된다.
		const monthDaysSql = sql<number>`(
			select count(*)::int from ${bambiAttendance}
			where ${bambiAttendance.userId} = ${user.id}
				and ${bambiAttendance.attendedOn} >= ${monthStart}::date
		)`;
		const lastAttendedOnSql = sql<null | string>`(
			select max(${bambiAttendance.attendedOn})::text from ${bambiAttendance}
			where ${bambiAttendance.userId} = ${user.id}
		)`;
		// 미출석 경과일. 한 번도 출석하지 않은 계정은 null이라 "0일"과 구분된다.
		const idleDaysSql = sql<null | number>`(
			select (${today}::date - max(${bambiAttendance.attendedOn}))::int
			from ${bambiAttendance}
			where ${bambiAttendance.userId} = ${user.id}
		)`;
		// 잔액도 같은 상관 서브쿼리로 붙인다 — 원장 조인은 행을 부풀린다(위와 같은 이유).
		const pointBalanceRowSql = sql<number>`(
			select ${pointBalanceSql} from ${bambiPointTransaction}
			where ${bambiPointTransaction.userId} = ${user.id}
		)`;
		const attendedTodaySql = sql<boolean>`exists (
			select 1 from ${bambiAttendance}
			where ${bambiAttendance.userId} = ${user.id}
				and ${bambiAttendance.attendedOn} = ${today}::date
		)`;

		const keyword = input.search?.trim();
		const where = and(
			// 탈퇴 계정은 출석 대상이 아니다(파기 배치 전까지 목록에 남아 카운트를 흐린다).
			isNull(user.deletedAt),
			input.role
				? eq(bambiProfile.role, input.role)
				: inArray(bambiProfile.role, ["job_seeker", "employer"]),
			keyword
				? or(
						ilike(user.name, `%${keyword}%`),
						ilike(user.login_id, `%${keyword}%`)
					)
				: undefined
		);

		// 정렬 축이 전부 파생값이라 컬럼 참조가 아닌 SQL 조각으로 ORDER BY를 만든다.
		// 무기록 계정은 recent에서 맨 뒤로, idle(오래 안 온 순)에서는 맨 앞으로 보낸다.
		const orderByClause = {
			idle: sql`${lastAttendedOnSql} asc nulls first`,
			month: sql`${monthDaysSql} desc`,
			recent: sql`${lastAttendedOnSql} desc nulls last`,
			total: sql`${totalDaysSql} desc`,
		}[input.sort];

		const rows = await db
			.select({
				attendedToday: attendedTodaySql,
				displayName: user.name,
				idleDays: idleDaysSql,
				lastAttendedOn: lastAttendedOnSql,
				loginId: user.login_id,
				lastActivityAt: user.lastActivityAt,
				monthDays: monthDaysSql,
				pointBalance: pointBalanceRowSql,
				role: bambiProfile.role,
				totalDays: totalDaysSql,
				userId: user.id,
				presenceDisconnectedAt: user.presenceDisconnectedAt,
			})
			.from(user)
			// 출석 대상은 프로필 역할로 정해지므로 프로필이 없는(온보딩 전) 계정은 제외한다.
			.innerJoin(bambiProfile, eq(bambiProfile.userId, user.id))
			.where(where)
			// 동률에서 페이지 경계가 흔들리지 않도록 항상 id로 갈라 준다.
			.orderBy(orderByClause, asc(user.id))
			.limit(input.limit + 1)
			.offset(input.cursor);

		// 요약은 현재 필터(검색·역할)를 그대로 따른다 — 화면에 보이는 모집단과 숫자가 어긋나면
		// 운영자가 "오늘 3명"을 전체 수치로 오독한다.
		const [summary] = await db
			.select({
				attendedToday: sql<number>`(count(*) filter (where ${attendedTodaySql}))::int`,
				eligibleUsers: sql<number>`count(*)::int`,
			})
			.from(user)
			.innerJoin(bambiProfile, eq(bambiProfile.userId, user.id))
			.where(where);

		const hasMore = rows.length > input.limit;
		const pageRows = rows.slice(0, input.limit);
		const gradeBadges = await loadGradeBadges(
			pageRows.map((row) => row.userId)
		);

		const now = new Date();
		return {
			items: pageRows.map((row) => ({
				...row,
				grade: gradeBadges.get(row.userId) ?? null,
				isOnline: isUserOnline({
					deletedAt: null,
					lastActivityAt: row.lastActivityAt,
					now,
					offlineAfterMinutes,
					presenceDisconnectedAt: row.presenceDisconnectedAt,
				}),
			})),
			offlineAfterMinutes,
			nextCursor: hasMore ? input.cursor + input.limit : null,
			summary: summary ?? { attendedToday: 0, eligibleUsers: 0 },
			totalCount: summary?.eligibleUsers ?? 0,
		};
	}),

	checkIn: protectedProcedure.handler(async ({ context }) => {
		const profile = await requireAttendanceProfile(context.session);
		const attendedOn = getKstDateString();

		// 출석 기록과 포인트 적립은 한 트랜잭션이다 — 따로 쓰면 적립만 실패했을 때 복합 PK 탓에
		// 그날은 영영 재적립할 수 없다(재시도해도 출석 insert가 충돌로 스킵되기 때문).
		return await db.transaction(async (tx) => {
			// 복합 PK가 하루 1회를 보장하므로 중복 클릭·동시 클릭은 충돌을 무시하고 성공으로 끝낸다.
			// 삽입된 행이 없으면 이미 출석한 날이다(조회 후 삽입하면 그 사이 경합에서 500이 난다).
			const inserted = await tx
				.insert(bambiAttendance)
				.values({ attendedOn, userId: profile.userId })
				.onConflictDoNothing()
				.returning({ attendedOn: bambiAttendance.attendedOn });

			// 중복 적립 가드는 이 조건 하나다 — 출석 행이 실제로 생긴 경우에만 원장에 쌓는다.
			const [settings] = await tx
				.select({ points: bambiSiteSettings.attendancePoints })
				.from(bambiSiteSettings)
				.where(eq(bambiSiteSettings.id, SITE_SETTINGS_ROW_ID))
				.limit(1);
			const configuredPoints = settings?.points ?? 10;
			const award =
				inserted.length === 0
					? null
					: await awardMemberPoints(tx, {
							amount: configuredPoints,
							externalKey: `attendance:${profile.userId}:${attendedOn}`,
							reason: "attendance",
							userId: profile.userId,
						});
			const pointsAwarded = award?.awarded ?? 0;

			const [balance] = await tx
				.select({ pointBalance: pointBalanceSql })
				.from(bambiPointTransaction)
				.where(eq(bambiPointTransaction.userId, profile.userId));

			return {
				alreadyAttended: inserted.length === 0,
				attendedOn,
				pointBalance: balance?.pointBalance ?? 0,
				pointsAwarded,
			};
		});
	}),

	getMine: protectedProcedure
		.input(getMineInput)
		.handler(async ({ context, input }) => {
			const profile = await requireAttendanceProfile(context.session);
			const today = getKstDateString();
			const month = input.month ?? today.slice(0, 7);

			// 출석은 하루 한 행이라 계정당 행 수가 가입 일수를 넘지 않는다. 총계·연속·월 달력이
			// 전부 같은 목록에서 나오므로 쿼리를 셋으로 쪼개지 않고 한 번에 읽는다.
			const rows = await db
				.select({ attendedOn: bambiAttendance.attendedOn })
				.from(bambiAttendance)
				.where(eq(bambiAttendance.userId, profile.userId))
				.orderBy(desc(bambiAttendance.attendedOn));
			const attendedDatesDesc = rows.map((row) => row.attendedOn);

			// 패널 초기 렌더에 잔액이 함께 필요하다(출석 전에도 보여야 해서 checkIn 응답만으론 부족).
			// 등급표는 잔액과 병렬로 읽는다 — 서로 의존하지 않는 조회다.
			const [[balance], grades, [anchor]] = await Promise.all([
				db
					.select({
						gradeBasis: gradeBasisPointsSql,
						pointBalance: pointBalanceSql,
					})
					.from(bambiPointTransaction)
					.where(eq(bambiPointTransaction.userId, profile.userId)),
				db
					.select({
						id: bambiMemberGrade.id,
						name: bambiMemberGrade.name,
						minPoints: bambiMemberGrade.minPoints,
						color: bambiMemberGrade.color,
						iconStorageKey: bambiMemberGrade.iconStorageKey,
					})
					.from(bambiMemberGrade)
					.orderBy(asc(bambiMemberGrade.minPoints)),
				db
					.select({
						basisPoints: bambiProfile.gradeAnchorBasisPoints,
						gradeId: bambiProfile.gradeAnchorGradeId,
						startPoints: bambiProfile.gradeAnchorStartPoints,
					})
					.from(bambiProfile)
					.where(eq(bambiProfile.userId, profile.userId))
					.limit(1),
			]);

			const pointBalance = balance?.pointBalance ?? 0;
			// 표시 잔액은 전체 합계, 등급 판정만 포인트몰 제외 합계를 쓴다.
			const gradeBasis = resolveEffectiveGradeBasis(
				balance?.gradeBasis ?? 0,
				anchor ?? { basisPoints: null, gradeId: null, startPoints: null }
			);
			const current = resolveGrade(gradeBasis, grades);
			const upcoming = nextGrade(gradeBasis, grades);

			return {
				attendedDates: attendedDatesDesc.filter((attendedOn) =>
					attendedOn.startsWith(month)
				),
				attendancePoints:
					(
						await db
							.select({ points: bambiSiteSettings.attendancePoints })
							.from(bambiSiteSettings)
							.where(eq(bambiSiteSettings.id, SITE_SETTINGS_ROW_ID))
							.limit(1)
					)[0]?.points ?? 10,
				checkedInToday: attendedDatesDesc[0] === today,
				grade: current
					? {
							color: current.color,
							iconUrl: resolveGradeIconUrl(current.iconStorageKey ?? null),
							name: current.name,
						}
					: null,
				month,
				nextGrade: upcoming
					? { minPoints: upcoming.minPoints, name: upcoming.name }
					: null,
				pointBalance,
				// 다음 등급까지 남은 포인트도 등급 기준(포인트몰 제외) 합계로 계산한다.
				pointsToNext: upcoming ? upcoming.minPoints - gradeBasis : null,
				streakDays: countAttendanceStreak(attendedDatesDesc, today),
				today,
				totalDays: attendedDatesDesc.length,
			};
		}),
};
