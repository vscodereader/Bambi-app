import { randomUUID } from "node:crypto";
import { db } from "@bambi-app/db";
import { user } from "@bambi-app/db/schema/auth";
import {
	adminModerationAction,
	bambiMemberGrade,
	bambiProfile,
	bambiSiteSettings,
	communityBoard,
	communityComment,
	communityPost,
	crawledCommunityTopic,
} from "@bambi-app/db/schema/bambi";
import { createRouterClient } from "@orpc/server";
import { and, eq, inArray } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Context } from "@/context";
import { communityRouter } from "@/routers/bambi/community";
import { communityBoardsRouter } from "@/routers/bambi/community-boards";
import { crawlerRouter } from "@/routers/bambi/crawler";
import {
	queenalbaBbsDetailHtml,
	queenalbaBbsListHtml,
} from "@/services/__fixtures__/crawl-html";
import type { CrawlClient } from "@/services/bambi-crawl-fetch";
import { runCrawlTick } from "@/services/bambi-crawl-ingest";
import { crawledTextToDocument } from "@/services/bambi-crawled-community-policy";

const required = <T>(value: T | undefined): T => {
	if (value === undefined) {
		throw new Error("테스트 데이터가 없습니다.");
	}
	return value;
};
const adminId = randomUUID();
const memberId = randomUUID();
const maleId = randomUUID();
const advisorId = randomUUID();
const users = [adminId, memberId, maleId, advisorId];
const gradeA = randomUUID();
const gradeB = randomUUID();
const sourceId = `test:${randomUUID()}`;
const ids: string[] = [];
const nativeIds: string[] = [];
const customBoard = `test_${randomUUID().slice(0, 8)}`;
let originalSettings: typeof bambiSiteSettings.$inferSelect | undefined;
const actor = (id: string) =>
	createRouterClient(
		{
			crawler: crawlerRouter,
			community: communityRouter,
			boards: communityBoardsRouter,
		},
		{ context: { auth: null, session: { user: { id } } } as Context }
	);
const admin = actor(adminId);
const member = actor(memberId);
const male = actor(maleId);
const advisor = actor(advisorId);

const topic = async (
	boardKey: string,
	overrides: Partial<typeof crawledCommunityTopic.$inferInsert> = {}
) => {
	const [row] = await db
		.insert(crawledCommunityTopic)
		.values({
			sourceSite: "queenalba",
			sourceExternalId: sourceId,
			sourceUrl: "https://example.invalid/topic",
			boardKey,
			boardName: "원본 작성자",
			title: "원본 제목",
			body: "원본 본문",
			sourcePostedAt: new Date(),
			comments: [
				{
					id: "source:1",
					authorName: "원본 댓글 작성자",
					body: "첫 댓글",
					sourcePostedAt: null,
				},
			],
			...overrides,
		})
		.returning();
	ids.push(required(row).id);
	return required(row);
};
const fixtureClient: CrawlClient = {
	isAllowed: async () => true,
	fetchHtml: async (url) =>
		url.includes("bbs_list") ? queenalbaBbsListHtml : queenalbaBbsDetailHtml,
	fetchBinary: () => {
		throw new Error("커뮤니티에서 바이너리 요청은 없어야 합니다.");
	},
};

const fixtureRole = (id: string) => {
	if (id === adminId) {
		return "admin" as const;
	}
	if (id === advisorId) {
		return "legal_advisor" as const;
	}
	return "job_seeker" as const;
};

beforeAll(async () => {
	[originalSettings] = await db
		.select()
		.from(bambiSiteSettings)
		.where(eq(bambiSiteSettings.id, "default"));
	await db.insert(user).values(
		users.map((id) => ({
			id,
			name: "실제 계정 이름",
			email: `${id}@bambi.test`,
		}))
	);
	await db.insert(bambiProfile).values(
		users.map((id) => ({
			userId: id,
			role: fixtureRole(id),
			gender: id === maleId ? ("male" as const) : ("female" as const),
			isPhoneVerified: true,
			status: "active" as const,
		}))
	);
	await db.insert(bambiMemberGrade).values([
		{ id: gradeA, name: "테스트 일반", minPoints: 98_765_001 },
		{ id: gradeB, name: "다른 등급", minPoints: 98_765_002 },
	]);
	await db
		.update(bambiSiteSettings)
		.set({
			crawledCommunityFeedEnabled: true,
			crawledCommunityEditorGradeId: gradeA,
			crawlCommunityBoardKey: "work_talk",
			crawlSourceSite: "queenalba",
			crawlContentType: "community",
			crawlEnabled: true,
			crawlLastRunAt: null,
		})
		.where(eq(bambiSiteSettings.id, "default"));
});
afterAll(async () => {
	await db
		.delete(communityComment)
		.where(inArray(communityComment.authorUserId, users));
	await db
		.delete(adminModerationAction)
		.where(inArray(adminModerationAction.adminUserId, users));
	if (nativeIds.length) {
		await db.delete(communityPost).where(inArray(communityPost.id, nativeIds));
	}
	if (ids.length) {
		await db
			.delete(crawledCommunityTopic)
			.where(inArray(crawledCommunityTopic.id, ids));
	}
	if (originalSettings) {
		await db
			.update(bambiSiteSettings)
			.set(originalSettings)
			.where(eq(bambiSiteSettings.id, "default"));
	}
	await db
		.delete(bambiMemberGrade)
		.where(inArray(bambiMemberGrade.id, [gradeA, gradeB]));
	await db.delete(communityBoard).where(eq(communityBoard.key, customBoard));
	await db.delete(bambiProfile).where(inArray(bambiProfile.userId, users));
	await db.delete(user).where(inArray(user.id, users));
});

