import { randomUUID } from "node:crypto";

import { createProcedureClient } from "@orpc/server";
import dotenv from "dotenv";
import { eq, inArray } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type { Context } from "../../context";

dotenv.config({ path: "../../apps/server/.env" });

const [{ db }, authSchema, bambiSchema, { crawlerRouter }] = await Promise.all([
	import("@bambi-app/db"),
	import("@bambi-app/db/schema/auth"),
	import("@bambi-app/db/schema/bambi"),
	import("./crawler"),
]);

const { user } = authSchema;
const { bambiProfile, crawledCommunityTopic } = bambiSchema;

const createContextForUser = (userId: string): Context =>
	({ auth: null, session: { user: { id: userId } } }) as Context;

const adminUserId = `user_test_admin_${randomUUID()}`;

const callList = (input: {
	limit?: number;
	offset?: number;
	sort?: "comments" | "recent";
}) =>
	createProcedureClient(crawlerRouter.listCommunityTopics, {
		context: createContextForUser(adminUserId),
		path: ["bambi", "crawler", "listCommunityTopics"],
	})(input);

const run = randomUUID().slice(0, 8);
const externalId = (suffix: string) => `test-${run}:${suffix}`;

// 댓글수가 null인 글을 일부러 섞는다. 원본에 반응 지표가 없는 글이 실제로 흔한데,
// NULLS LAST가 빠지면 그 글들이 "댓글 많은 순" 맨 위를 차지한다.
const FIXTURES = [
	{ commentCount: 3, days: 1, suffix: "a", title: `${run} 댓글3 최신` },
	{ commentCount: 40, days: 5, suffix: "b", title: `${run} 댓글40 오래됨` },
	{ commentCount: null, days: 3, suffix: "c", title: `${run} 댓글없음` },
];

beforeAll(async () => {
	await db.insert(user).values({
		email: `crawler-list-${run}@bambi.test`,
		id: adminUserId,
		name: "운영자",
	});
	await db.insert(bambiProfile).values({
		isPhoneVerified: true,
		role: "admin",
		status: "active",
		userId: adminUserId,
	});

	await db.insert(crawledCommunityTopic).values(
		FIXTURES.map((fixture) => ({
			body: `${fixture.title} 본문`,
			boardName: "밤문화이야기",
			commentCount: fixture.commentCount,
			sourceExternalId: externalId(fixture.suffix),
			sourcePostedAt: new Date(Date.now() - fixture.days * 24 * 60 * 60 * 1000),
			sourceSite: "queenalba" as const,
			sourceUrl: `https://queenalba.net/bbs_detail.php?bbs_num=${fixture.suffix}`,
			title: fixture.title,
		}))
	);
});

afterAll(async () => {
	await db.delete(bambiProfile).where(eq(bambiProfile.userId, adminUserId));
	await db.delete(user).where(eq(user.id, adminUserId));
	await db.delete(crawledCommunityTopic).where(
		inArray(
			crawledCommunityTopic.sourceExternalId,
			FIXTURES.map((fixture) => externalId(fixture.suffix))
		)
	);
});

// 공유 dev DB라 다른 수집분이 섞여 있다. 이 회차가 심은 행만 골라서 본다.
const ours = <T extends { title: string }>(items: T[]): T[] =>
	items.filter((item) => item.title.startsWith(run));

describe("crawler.listCommunityTopics", () => {
	it("orders by newest first by default", async () => {
		const result = await callList({ limit: 100 });
		const titles = ours(result.items).map((item) => item.title);

		expect(titles[0]).toBe(`${run} 댓글3 최신`);
		expect(titles.at(-1)).toBe(`${run} 댓글40 오래됨`);
	});

	// "무슨 주제가 반응을 얻나"를 보는 축이다. 여기서 null이 위로 오면 표가 쓸모없어진다.
	it("sorts by comment count with missing counts last", async () => {
		const result = await callList({ limit: 100, sort: "comments" });
		const rows = ours(result.items);

		expect(rows[0]?.title).toBe(`${run} 댓글40 오래됨`);
		expect(rows.at(-1)?.commentCount).toBeNull();
	});

	it("pages through the result set", async () => {
		const first = await callList({ limit: 1, offset: 0 });
		const second = await callList({ limit: 1, offset: 1 });

		expect(first.items).toHaveLength(1);
		expect(second.items).toHaveLength(1);
		expect(first.items[0]?.title).not.toBe(second.items[0]?.title);
		expect(first.total).toBeGreaterThanOrEqual(FIXTURES.length);
	});
});
