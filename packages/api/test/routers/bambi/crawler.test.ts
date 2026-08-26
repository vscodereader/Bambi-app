import { randomUUID } from "node:crypto";

import { createProcedureClient } from "@orpc/server";
import dotenv from "dotenv";
import { describe, expect, it } from "vitest";

import type { Context } from "@/context";

// 삭제·복구는 DB 결합 경로다(enum 값·톰스톤 컬럼이 실제로 붙어 있어야 확인된다).
dotenv.config({ path: "../../apps/server/.env" });

const [{ db }, authSchema, bambiSchema, { crawlerRouter }] = await Promise.all([
	import("@bambi-app/db"),
	import("@bambi-app/db/schema/auth"),
	import("@bambi-app/db/schema/bambi"),
	import("@/routers/bambi/crawler"),
]);

const { user } = authSchema;
const { bambiProfile, crawledCommunityTopic, crawledJobPost, crawlRun } =
	bambiSchema;
const { eq, inArray } = await import("drizzle-orm");

const createContextForUser = (userId: null | string): Context =>
	({
		auth: null,
		session: userId ? { user: { id: userId } } : null,
	}) as Context;

// 공유 dev DB를 쓴다. 테스트가 심은 행만 지우도록 외부 ID를 고유하게 만든다 —
// 사이트 단위로 지우면 운영자가 실제로 수집해 둔 행이 함께 날아간다.
const testExternalId = () => `test_removal_${randomUUID()}`;

interface Fixture {
	adminUserId: string;
	jobPostId: string;
	memberUserId: string;
	topicId: string;
	userIds: string[];
}

const createFixture = async (
	options: { industryCategory?: "룸싸롱" } = {}
): Promise<Fixture> => {
	const adminUserId = `user_test_admin_${randomUUID()}`;
	const memberUserId = `user_test_member_${randomUUID()}`;

	await db.insert(user).values([
		{
			email: `admin-${randomUUID()}@bambi.test`,
			id: adminUserId,
			name: "운영자",
		},
		{
			email: `member-${randomUUID()}@bambi.test`,
			id: memberUserId,
			name: "구직자",
		},
	]);
	await db.insert(bambiProfile).values([
		{
			isPhoneVerified: true,
			role: "admin",
			status: "active",
			userId: adminUserId,
		},
		{
			isPhoneVerified: true,
			role: "job_seeker",
			status: "active",
			userId: memberUserId,
		},
	]);

	const [post] = await db
		.insert(crawledJobPost)
		.values({
			body: "본문",
			contentHash: randomUUID(),
			industryCategory: options.industryCategory ?? null,
			sourceExternalId: testExternalId(),
			sourceSite: "queenalba",
			sourceUrl: "https://queenalba.net/guin_detail.php?num=1",
			status: options.industryCategory ? "active" : "needs_review",
			title: "수집 공고",
		})
		.returning({ id: crawledJobPost.id });

	const [topic] = await db
		.insert(crawledCommunityTopic)
		.values({
			sourceExternalId: testExternalId(),
			// 목록이 원 게시일 최신순이라 날짜를 지금으로 둬 첫 페이지에 오게 한다.
			sourcePostedAt: new Date(),
			sourceSite: "queenalba",
			sourceUrl: "https://queenalba.net/bbs_view.php?bbs_num=1",
			title: "수집 게시글",
		})
		.returning({ id: crawledCommunityTopic.id });

	return {
		adminUserId,
		jobPostId: post?.id ?? "",
		memberUserId,
		topicId: topic?.id ?? "",
		userIds: [adminUserId, memberUserId],
	};
};

const cleanupFixture = async (fixture: Fixture) => {
	await db
		.delete(crawledJobPost)
		.where(eq(crawledJobPost.id, fixture.jobPostId));
	await db
		.delete(crawledCommunityTopic)
		.where(eq(crawledCommunityTopic.id, fixture.topicId));
	await db
		.delete(bambiProfile)
		.where(inArray(bambiProfile.userId, fixture.userIds));
	await db.delete(user).where(inArray(user.id, fixture.userIds));
};

const removePostAs = (userId: string) =>
	createProcedureClient(crawlerRouter.removePost, {
		context: createContextForUser(userId),
		path: ["bambi", "crawler", "removePost"],
	});

const removePostsAs = (userId: string) =>
	createProcedureClient(crawlerRouter.removePosts, {
		context: createContextForUser(userId),
		path: ["bambi", "crawler", "removePosts"],
	});

const restorePostAs = (userId: string) =>
	createProcedureClient(crawlerRouter.restorePost, {
		context: createContextForUser(userId),
		path: ["bambi", "crawler", "restorePost"],
	});

const hardDeletePostAs = (userId: string) =>
	createProcedureClient(crawlerRouter.hardDeletePost, {
		context: createContextForUser(userId),
		path: ["bambi", "crawler", "hardDeletePost"],
	});