describe("수집 글 게시판별 독립 편집", () => {
	it("같은 원본을 서로 다른 게시판에 저장하고 같은 게시판 중복은 거부한다", async () => {
		const a = await topic("free");
		const b = await topic("work_talk");
		expect(a.id).not.toBe(b.id);
		await expect(topic("free")).rejects.toThrow();
	});
	it("관리자만 편집하며 일반회원의 직접 요청은 거부한다", async () => {
		await expect(
			member.crawler.updateTopic({
				id: required(ids[0]),
				expectedRevision: 0,
				title: "수정 제목",
				body: crawledTextToDocument("수정 본문"),
			})
		).rejects.toMatchObject({ code: "FORBIDDEN" });
		await expect(
			member.crawler.getTopicForEdit({ id: required(ids[0]) })
		).rejects.toMatchObject({ code: "FORBIDDEN" });
	});
	it("댓글만 수정하면 글 작성자는 유지하고 해당 게시판 날짜만 갱신한다", async () => {
		await admin.crawler.updateSourceComment({
			id: required(ids[0]),
			sourceCommentId: "source:1",
			expectedRevision: 0,
			body: "관리자 수정 댓글",
		});
		const a = await member.community.getCrawledTopic({
			topicId: required(ids[0]),
		});
		const b = await member.community.getCrawledTopic({
			topicId: required(ids[1]),
		});
		expect(a.authorName).toBe("원본 작성자");
		expect(a.authorGrade).toBeNull();
		expect(a.sourceComments[0]).toMatchObject({
			body: "관리자 수정 댓글",
			authorName: "ㅇㅇ",
			authorGrade: { name: "테스트 일반" },
		});
		expect(required(b.sourceComments[0]).body).toBe("첫 댓글");
		expect(b.revision).toBe(0);
		expect(a.revision).toBe(1);
	});
	it("리치 본문 편집·검색·일반 글과 최신순·이전글 탐색이 같은 표시값을 사용한다", async () => {
		const [native] = await db
			.insert(communityPost)
			.values({
				board: "free",
				authorUserId: memberId,
				authorRole: "job_seeker",
				authorDisplayName: "회원",
				passwordHash: "",
				title: "회원 글",
				body: crawledTextToDocument("회원 본문"),
				createdAt: new Date(Date.now() - 60_000),
			})
			.returning();
		nativeIds.push(required(native).id);
		await admin.crawler.updateTopic({
			id: required(ids[0]),
			expectedRevision: 1,
			title: "편집 검색 제목",
			body: crawledTextToDocument("새로운검색어\n둘째 문단"),
		});
		const result = await member.community.getCrawledTopic({
			topicId: required(ids[0]),
		});
		expect(result).toMatchObject({
			authorName: "ㅇㅇ",
			authorGrade: { name: "테스트 일반" },
			bodyFormat: "tiptap",
			title: "편집 검색 제목",
		});
		const list = await member.community.listPosts({ board: "free" });
		expect(
			list.items.findIndex((item) => item.id === required(ids[0]))
		).toBeLessThan(
			list.items.findIndex((item) => item.id === required(native).id)
		);
		const search = await member.community.listPosts({
			board: "free",
			q: "새로운검색어",
		});
		expect(search.items.some((item) => item.id === required(ids[0]))).toBe(
			true
		);
		const nav = await member.community.getPostNavigation({
			board: "free",
			source: "crawled",
			currentId: required(ids[0]),
		});
		expect(nav.previous?.id).toBe(required(native).id);
		expect(
			(await member.community.getCrawledTopic({ topicId: required(ids[1]) }))
				.title
		).toBe("원본 제목");
	});
	it("오래된 revision과 밤비 댓글 ID를 이용한 편집을 거부한다", async () => {
		await expect(
			admin.crawler.updateTopic({
				id: required(ids[0]),
				expectedRevision: 0,
				title: "이전 내용",
				body: crawledTextToDocument("덮어쓰기"),
			})
		).rejects.toMatchObject({ code: "CONFLICT" });
		const comment = await member.community.createCrawledComment({
			topicId: required(ids[0]),
			body: "밤비 회원 댓글",
		});
		await expect(
			admin.crawler.updateSourceComment({
				id: required(ids[0]),
				sourceCommentId: required(comment).id,
				expectedRevision: 2,
				body: "잘못된 수정",
			})
		).rejects.toMatchObject({ code: "NOT_FOUND" });
		expect(
			(await member.community.getCrawledTopic({ topicId: required(ids[1]) }))
				.comments
		).toHaveLength(0);
	});
	it("등급 이름과 선택 대상 변경이 과거 글·댓글에 반영되고 날짜는 그대로다", async () => {
		const before = await member.community.getCrawledTopic({
			topicId: required(ids[0]),
		});
		await db
			.update(bambiMemberGrade)
			.set({ name: "이름 변경" })
			.where(eq(bambiMemberGrade.id, gradeA));
		expect(
			(await member.community.getCrawledTopic({ topicId: required(ids[0]) }))
				.authorGrade?.name
		).toBe("이름 변경");
		await admin.crawler.updateSettings({
			contentType: "community",
			boardKey: "free",
			editorGradeId: gradeB,
			enabled: true,
			intervalHours: 3,
			sourceSite: "queenalba",
		});
		const after = await member.community.getCrawledTopic({
			topicId: required(ids[0]),
		});
		expect(after.authorGrade?.name).toBe("다른 등급");
		expect(required(after.sourceComments[0]).authorGrade?.name).toBe(
			"다른 등급"
		);
		expect(after.sourcePostedAt).toEqual(before.sourcePostedAt);
	});
	it("30일이 지난 글도 댓글 수정 후 해당 게시판에 다시 노출한다", async () => {
		const old = await topic("market", {
			sourcePostedAt: new Date(Date.now() - 40 * 86_400_000),
		});
		expect(
			(await member.community.listPosts({ board: "market" })).items.some(
				(item) => item.id === old.id
			)
		).toBe(false);
		await admin.crawler.updateSourceComment({
			id: old.id,
			sourceCommentId: "source:1",
			body: "수정 댓글",
			expectedRevision: 0,
		});
		expect(
			(await member.community.listPosts({ board: "market" })).items.some(
				(item) => item.id === old.id
			)
		).toBe(true);
	});
	it("비밀게시판은 수정 전에도 밤비·여성이며 기존 남성 읽기 권한을 사용한다", async () => {
		const secret = await topic("secret");
		const read = await male.community.getCrawledTopic({ topicId: secret.id });
		expect(read).toMatchObject({
			authorName: "밤비",
			authorGender: "female",
			locked: false,
		});
		expect(read.sourceComments[0]).toMatchObject({
			authorName: "밤비",
			authorGender: "female",
		});
		await expect(
			male.community.getCrawledTopic({ topicId: required(ids[0]) })
		).rejects.toMatchObject({ code: "FORBIDDEN" });
	});
	it("법률자문 글·댓글은 일반 이용자에게 숨기고 관리자·법률자문은 읽는다", async () => {
		const legal = await topic("legal");
		expect(
			await member.community.getCrawledTopic({ topicId: legal.id })
		).toMatchObject({
			locked: true,
			body: "",
			sourceComments: [],
			comments: [],
		});
		expect(
			(await advisor.community.getCrawledTopic({ topicId: legal.id })).body
		).toBe("원본 본문");
		await expect(
			member.community.createCrawledComment({
				topicId: legal.id,
				body: "권한 없는 댓글",
			})
		).rejects.toMatchObject({ code: "FORBIDDEN" });
	});
	it("새 비활성·읽기전용 게시판도 수집 대상으로 선택할 수 있다", async () => {
		await db.insert(communityBoard).values({
			key: customBoard,
			slug: customBoard,
			label: "새 게시판",
			sortOrder: 999,
			isActive: false,
			isWritable: false,
		});
		expect(
			(await admin.boards.list()).some((board) => board.key === customBoard)
		).toBe(true);
		await admin.crawler.updateSettings({
			contentType: "community",
			boardKey: customBoard,
			editorGradeId: gradeB,
			enabled: true,
			intervalHours: 3,
			sourceSite: "queenalba",
		});
		const result = await runCrawlTick(new Date(), fixtureClient, {
			force: true,
			contentType: "community",
		});
		expect(result.itemsNew).toBeGreaterThan(0);
		const rows = await db
			.select()
			.from(crawledCommunityTopic)
			.where(eq(crawledCommunityTopic.boardKey, customBoard));
		ids.push(...rows.map((row) => required(row).id));
		await expect(
			member.community.getCrawledTopic({ topicId: required(rows[0]).id })
		).rejects.toMatchObject({ code: "NOT_FOUND" });
	});
	it("동일 revision의 동시 저장은 하나만 성공하고 다른 입력은 덮어쓰지 않는다", async () => {
		const row = await topic("notice");
		const results = await Promise.allSettled([
			admin.crawler.updateTopic({
				id: row.id,
				expectedRevision: 0,
				title: "관리자 첫 저장",
				body: crawledTextToDocument("첫 본문"),
			}),
			admin.crawler.updateTopic({
				id: row.id,
				expectedRevision: 0,
				title: "관리자 둘째 저장",
				body: crawledTextToDocument("둘째 본문"),
			}),
		]);
		expect(
			results.filter((result) => result.status === "fulfilled")
		).toHaveLength(1);
		expect(
			results.filter((result) => result.status === "rejected")
		).toHaveLength(1);
		expect((await admin.crawler.getTopicForEdit({ id: row.id })).revision).toBe(
			1
		);
	});
	it("등급 미선택·다른 종류의 글 ID·잘못된 본문은 저장 전에 거부한다", async () => {
		const id = required(ids[0]);
		const before = await admin.crawler.getTopicForEdit({ id });
		await db
			.update(bambiSiteSettings)
			.set({ crawledCommunityEditorGradeId: null })
			.where(eq(bambiSiteSettings.id, "default"));
		try {
			await expect(
				admin.crawler.updateTopic({
					id,
					expectedRevision: before.revision,
					title: "실패해야 하는 저장",
					body: crawledTextToDocument("본문"),
				})
			).rejects.toMatchObject({ code: "BAD_REQUEST" });
		} finally {
			await db
				.update(bambiSiteSettings)
				.set({ crawledCommunityEditorGradeId: gradeB })
				.where(eq(bambiSiteSettings.id, "default"));
		}
		await expect(
			admin.crawler.updateTopic({
				id: required(nativeIds[0]),
				expectedRevision: 0,
				title: "회원 글 수정 시도",
				body: crawledTextToDocument("본문"),
			})
		).rejects.toMatchObject({ code: "NOT_FOUND" });
		await expect(
			admin.crawler.updateTopic({
				id,
				expectedRevision: before.revision,
				title: "잘못된 본문",
				body: "평문을 JSON으로 저장할 수 없음",
			})
		).rejects.toMatchObject({ code: "BAD_REQUEST" });
		expect((await admin.crawler.getTopicForEdit({ id })).revision).toBe(
			before.revision
		);
	});
	it("재수집은 같은 게시판에 중복하지 않고 관리자 수정본과 댓글을 보존한다", async () => {
		const [row] = await db
			.select()
			.from(crawledCommunityTopic)
			.where(eq(crawledCommunityTopic.boardKey, customBoard));
		await admin.crawler.updateTopic({
			id: required(row).id,
			expectedRevision: 0,
			title: "관리자 보존 제목",
			body: crawledTextToDocument("관리자 보존 본문"),
		});
		await db
			.update(crawledCommunityTopic)
			.set({ body: null })
			.where(eq(crawledCommunityTopic.id, required(row).id));
		const before = await admin.crawler.getTopicForEdit({
			id: required(row).id,
		});
		await admin.crawler.updateSourceComment({
			id: required(row).id,
			expectedRevision: 1,
			sourceCommentId: required(before.sourceComments[0]).id,
			body: "보존할 댓글",
		});
		const result = await runCrawlTick(new Date(), fixtureClient, {
			force: true,
			contentType: "community",
			boardKey: customBoard,
		});
		expect(result.itemsNew).toBe(0);
		const after = await admin.crawler.getTopicForEdit({ id: required(row).id });
		expect(after.title).toBe("관리자 보존 제목");
		expect(after.sourceComments[0]).toMatchObject({
			id: required(before.sourceComments[0]).id,
			body: "보존할 댓글",
		});
		const [saved] = await db
			.select()
			.from(crawledCommunityTopic)
			.where(
				and(
					eq(crawledCommunityTopic.id, required(row).id),
					eq(crawledCommunityTopic.boardKey, customBoard)
				)
			);
		expect(required(saved).editRevision).toBe(2);
	});
});
