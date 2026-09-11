import { randomUUID } from "node:crypto";

import dotenv from "dotenv";
import { eq, inArray } from "drizzle-orm";
import { describe, expect, it } from "vitest";

dotenv.config({ path: "../../apps/server/.env" });

const [{ db }, authSchema, bambiSchema, analytics] = await Promise.all([
	import("@bambi-app/db"),
	import("@bambi-app/db/schema/auth"),
	import("@bambi-app/db/schema/bambi"),
	import("@/services/bambi-analytics"),
]);

const { user } = authSchema;
const { jobViewLog } = bambiSchema;
const { recordJobView } = analytics;

describe("recordJobView", () => {
	it("creates one row per user+job and increments view_count on repeat views", async () => {
		const userId = `user_test_${randomUUID()}`;
		const jobPostId = randomUUID();
		const organizationId = `org_test_${randomUUID()}`;

		await db.insert(user).values({
			email: `job-view-${randomUUID()}@bambi.test`,
			id: userId,
			name: "공고 조회 로그 테스트 유저",
		});

		try {
			await recordJobView({
				jobPostId,
				jobTitle: "첫 제목",
				organizationId,
				organizationName: "첫 업소명",
				source: "member",
				userId,
			});
			await recordJobView({
				jobPostId,
				jobTitle: "바뀐 제목",
				organizationId,
				organizationName: "바뀐 업소명",
				source: "member",
				userId,
			});

			const rows = await db
				.select()
				.from(jobViewLog)
				.where(eq(jobViewLog.userId, userId));

			expect(rows).toHaveLength(1);
			expect(rows[0]?.viewCount).toBe(2);
			expect(rows[0]?.jobTitle).toBe("바뀐 제목");
			expect(rows[0]?.organizationName).toBe("바뀐 업소명");
			expect(rows[0]?.businessKey).toBe(`org:${organizationId}`);
			expect(rows[0]?.lastViewedAt.getTime()).toBeGreaterThanOrEqual(
				rows[0]?.firstViewedAt.getTime() ?? 0
			);
		} finally {
			// user cascade가 job_view_log를 지운다.
			await db.delete(user).where(inArray(user.id, [userId]));
		}
	});

	it("keys crawled views by phone digits and falls back to shop name", async () => {
		const userId = `user_test_${randomUUID()}`;
		await db.insert(user).values({
			email: `job-view-${randomUUID()}@bambi.test`,
			id: userId,
			name: "크롤 조회 로그 테스트 유저",
		});
		try {
			const withPhone = randomUUID();
			const withoutPhone = randomUUID();
			await recordJobView({
				businessPhone: "010-1234-5678",
				jobPostId: withPhone,
				jobTitle: "크롤 공고 A",
				organizationName: "루나클럽",
				source: "crawled",
				userId,
			});
			await recordJobView({
				jobPostId: withoutPhone,
				jobTitle: "크롤 공고 B",
				organizationName: "루나클럽",
				source: "crawled",
				userId,
			});
			const rows = await db
				.select()
				.from(jobViewLog)
				.where(eq(jobViewLog.userId, userId));
			const byJob = new Map(rows.map((row) => [row.jobPostId, row]));
			expect(byJob.get(withPhone)?.businessKey).toBe("phone:01012345678");
			expect(byJob.get(withPhone)?.businessPhone).toBe("010-1234-5678");
			expect(byJob.get(withPhone)?.organizationId).toBeNull();
			expect(byJob.get(withoutPhone)?.businessKey).toBe("shop:루나클럽");
		} finally {
			await db.delete(user).where(inArray(user.id, [userId]));
		}
	});
});