const removeTopicAs = (userId: string) =>
	createProcedureClient(crawlerRouter.removeTopic, {
		context: createContextForUser(userId),
		path: ["bambi", "crawler", "removeTopic"],
	});

const restoreTopicAs = (userId: string) =>
	createProcedureClient(crawlerRouter.restoreTopic, {
		context: createContextForUser(userId),
		path: ["bambi", "crawler", "restoreTopic"],
	});

const hardDeleteTopicAs = (userId: string) =>
	createProcedureClient(crawlerRouter.hardDeleteTopic, {
		context: createContextForUser(userId),
		path: ["bambi", "crawler", "hardDeleteTopic"],
	});

const listTopicsAs = (userId: string) =>
	createProcedureClient(crawlerRouter.listTopics, {
		context: createContextForUser(userId),
		path: ["bambi", "crawler", "listTopics"],
	});

const clearRunsAs = (userId: string) =>
	createProcedureClient(crawlerRouter.clearRuns, {
		context: createContextForUser(userId),
		path: ["bambi", "crawler", "clearRuns"],
	});

const runExists = async (id: string) => {
	const [row] = await db
		.select({ id: crawlRun.id })
		.from(crawlRun)
		.where(eq(crawlRun.id, id));

	return Boolean(row);
};

const readJobStatus = async (id: string) => {
	const [row] = await db
		.select({ status: crawledJobPost.status })
		.from(crawledJobPost)
		.where(eq(crawledJobPost.id, id));

	return row?.status;
};

const readTopicRemovedAt = async (id: string) => {
	const [row] = await db
		.select({ removedAt: crawledCommunityTopic.removedAt })
		.from(crawledCommunityTopic)
		.where(eq(crawledCommunityTopic.id, id));

	return row?.removedAt;
};

const MISSING_ID = "00000000-0000-4000-8000-000000000000";

