import { randomUUID } from "node:crypto";

import { createProcedureClient } from "@orpc/server";
import dotenv from "dotenv";
import { inArray } from "drizzle-orm";
import { describe, expect, it } from "vitest";

import type { Context } from "../../context";

dotenv.config({
	path: "../../apps/server/.env",
});

const [{ db }, authSchema, bambiSchema, { communityRouter }] =
	await Promise.all([
		import("@bambi-app/db"),
		import("@bambi-app/db/schema/auth"),
		import("@bambi-app/db/schema/bambi"),
		import("./community"),
	]);

const { user } = authSchema;
const { bambiProfile, communityPost } = bambiSchema;

interface CommunityFixture {
	adminUserId: string;
	femaleUserId: string;
	maleUserId: string;
	otherFemaleUserId: string;
	userIds: string[];
}

const TIPTAP_BODY = JSON.stringify({
	content: [
		{
			content: [{ text: "본문입니다.", type: "text" }],
			type: "paragraph",
		},
	],
	type: "doc",
});

const basePostInput = {
	authorName: "달빛토끼",
	body: TIPTAP_BODY,
	isLocked: false,
	password: "pw1234",
};

const createContextForUser = (userId: string): Context =>
	({
		auth: null,
		session: {
			user: {
				id: userId,
			},
		},
	}) as Context;

const makeEmail = (prefix: string): string =>
	`${prefix}-${randomUUID()}@bambi.test`;

const createCommunityFixture = async (): Promise<CommunityFixture> => {
	const femaleUserId = `user_test_female_${randomUUID()}`;
	const maleUserId = `user_test_male_${randomUUID()}`;
	const adminUserId = `user_test_admin_${randomUUID()}`;
	const otherFemaleUserId = `user_test_other_female_${randomUUID()}`;
	const userIds = [femaleUserId, maleUserId, adminUserId, otherFemaleUserId];

	await db.insert(user).values([
		{ email: makeEmail("female"), id: femaleUserId, name: "여성 회원" },
		{ email: makeEmail("male"), id: maleUserId, name: "남성 회원" },
		{ email: makeEmail("admin"), id: adminUserId, name: "관리자" },
		{
			email: makeEmail("other-female"),
			id: otherFemaleUserId,
			name: "다른 여성 회원",
		},
	]);
	await db.insert(bambiProfile).values([
		{
			displayName: "달빛토끼",
			gender: "female",
			isPhoneVerified: true,
			role: "job_seeker",
			status: "active",
			userId: femaleUserId,
		},
		{
			displayName: "남성구직자",
			gender: "male",
			isPhoneVerified: true,
			role: "job_seeker",
			status: "active",
			userId: maleUserId,
		},
		{
			displayName: "운영자",
			gender: "female",
			isPhoneVerified: true,
			role: "admin",
			status: "active",
			userId: adminUserId,
		},
		{
			displayName: "별빛여우",
			gender: "female",
			isPhoneVerified: true,
			role: "job_seeker",
			status: "active",
			userId: otherFemaleUserId,
		},
	]);

	return { adminUserId, femaleUserId, maleUserId, otherFemaleUserId, userIds };
};

const cleanupCommunityFixture = async (
	fixture: CommunityFixture
): Promise<void> => {
	// community_post cascade가 댓글·좋아요를 함께 지운다.
	await db
		.delete(communityPost)
		.where(inArray(communityPost.authorUserId, fixture.userIds));
	await db
		.delete(bambiProfile)
		.where(inArray(bambiProfile.userId, fixture.userIds));
	await db.delete(user).where(inArray(user.id, fixture.userIds));
};

const clientFor = <T>(procedure: T, userId: string, path: string[]) =>
	// biome-ignore lint/suspicious/noExplicitAny: 테스트 헬퍼 — 프로시저별 제네릭 전개 생략
	createProcedureClient(procedure as any, {
		context: createContextForUser(userId),
		path: ["bambi", "community", ...path],
	});

const expectOrpcCode = async (
	promise: Promise<unknown>,
	code: string
): Promise<void> => {
	await expect(promise).rejects.toMatchObject({ code });
};

