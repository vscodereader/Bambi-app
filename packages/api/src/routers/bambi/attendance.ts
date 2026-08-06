import { db } from "@bambi-app/db";
import { bambiAttendance } from "@bambi-app/db/schema/bambi";
import { ORPCError } from "@orpc/server";
import { desc, eq } from "drizzle-orm";
import z from "zod";

import { protectedProcedure } from "../../index";
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
