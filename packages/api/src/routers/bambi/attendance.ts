import { db } from "@bambi-app/db";
import { user } from "@bambi-app/db/schema/auth";
import { bambiAttendance, bambiProfile } from "@bambi-app/db/schema/bambi";
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

// 출석 대상 역할. 운영자·법률자문·게스트는 출석 대상이 아니다. 허용 목록으로 고정해
// bambi_user_role에 값이 하나 늘어도 기본 판정이 "거부"가 되게 한다(bambi-authz 관례).
const ATTENDANCE_ROLES = new Set<string>(["job_seeker", "employer"]);

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
	adminList: adminProcedure.input(adminListInput).handler(async ({ input }) => {
		const today = getKstDateString();
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
				monthDays: monthDaysSql,
				role: bambiProfile.role,
				totalDays: totalDaysSql,
				userId: user.id,
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

		return {
			items: rows.slice(0, input.limit),
			nextCursor: hasMore ? input.cursor + input.limit : null,
			summary: summary ?? { attendedToday: 0, eligibleUsers: 0 },
		};
	}),

	checkIn: protectedProcedure.handler(async ({ context }) => {
		const profile = await requireAttendanceProfile(context.session);
		const attendedOn = getKstDateString();

		// 복합 PK가 하루 1회를 보장하므로 중복 클릭·동시 클릭은 충돌을 무시하고 성공으로 끝낸다.
		// 삽입된 행이 없으면 이미 출석한 날이다(조회 후 삽입하면 그 사이 경합에서 500이 난다).
		const inserted = await db
			.insert(bambiAttendance)
			.values({ attendedOn, userId: profile.userId })
			.onConflictDoNothing()
			.returning({ attendedOn: bambiAttendance.attendedOn });

		return {
			alreadyAttended: inserted.length === 0,
			attendedOn,
		};
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

			return {
				attendedDates: attendedDatesDesc.filter((attendedOn) =>
					attendedOn.startsWith(month)
				),
				checkedInToday: attendedDatesDesc[0] === today,
				month,
				streakDays: countAttendanceStreak(attendedDatesDesc, today),
				today,
				totalDays: attendedDatesDesc.length,
			};
		}),
};