describe("crawler 공고 삭제·복구", () => {
	it("현재 페이지에서 고른 공고를 한 번에 removed 상태로 세운다", async () => {
		const first = await createFixture();
		const second = await createFixture({ industryCategory: "룸싸롱" });

		try {
			const result = await removePostsAs(first.adminUserId)({
				ids: [first.jobPostId, second.jobPostId],
			});

			expect(result.count).toBe(2);
			expect(new Set(result.ids)).toEqual(
				new Set([first.jobPostId, second.jobPostId])
			);
			expect(await readJobStatus(first.jobPostId)).toBe("removed");
			expect(await readJobStatus(second.jobPostId)).toBe("removed");
		} finally {
			await cleanupFixture(first);
			await cleanupFixture(second);
		}
	});

	it("삭제할 수 없는 ID가 섞이면 어느 공고도 변경하지 않는다", async () => {
		const fixture = await createFixture();

		try {
			await expect(
				removePostsAs(fixture.adminUserId)({
					ids: [fixture.jobPostId, MISSING_ID],
				})
			).rejects.toMatchObject({ code: "CONFLICT" });
			expect(await readJobStatus(fixture.jobPostId)).toBe("needs_review");
		} finally {
			await cleanupFixture(fixture);
		}
	});

	it("일괄 삭제 입력은 1~10개의 중복 없는 ID만 허용한다", async () => {
		const fixture = await createFixture();
		const client = removePostsAs(fixture.adminUserId);

		try {
			await expect(client({ ids: [] })).rejects.toBeTruthy();
			await expect(
				client({ ids: [fixture.jobPostId, fixture.jobPostId] })
			).rejects.toBeTruthy();
			await expect(
				client({ ids: Array.from({ length: 11 }, () => randomUUID()) })
			).rejects.toBeTruthy();
		} finally {
			await cleanupFixture(fixture);
		}
	});

	it("삭제는 행을 지우지 않고 removed 상태로 세운다", async () => {
		const fixture = await createFixture();

		try {
			const saved = await removePostAs(fixture.adminUserId)({
				id: fixture.jobPostId,
			});

			expect(saved.status).toBe("removed");
			// 행이 남아 있어야 다음 회차 upsert가 "이 공고는 내려간 것"임을 알아본다.
			expect(await readJobStatus(fixture.jobPostId)).toBe("removed");
		} finally {
			await cleanupFixture(fixture);
		}
	});

	// 복구 상태는 재수집 CASE와 같은 규칙이어야 한다 — 업종 없는 공고를 active로 되돌리면
	// 검토도 안 끝난 공고가 화면에 선다.
	it("복구는 업종이 없으면 needs_review로, 있으면 active로 되돌린다", async () => {
		const withoutIndustry = await createFixture();
		const withIndustry = await createFixture({ industryCategory: "룸싸롱" });

		try {
			await removePostAs(withoutIndustry.adminUserId)({
				id: withoutIndustry.jobPostId,
			});
			await removePostAs(withIndustry.adminUserId)({
				id: withIndustry.jobPostId,
			});

			await restorePostAs(withoutIndustry.adminUserId)({
				id: withoutIndustry.jobPostId,
			});
			await restorePostAs(withIndustry.adminUserId)({
				id: withIndustry.jobPostId,
			});

			expect(await readJobStatus(withoutIndustry.jobPostId)).toBe(
				"needs_review"
			);
			expect(await readJobStatus(withIndustry.jobPostId)).toBe("active");
		} finally {
			await cleanupFixture(withoutIndustry);
			await cleanupFixture(withIndustry);
		}
	});

	// 완전 삭제는 소프트 삭제를 거친 removed 행만 지운다 — 행이 실제로 사라져야 하고,
	// 톰스톤도 함께 사라진다.
	it("removed 상태 행을 완전 삭제하면 DB에서 행이 사라진다", async () => {
		const fixture = await createFixture();

		try {
			await removePostAs(fixture.adminUserId)({ id: fixture.jobPostId });

			const deleted = await hardDeletePostAs(fixture.adminUserId)({
				id: fixture.jobPostId,
			});

			expect(deleted.id).toBe(fixture.jobPostId);
			expect(await readJobStatus(fixture.jobPostId)).toBeUndefined();
		} finally {
			await cleanupFixture(fixture);
		}
	});

	// removed가 아닌 행에 완전 삭제를 걸면 지우지 않는다 — 목록에서 바로 DELETE되는 사고를 막는다.
	it("removed가 아닌 행에 완전 삭제하면 NOT_FOUND", async () => {
		const fixture = await createFixture();

		try {
			await expect(
				hardDeletePostAs(fixture.adminUserId)({ id: fixture.jobPostId })
			).rejects.toMatchObject({ code: "NOT_FOUND" });
			expect(await readJobStatus(fixture.jobPostId)).toBe("needs_review");
		} finally {
			await cleanupFixture(fixture);
		}
	});

	// 목록이 낡아 이미 지워진 행을 가리키는 경우가 있다. 조용히 성공으로 읽히면 운영자는
	// 삭제가 된 줄 안다.
	it("대상이 없으면 NOT_FOUND", async () => {
		const fixture = await createFixture();

		try {
			await expect(
				removePostAs(fixture.adminUserId)({ id: MISSING_ID })
			).rejects.toMatchObject({ code: "NOT_FOUND" });

			// 삭제되지 않은 공고에 복구를 걸면 status 재계산으로 운영자가 손댄 상태가 흔들린다.
			await expect(
				restorePostAs(fixture.adminUserId)({ id: fixture.jobPostId })
			).rejects.toMatchObject({ code: "NOT_FOUND" });
		} finally {
			await cleanupFixture(fixture);
		}
	});

	it("운영자가 아니면 호출할 수 없다", async () => {
		const fixture = await createFixture();

		try {
			await expect(
				removePostAs(fixture.memberUserId)({ id: fixture.jobPostId })
			).rejects.toBeTruthy();
			await expect(
				removePostsAs(fixture.memberUserId)({ ids: [fixture.jobPostId] })
			).rejects.toBeTruthy();
			expect(await readJobStatus(fixture.jobPostId)).toBe("needs_review");
		} finally {
			await cleanupFixture(fixture);
		}
	});
});