describe("bambi community router — 조회", () => {
	it("남성 구직자는 목록 조회가 FORBIDDEN으로 거부된다", async () => {
		const fixture = await createCommunityFixture();
		try {
			const listPosts = clientFor(
				communityRouter.listPosts,
				fixture.maleUserId,
				["listPosts"]
			);
			await expectOrpcCode(listPosts({ board: "free", page: 1 }), "FORBIDDEN");
		} finally {
			await cleanupCommunityFixture(fixture);
		}
	});

	it("여성 회원은 글 작성 후 목록·오버뷰·상세에서 조회할 수 있고 상세는 조회수를 올린다", async () => {
		const fixture = await createCommunityFixture();
		try {
			const createPost = clientFor(
				communityRouter.createPost,
				fixture.femaleUserId,
				["createPost"]
			);
			const listPosts = clientFor(
				communityRouter.listPosts,
				fixture.femaleUserId,
				["listPosts"]
			);
			const overview = clientFor(
				communityRouter.overview,
				fixture.femaleUserId,
				["overview"]
			);
			const getPost = clientFor(communityRouter.getPost, fixture.femaleUserId, [
				"getPost",
			]);

			const created = await createPost({
				...basePostInput,
				board: "free",
				title: `테스트 자유수다 ${randomUUID()}`,
			});

			const listed = await listPosts({ board: "free", page: 1 });
			expect(listed.pageSize).toBe(20);
			expect(
				listed.items.some((item: { id: string }) => item.id === created.id)
			).toBe(true);
			const summary = listed.items.find(
				(item: { id: string }) => item.id === created.id
			);
			expect(summary?.authorName).toBe("달빛토끼");

			const home = await overview({});
			expect(
				home.free.some((item: { id: string }) => item.id === created.id)
			).toBe(true);

			const detail = await getPost({ postId: created.id });
			expect(detail.viewCount).toBe(1);
			expect(detail.isLiked).toBe(false);
			expect(detail.canEdit).toBe(true);
			expect(detail.canDelete).toBe(true);
		} finally {
			await cleanupCommunityFixture(fixture);
		}
	});

	it("목록은 번호 페이지네이션으로 페이지 간 중복 없이 잘린다", async () => {
		const fixture = await createCommunityFixture();
		try {
			const createPost = clientFor(
				communityRouter.createPost,
				fixture.femaleUserId,
				["createPost"]
			);
			for (let index = 0; index < 25; index += 1) {
				await createPost({
					...basePostInput,
					board: "market",
					title: `페이지네이션 ${index} ${randomUUID()}`,
				});
			}
			const listPosts = clientFor(
				communityRouter.listPosts,
				fixture.femaleUserId,
				["listPosts"]
			);
			const page1 = await listPosts({ board: "market", page: 1 });
			const page2 = await listPosts({ board: "market", page: 2 });
			expect(page1.items).toHaveLength(20);
			expect(page1.totalCount).toBeGreaterThanOrEqual(25);
			const page1Ids = new Set(
				page1.items.map((item: { id: string }) => item.id)
			);
			expect(
				page2.items.some((item: { id: string }) => page1Ids.has(item.id))
			).toBe(false);
		} finally {
			await cleanupCommunityFixture(fixture);
		}
	});

	it("존재하지 않거나 삭제된 글 상세는 NOT_FOUND", async () => {
		const fixture = await createCommunityFixture();
		try {
			const getPost = clientFor(communityRouter.getPost, fixture.femaleUserId, [
				"getPost",
			]);
			await expectOrpcCode(getPost({ postId: randomUUID() }), "NOT_FOUND");
		} finally {
			await cleanupCommunityFixture(fixture);
		}
	});

	it("잠긴 글은 타인 목록에서 제목이 마스킹되고, 비밀번호로 열람할 수 있다", async () => {
		const fixture = await createCommunityFixture();
		try {
			const createPost = clientFor(
				communityRouter.createPost,
				fixture.femaleUserId,
				["createPost"]
			);
			const created = await createPost({
				...basePostInput,
				board: "free",
				isLocked: true,
				title: `비밀 제목 ${randomUUID()}`,
			});

			// admin은 실제 제목을 본다(bypass).
			const listAsAdmin = clientFor(
				communityRouter.listPosts,
				fixture.adminUserId,
				["listPosts"]
			);
			const adminList = await listAsAdmin({ board: "free", page: 1 });
			expect(
				adminList.items.find((item: { id: string }) => item.id === created.id)
					?.title
			).toContain("비밀 제목");

			const getAsOther = clientFor(
				communityRouter.getPost,
				fixture.otherFemaleUserId,
				["getPost"]
			);
			const lockedView = await getAsOther({ postId: created.id });
			expect(lockedView.locked).toBe(true);
			expect("body" in lockedView).toBe(false);

			await expectOrpcCode(
				getAsOther({ password: "wrong!", postId: created.id }),
				"FORBIDDEN"
			);

			const unlocked = await getAsOther({
				password: "pw1234",
				postId: created.id,
			});
			expect(unlocked.locked).toBe(false);
			if (unlocked.locked === false) {
				expect(unlocked.body).toBe(TIPTAP_BODY);
			}

			const listAsOther = clientFor(
				communityRouter.listPosts,
				fixture.otherFemaleUserId,
				["listPosts"]
			);
			const otherList = await listAsOther({ board: "free", page: 1 });
			expect(
				otherList.items.find((item: { id: string }) => item.id === created.id)
					?.title
			).toBe("비밀글입니다");
		} finally {
			await cleanupCommunityFixture(fixture);
		}
	});

	it("본문이 Tiptap doc JSON이 아니면 BAD_REQUEST", async () => {
		const fixture = await createCommunityFixture();
		try {
			const createPost = clientFor(
				communityRouter.createPost,
				fixture.femaleUserId,
				["createPost"]
			);
			await expectOrpcCode(
				createPost({
					...basePostInput,
					board: "free",
					body: "그냥 텍스트",
					title: `본문검증 ${randomUUID()}`,
				}),
				"BAD_REQUEST"
			);
		} finally {
			await cleanupCommunityFixture(fixture);
		}
	});
});