describe("crawler 커뮤니티 글 삭제·복구", () => {
	it("삭제는 removedAt을 찍고 복구는 비운다", async () => {
		const fixture = await createFixture();

		try {
			await removeTopicAs(fixture.adminUserId)({ id: fixture.topicId });

			expect(await readTopicRemovedAt(fixture.topicId)).toBeInstanceOf(Date);

			await restoreTopicAs(fixture.adminUserId)({ id: fixture.topicId });

			expect(await readTopicRemovedAt(fixture.topicId)).toBeNull();
		} finally {
			await cleanupFixture(fixture);
		}
	});

	it("대상이 없으면 NOT_FOUND", async () => {
		const fixture = await createFixture();

		try {
			await expect(
				removeTopicAs(fixture.adminUserId)({ id: MISSING_ID })
			).rejects.toMatchObject({ code: "NOT_FOUND" });
		} finally {
			await cleanupFixture(fixture);
		}
	});

	// 운영자 목록은 내린 글도 보여줘야 한다 — 안 보이면 복구할 방법이 없다.
	it("listTopics는 removed 여부로 필터한다", async () => {
		const fixture = await createFixture();

		try {
			await removeTopicAs(fixture.adminUserId)({ id: fixture.topicId });

			const listTopics = listTopicsAs(fixture.adminUserId);
			const removedOnly = await listTopics({ removed: true });
			const liveOnly = await listTopics({ removed: false });

			expect(removedOnly.items.some((row) => row.id === fixture.topicId)).toBe(
				true
			);
			expect(liveOnly.items.some((row) => row.id === fixture.topicId)).toBe(
				false
			);
		} finally {
			await cleanupFixture(fixture);
		}
	});

	// 완전 삭제는 소프트 삭제를 거친(removedAt이 선) 행만 지운다 — 행이 실제로 사라져야 하고,
	// 톰스톤도 함께 사라진다.
	it("removedAt이 선 토픽을 완전 삭제하면 DB에서 행이 사라진다", async () => {
		const fixture = await createFixture();

		try {
			await removeTopicAs(fixture.adminUserId)({ id: fixture.topicId });

			const deleted = await hardDeleteTopicAs(fixture.adminUserId)({
				id: fixture.topicId,
			});

			expect(deleted.id).toBe(fixture.topicId);
			// 행이 사라졌으면 removedAt 조회도 아무것도 못 읽는다.
			expect(await readTopicRemovedAt(fixture.topicId)).toBeUndefined();
		} finally {
			await cleanupFixture(fixture);
		}
	});

	// removedAt이 비어 있는 행에 완전 삭제를 걸면 지우지 않는다 — 목록에서 바로 DELETE되는 사고를 막는다.
	it("removedAt이 없는 토픽에 완전 삭제하면 NOT_FOUND + 행 잔존", async () => {
		const fixture = await createFixture();

		try {
			await expect(
				hardDeleteTopicAs(fixture.adminUserId)({ id: fixture.topicId })
			).rejects.toMatchObject({ code: "NOT_FOUND" });
			// 행이 남아 있어야 한다 — removedAt은 여전히 비어 있다.
			expect(await readTopicRemovedAt(fixture.topicId)).toBeNull();
		} finally {
			await cleanupFixture(fixture);
		}
	});
});

// 비우기는 톰스톤이 아니라 진짜 DELETE라, 무엇이 지워지지 *않는지*가 안전성의 전부다.
//
// 주의: clearRuns는 조건 하나로 테이블을 통째로 비우므로 이 테스트는 개발 DB에 쌓인 실제
// 회차 기록까지 지운다(banned-words의 removeAll을 테스트하지 않는 것과 같은 사정). 그래도
// 테스트를 두는 이유는 남아야 할 행이 남는지가 이 프로시저의 핵심이고, 회차 기록은 다음
// 수집이 다시 쌓는 운영 로그이기 때문이다 — 수율 이력을 보존해야 하는 DB에서는 돌리지 말 것.
describe("crawler 회차 기록 비우기", () => {
	it("끝난 회차는 지우고 진행 중 회차는 남긴다", async () => {
		const fixture = await createFixture();
		const [finished] = await db
			.insert(crawlRun)
			.values({
				contentType: "job_post",
				finishedAt: new Date(),
				sourceSite: "queenalba",
				status: "success",
			})
			.returning({ id: crawlRun.id });
		// 진행 중 회차는 사이트당 하나만 존재할 수 있다(status='running' 부분 유니크 인덱스).
		// 실제로 수집이 도는 queenalba와 부딪히지 않게 foxalba로 심는다.
		const [running] = await db
			.insert(crawlRun)
			.values({
				contentType: "job_post",
				sourceSite: "foxalba",
				status: "running",
			})
			.returning({ id: crawlRun.id });

		try {
			const result = await clearRunsAs(fixture.adminUserId)({});

			expect(result.removed).toBeGreaterThanOrEqual(1);
			expect(await runExists(finished?.id ?? "")).toBe(false);
			// 수집기는 회차를 열 때 받은 id로 완료 시 UPDATE하고(bambi-crawl-ingest.ts),
			// 부분 유니크 인덱스는 이 행이 있는 동안만 중복 회차를 막는다 — 지우면 둘 다 무너진다.
			expect(await runExists(running?.id ?? "")).toBe(true);
		} finally {
			await db.delete(crawlRun).where(eq(crawlRun.id, running?.id ?? ""));
			await cleanupFixture(fixture);
		}
	});

	it("운영자가 아니면 호출할 수 없다", async () => {
		const fixture = await createFixture();
		const [run] = await db
			.insert(crawlRun)
			.values({
				contentType: "job_post",
				finishedAt: new Date(),
				sourceSite: "queenalba",
				status: "success",
			})
			.returning({ id: crawlRun.id });

		try {
			await expect(clearRunsAs(fixture.memberUserId)({})).rejects.toBeTruthy();
			expect(await runExists(run?.id ?? "")).toBe(true);
		} finally {
			await db.delete(crawlRun).where(eq(crawlRun.id, run?.id ?? ""));
			await cleanupFixture(fixture);
		}
	});
});
