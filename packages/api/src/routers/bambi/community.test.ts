import { randomUUID } from "node:crypto";

import { createProcedureClient } from "@orpc/server";
import dotenv from "dotenv";
import { eq, inArray } from "drizzle-orm";
import { describe, expect, it } from "vitest";

import type { Context } from "../../context";

dotenv.config({
	path: "../../apps/server/.env",
});

const [
	{ db },
	authSchema,
	bambiSchema,
	{ communityRouter },
	{ invalidateBannedWordCache, normalizeForMatch },
] = await Promise.all([
	import("@bambi-app/db"),
	import("@bambi-app/db/schema/auth"),
	import("@bambi-app/db/schema/bambi"),
	import("./community"),
	import("../../services/bambi-banned-words"),
]);

const { member, organization, user } = authSchema;
const {
	adPlacement,
	adProduct,
	adminModerationAction,
	bambiProfile,
	bannedWord,
	communityPost,
	jobPost,
} = bambiSchema;

interface CommunityFixture {
	adminUserId: string;
	adPlacementId: string;
	adProductId: string;
	employerUserId: string;
	femaleUserId: string;
	maleUserId: string;
	organizationId: string;
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
	const now = new Date();
	const femaleUserId = `user_test_female_${randomUUID()}`;
	const maleUserId = `user_test_male_${randomUUID()}`;
	const adminUserId = `user_test_admin_${randomUUID()}`;
	const otherFemaleUserId = `user_test_other_female_${randomUUID()}`;
	const employerUserId = `user_test_employer_${randomUUID()}`;
	const organizationId = `org_test_${randomUUID()}`;
	const userIds = [
		femaleUserId,
		maleUserId,
		adminUserId,
		otherFemaleUserId,
		employerUserId,
	];

	await db.insert(user).values([
		{ email: makeEmail("female"), id: femaleUserId, name: "여성 회원" },
		{ email: makeEmail("male"), id: maleUserId, name: "남성 회원" },
		{ email: makeEmail("admin"), id: adminUserId, name: "관리자" },
		{
			email: makeEmail("other-female"),
			id: otherFemaleUserId,
			name: "다른 여성 회원",
		},
		{ email: makeEmail("employer"), id: employerUserId, name: "업소 담당자" },
	]);
	await db.insert(bambiProfile).values([
		{
			gender: "female",
			isPhoneVerified: true,
			role: "job_seeker",
			status: "active",
			userId: femaleUserId,
		},
		{
			gender: "male",
			isPhoneVerified: true,
			role: "job_seeker",
			status: "active",
			userId: maleUserId,
		},
		{
			gender: "female",
			isPhoneVerified: true,
			role: "admin",
			status: "active",
			userId: adminUserId,
		},
		{
			gender: "female",
			isPhoneVerified: true,
			role: "job_seeker",
			status: "active",
			userId: otherFemaleUserId,
		},
		{
			isPhoneVerified: true,
			role: "employer",
			status: "active",
			userId: employerUserId,
		},
	]);

	// employer가 수다방 자격을 얻으려면 owner로 소속된 조직에 "광고 상품이 적용되고
	// published·paid이며 노출이 유효한" 공고가 있어야 한다(hasActiveAdExposure).
	// PR #29에서 판정 축이 광고 캠페인 → 광고 상품 적용 공고로 바뀌었다.
	await db.insert(organization).values({
		createdAt: now,
		id: organizationId,
		name: "수다방 광고 테스트 조직",
		slug: `community-ad-${randomUUID()}`,
	});
	await db.insert(member).values({
		createdAt: now,
		id: `member_test_${randomUUID()}`,
		organizationId,
		role: "owner",
		status: "active",
		userId: employerUserId,
	});
	const adPlacementId = randomUUID();
	const adProductId = randomUUID();
	await db.insert(adPlacement).values({
		id: adPlacementId,
		name: `community-ad-placement-${adPlacementId}`,
	});
	await db.insert(adProduct).values({
		id: adProductId,
		name: `community-ad-product-${adProductId}`,
		placementId: adPlacementId,
	});
	const jobPostId = randomUUID();
	await db.insert(jobPost).values({
		adProductId,
		createdByUserId: employerUserId,
		description: "수다방 광고 자격용 공고입니다.",
		// exposureEndsAt은 비워 둔다 — null이면 노출 무기한으로 판정된다.
		id: jobPostId,
		industryCategory: "룸싸롱",
		organizationId,
		payAmount: 180_000,
		payUnit: "일급",
		paymentStatus: "paid",
		publishedAt: now,
		region: "서울 강남구",
		status: "published",
		title: "광고 자격 공고",
		workSchedule: "20:00-02:00",
	});

	return {
		adPlacementId,
		adProductId,
		adminUserId,
		employerUserId,
		femaleUserId,
		maleUserId,
		organizationId,
		otherFemaleUserId,
		userIds,
	};
};

const cleanupCommunityFixture = async (
	fixture: CommunityFixture
): Promise<void> => {
	// 운영자 조치 감사 로그는 user(admin_user_id) FK가 RESTRICT라 사용자 삭제 전에 먼저 지운다.
	await db
		.delete(adminModerationAction)
		.where(inArray(adminModerationAction.adminUserId, fixture.userIds));
	// community_post cascade가 댓글·좋아요를 함께 지운다.
	await db
		.delete(communityPost)
		.where(inArray(communityPost.authorUserId, fixture.userIds));
	// 광고 상품·위치는 jobPost.ad_product_id가 참조하므로 공고를 먼저 지운 뒤 정리한다.
	// member도 조직 기준으로 정리한다.
	await db
		.delete(jobPost)
		.where(eq(jobPost.organizationId, fixture.organizationId));
	await db.delete(adProduct).where(eq(adProduct.id, fixture.adProductId));
	await db.delete(adPlacement).where(eq(adPlacement.id, fixture.adPlacementId));
	await db
		.delete(member)
		.where(eq(member.organizationId, fixture.organizationId));
	await db
		.delete(bambiProfile)
		.where(inArray(bambiProfile.userId, fixture.userIds));
	await db.delete(user).where(inArray(user.id, fixture.userIds));
	await db
		.delete(organization)
		.where(eq(organization.id, fixture.organizationId));
};

const clientFor = <T>(procedure: T, userId: string, path: string[]) =>
	// biome-ignore lint/suspicious/noExplicitAny: 테스트 헬퍼 — 프로시저별 제네릭 전개 생략
	createProcedureClient(procedure as any, {
		context: createContextForUser(userId),
		path: ["bambi", "community", ...path],
	});

// 비로그인 열람(public overview) 검증용 — 세션 없는 컨텍스트.
const clientForAnonymous = <T>(procedure: T, path: string[]) =>
	// biome-ignore lint/suspicious/noExplicitAny: 테스트 헬퍼 — 프로시저별 제네릭 전개 생략
	createProcedureClient(procedure as any, {
		context: { auth: null, session: null } as Context,
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

	it("미자격자·비로그인도 overview 미리보기를 볼 수 있고 비밀글 제목은 마스킹된다", async () => {
		const fixture = await createCommunityFixture();
		try {
			const createPost = clientFor(
				communityRouter.createPost,
				fixture.femaleUserId,
				["createPost"]
			);
			const openTitle = `공개글 ${randomUUID()}`;
			const open = await createPost({
				...basePostInput,
				board: "free",
				title: openTitle,
			});
			const locked = await createPost({
				...basePostInput,
				board: "free",
				isLocked: true,
				title: `비밀글 ${randomUUID()}`,
			});

			// 홈 미리보기(overview)는 자격 가드 없이 열람 가능 — 남성 구직자.
			const overviewAsMale = clientFor(
				communityRouter.overview,
				fixture.maleUserId,
				["overview"]
			);
			const maleHome = await overviewAsMale({});
			expect(
				maleHome.free.some(
					(item: { id: string; title: string }) =>
						item.id === open.id && item.title === openTitle
				)
			).toBe(true);
			expect(
				maleHome.free.find((item: { id: string }) => item.id === locked.id)
					?.title
			).toBe("비밀글입니다");

			// 비로그인(세션 없음)도 동일하게 열람되고 비밀글은 마스킹된다.
			const overviewAnonymous = clientForAnonymous(communityRouter.overview, [
				"overview",
			]);
			const anonymousHome = await overviewAnonymous({});
			expect(
				anonymousHome.free.some((item: { id: string }) => item.id === open.id)
			).toBe(true);
			expect(
				anonymousHome.free.find((item: { id: string }) => item.id === locked.id)
					?.title
			).toBe("비밀글입니다");

			// 자격자(작성자 본인)의 잠금 우회 마스킹은 그대로 유지된다.
			const overviewAsAuthor = clientFor(
				communityRouter.overview,
				fixture.femaleUserId,
				["overview"]
			);
			const authorHome = await overviewAsAuthor({});
			expect(
				authorHome.free.find((item: { id: string }) => item.id === locked.id)
					?.title
			).not.toBe("비밀글입니다");
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

	it("비밀번호 없이 잠그지 않은 글을 작성하고 타인이 비번 없이 열람한다", async () => {
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
				isLocked: false,
				password: undefined,
				title: `무비번 ${randomUUID()}`,
			});

			const getAsOther = clientFor(
				communityRouter.getPost,
				fixture.otherFemaleUserId,
				["getPost"]
			);
			const view = await getAsOther({ postId: created.id });
			expect(view.locked).toBe(false);
			if (view.locked === false) {
				expect(view.body).toBe(TIPTAP_BODY);
			}
		} finally {
			await cleanupCommunityFixture(fixture);
		}
	});

	it("비밀글(잠금)은 비밀번호 없이 작성할 수 없다", async () => {
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
					isLocked: true,
					password: undefined,
					title: `비밀무비번 ${randomUUID()}`,
				}),
				"BAD_REQUEST"
			);
		} finally {
			await cleanupCommunityFixture(fixture);
		}
	});

	it("비밀번호 없이 작성한 글은 비밀글로 잠글 수 없다", async () => {
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
				isLocked: false,
				password: undefined,
				title: `무비번 수정 ${randomUUID()}`,
			});

			const updatePost = clientFor(
				communityRouter.updatePost,
				fixture.femaleUserId,
				["updatePost"]
			);
			await expectOrpcCode(
				updatePost({
					authorName: basePostInput.authorName,
					body: basePostInput.body,
					isLocked: true,
					isPromotion: false,
					postId: created.id,
					title: `무비번 잠금시도 ${randomUUID()}`,
				}),
				"BAD_REQUEST"
			);
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

	it("응답에는 작성자 userId가 노출되지 않는다(익명성 보호)", async () => {
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
			const getPost = clientFor(communityRouter.getPost, fixture.femaleUserId, [
				"getPost",
			]);
			const createComment = clientFor(
				communityRouter.createComment,
				fixture.femaleUserId,
				["createComment"]
			);
			const listComments = clientFor(
				communityRouter.listComments,
				fixture.femaleUserId,
				["listComments"]
			);

			const created = await createPost({
				...basePostInput,
				board: "free",
				title: `익명성 ${randomUUID()}`,
			});

			const listed = await listPosts({ board: "free", page: 1 });
			const summary = listed.items.find(
				(item: { id: string }) => item.id === created.id
			);
			expect(summary && "authorUserId" in summary).toBe(false);

			const detail = await getPost({ postId: created.id });
			expect("authorUserId" in detail).toBe(false);

			await createComment({ body: "익명 댓글", postId: created.id });
			const comments = await listComments({ postId: created.id });
			expect(comments[0] && "authorUserId" in comments[0]).toBe(false);
		} finally {
			await cleanupCommunityFixture(fixture);
		}
	});

	it("hidden 상태 글은 상세가 NOT_FOUND이고 목록에 노출되지 않는다", async () => {
		const fixture = await createCommunityFixture();
		try {
			const createPost = clientFor(
				communityRouter.createPost,
				fixture.femaleUserId,
				["createPost"]
			);
			const getPost = clientFor(communityRouter.getPost, fixture.femaleUserId, [
				"getPost",
			]);
			const listPosts = clientFor(
				communityRouter.listPosts,
				fixture.femaleUserId,
				["listPosts"]
			);

			const created = await createPost({
				...basePostInput,
				board: "free",
				title: `숨김 글 ${randomUUID()}`,
			});

			// 운영 조치로 status가 hidden이 되면 published가 아니므로 조회에서 빠진다.
			await db
				.update(communityPost)
				.set({ status: "hidden" })
				.where(eq(communityPost.id, created.id));

			await expectOrpcCode(getPost({ postId: created.id }), "NOT_FOUND");
			const listed = await listPosts({ board: "free", page: 1 });
			expect(
				listed.items.some((item: { id: string }) => item.id === created.id)
			).toBe(false);
		} finally {
			await cleanupCommunityFixture(fixture);
		}
	});

	it("잠금 축소 응답에는 title이 없고 잠금 열람 실패는 viewCount를 올리지 않는다", async () => {
		const fixture = await createCommunityFixture();
		try {
			const createPost = clientFor(
				communityRouter.createPost,
				fixture.femaleUserId,
				["createPost"]
			);
			const getAsOther = clientFor(
				communityRouter.getPost,
				fixture.otherFemaleUserId,
				["getPost"]
			);
			const getAsAuthor = clientFor(
				communityRouter.getPost,
				fixture.femaleUserId,
				["getPost"]
			);

			const created = await createPost({
				...basePostInput,
				board: "free",
				isLocked: true,
				title: `잠금 마스킹 ${randomUUID()}`,
			});

			// 비번 없는 잠금 열람: 축소 응답에 title/body가 담기지 않는다(마스킹 계약).
			const lockedView = await getAsOther({ postId: created.id });
			expect(lockedView.locked).toBe(true);
			expect("title" in lockedView).toBe(false);
			expect("body" in lockedView).toBe(false);

			// 잠금 열람 실패는 열람이 아니므로 viewCount를 올리지 않는다. 작성자 본인
			// bypass 열람만 조회수를 올리므로 첫 정상 열람 값은 1이어야 한다.
			const authorView = await getAsAuthor({ postId: created.id });
			expect(authorView.locked).toBe(false);
			if (authorView.locked === false) {
				expect(authorView.viewCount).toBe(1);
			}
		} finally {
			await cleanupCommunityFixture(fixture);
		}
	});
});

const baseUpdateInput = {
	authorName: "달빛토끼",
	body: TIPTAP_BODY,
	isLocked: false,
	isPromotion: false,
};

describe("bambi community router — 글 수정·삭제", () => {
	it("admin은 비번 없이 수정할 수 없고(FORBIDDEN) 삭제만 할 수 있으며, 삭제 후 상세는 NOT_FOUND", async () => {
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
				title: `권한 테스트 ${randomUUID()}`,
			});

			const updateAsAdmin = clientFor(
				communityRouter.updatePost,
				fixture.adminUserId,
				["updatePost"]
			);
			await expectOrpcCode(
				updateAsAdmin({
					...baseUpdateInput,
					postId: created.id,
					title: "관리자 수정 시도",
				}),
				"FORBIDDEN"
			);

			const deleteAsAdmin = clientFor(
				communityRouter.deletePost,
				fixture.adminUserId,
				["deletePost"]
			);
			const deleted = await deleteAsAdmin({ postId: created.id });
			expect(deleted.id).toBe(created.id);

			const getPost = clientFor(communityRouter.getPost, fixture.femaleUserId, [
				"getPost",
			]);
			await expectOrpcCode(getPost({ postId: created.id }), "NOT_FOUND");
		} finally {
			await cleanupCommunityFixture(fixture);
		}
	});

	it("작성자는 자기 글을 수정할 수 있고 제목이 반영된다", async () => {
		const fixture = await createCommunityFixture();
		try {
			const createPost = clientFor(
				communityRouter.createPost,
				fixture.femaleUserId,
				["createPost"]
			);
			const updatePost = clientFor(
				communityRouter.updatePost,
				fixture.femaleUserId,
				["updatePost"]
			);
			const getPost = clientFor(communityRouter.getPost, fixture.femaleUserId, [
				"getPost",
			]);
			const created = await createPost({
				...basePostInput,
				board: "work_talk",
				title: `수정 테스트 ${randomUUID()}`,
			});
			const updated = await updatePost({
				...baseUpdateInput,
				postId: created.id,
				title: "수정된 제목",
			});
			expect(updated.id).toBe(created.id);

			const detail = await getPost({ postId: created.id });
			expect(detail.title).toBe("수정된 제목");
		} finally {
			await cleanupCommunityFixture(fixture);
		}
	});

	it("본문이 Tiptap doc JSON이 아니면 수정이 BAD_REQUEST", async () => {
		const fixture = await createCommunityFixture();
		try {
			const createPost = clientFor(
				communityRouter.createPost,
				fixture.femaleUserId,
				["createPost"]
			);
			const updatePost = clientFor(
				communityRouter.updatePost,
				fixture.femaleUserId,
				["updatePost"]
			);
			const created = await createPost({
				...basePostInput,
				board: "free",
				title: `수정 본문검증 ${randomUUID()}`,
			});
			await expectOrpcCode(
				updatePost({
					...baseUpdateInput,
					body: "그냥 텍스트",
					postId: created.id,
					title: "수정 시도",
				}),
				"BAD_REQUEST"
			);
		} finally {
			await cleanupCommunityFixture(fixture);
		}
	});

	it("타인도 맞는 비밀번호를 알면 글을 수정할 수 있다", async () => {
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
				title: `타인 수정 ${randomUUID()}`,
			});

			const updateAsOther = clientFor(
				communityRouter.updatePost,
				fixture.otherFemaleUserId,
				["updatePost"]
			);
			await expectOrpcCode(
				updateAsOther({
					...baseUpdateInput,
					postId: created.id,
					title: "비번 없는 수정",
				}),
				"FORBIDDEN"
			);
			const updated = await updateAsOther({
				...baseUpdateInput,
				password: "pw1234",
				postId: created.id,
				title: "비번으로 수정됨",
			});
			expect(updated.id).toBe(created.id);

			const getPost = clientFor(communityRouter.getPost, fixture.femaleUserId, [
				"getPost",
			]);
			const detail = await getPost({ postId: created.id });
			expect(detail.title).toBe("비번으로 수정됨");
		} finally {
			await cleanupCommunityFixture(fixture);
		}
	});

	it("타인은 틀린 비번으로 삭제할 수 없고(FORBIDDEN) 맞는 비번으로는 삭제할 수 있다", async () => {
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
				title: `타인 삭제 ${randomUUID()}`,
			});

			const deleteAsOther = clientFor(
				communityRouter.deletePost,
				fixture.otherFemaleUserId,
				["deletePost"]
			);
			await expectOrpcCode(
				deleteAsOther({ password: "wrong!", postId: created.id }),
				"FORBIDDEN"
			);
			const deleted = await deleteAsOther({
				password: "pw1234",
				postId: created.id,
			});
			expect(deleted.id).toBe(created.id);

			const getPost = clientFor(communityRouter.getPost, fixture.femaleUserId, [
				"getPost",
			]);
			await expectOrpcCode(getPost({ postId: created.id }), "NOT_FOUND");
		} finally {
			await cleanupCommunityFixture(fixture);
		}
	});
});

describe("bambi community router — 추천·댓글", () => {
	it("추천 토글은 왕복하고 likeCount 캐시를 증감한다", async () => {
		const fixture = await createCommunityFixture();
		try {
			const createPost = clientFor(
				communityRouter.createPost,
				fixture.femaleUserId,
				["createPost"]
			);
			const toggleLike = clientFor(
				communityRouter.toggleLike,
				fixture.adminUserId,
				["toggleLike"]
			);
			const created = await createPost({
				...basePostInput,
				board: "free",
				title: `추천 테스트 ${randomUUID()}`,
			});

			const liked = await toggleLike({ postId: created.id });
			expect(liked).toEqual({ isLiked: true, likeCount: 1 });
			const unliked = await toggleLike({ postId: created.id });
			expect(unliked).toEqual({ isLiked: false, likeCount: 0 });
		} finally {
			await cleanupCommunityFixture(fixture);
		}
	});

	it("추천된 글은 베스트 목록에 나타난다", async () => {
		const fixture = await createCommunityFixture();
		try {
			const createPost = clientFor(
				communityRouter.createPost,
				fixture.femaleUserId,
				["createPost"]
			);
			const toggleLike = clientFor(
				communityRouter.toggleLike,
				fixture.adminUserId,
				["toggleLike"]
			);
			const listPosts = clientFor(
				communityRouter.listPosts,
				fixture.femaleUserId,
				["listPosts"]
			);
			const created = await createPost({
				...basePostInput,
				board: "free",
				title: `베스트 테스트 ${randomUUID()}`,
			});
			await toggleLike({ postId: created.id });

			const best = await listPosts({ board: "best", page: 1 });
			expect(
				best.items.some((item: { id: string }) => item.id === created.id)
			).toBe(true);
		} finally {
			await cleanupCommunityFixture(fixture);
		}
	});

	it("댓글 작성·삭제가 commentCount 캐시를 증감하고 남의 댓글 삭제는 거부된다", async () => {
		const fixture = await createCommunityFixture();
		try {
			const createPost = clientFor(
				communityRouter.createPost,
				fixture.femaleUserId,
				["createPost"]
			);
			const createComment = clientFor(
				communityRouter.createComment,
				fixture.adminUserId,
				["createComment"]
			);
			const listComments = clientFor(
				communityRouter.listComments,
				fixture.femaleUserId,
				["listComments"]
			);
			const deleteAsOther = clientFor(
				communityRouter.deleteComment,
				fixture.femaleUserId,
				["deleteComment"]
			);
			const deleteAsAuthor = clientFor(
				communityRouter.deleteComment,
				fixture.adminUserId,
				["deleteComment"]
			);
			const getPost = clientFor(communityRouter.getPost, fixture.femaleUserId, [
				"getPost",
			]);

			const created = await createPost({
				...basePostInput,
				board: "market",
				title: `댓글 테스트 ${randomUUID()}`,
			});
			const comment = await createComment({
				body: "첫 댓글입니다.",
				postId: created.id,
			});

			const afterCreate = await getPost({ postId: created.id });
			expect(afterCreate.commentCount).toBe(1);
			const comments = await listComments({ postId: created.id });
			expect(comments).toHaveLength(1);
			expect(comments[0]?.canDelete).toBe(false);

			// femaleUser는 admin의 댓글을 지울 수 없다(글 작성자여도 불가).
			await expectOrpcCode(
				deleteAsOther({ commentId: comment.id }),
				"FORBIDDEN"
			);
			await deleteAsAuthor({ commentId: comment.id });

			const afterDelete = await getPost({ postId: created.id });
			expect(afterDelete.commentCount).toBe(0);
			expect(await listComments({ postId: created.id })).toHaveLength(0);
		} finally {
			await cleanupCommunityFixture(fixture);
		}
	});

	it("잠긴 글의 댓글은 비번 없이 조회할 수 없고 맞는 비번으로 조회된다", async () => {
		const fixture = await createCommunityFixture();
		try {
			const createPost = clientFor(
				communityRouter.createPost,
				fixture.femaleUserId,
				["createPost"]
			);
			const listAsOther = clientFor(
				communityRouter.listComments,
				fixture.otherFemaleUserId,
				["listComments"]
			);
			const created = await createPost({
				...basePostInput,
				board: "free",
				isLocked: true,
				title: `잠긴 댓글 ${randomUUID()}`,
			});

			await expectOrpcCode(listAsOther({ postId: created.id }), "FORBIDDEN");
			const comments = await listAsOther({
				password: "pw1234",
				postId: created.id,
			});
			expect(comments).toHaveLength(0);
		} finally {
			await cleanupCommunityFixture(fixture);
		}
	});
});

describe("bambi community router — 대댓글", () => {
	it("대댓글을 달 수 있고 listComments가 parentCommentId를 내려준다", async () => {
		const fixture = await createCommunityFixture();
		try {
			const createPost = clientFor(
				communityRouter.createPost,
				fixture.femaleUserId,
				["createPost"]
			);
			const createComment = clientFor(
				communityRouter.createComment,
				fixture.femaleUserId,
				["createComment"]
			);
			const replyAsAdmin = clientFor(
				communityRouter.createComment,
				fixture.adminUserId,
				["createComment"]
			);
			const listComments = clientFor(
				communityRouter.listComments,
				fixture.femaleUserId,
				["listComments"]
			);
			const getPost = clientFor(communityRouter.getPost, fixture.femaleUserId, [
				"getPost",
			]);

			const created = await createPost({
				...basePostInput,
				board: "free",
				title: `대댓글 ${randomUUID()}`,
			});
			const parent = await createComment({
				body: "부모 댓글",
				postId: created.id,
			});
			const reply = await replyAsAdmin({
				body: "답글입니다",
				parentCommentId: parent.id,
				postId: created.id,
			});

			// 대댓글 작성도 commentCount 캐시를 +1 한다.
			const afterReply = await getPost({ postId: created.id });
			expect(afterReply.commentCount).toBe(2);

			const comments = await listComments({ postId: created.id });
			expect(comments).toHaveLength(2);
			const parentItem = comments.find(
				(item: { id: string }) => item.id === parent.id
			);
			const replyItem = comments.find(
				(item: { id: string }) => item.id === reply.id
			);
			expect(parentItem?.parentCommentId).toBeNull();
			expect(parentItem?.isDeleted).toBe(false);
			expect(replyItem?.parentCommentId).toBe(parent.id);
			expect(replyItem?.isDeleted).toBe(false);
		} finally {
			await cleanupCommunityFixture(fixture);
		}
	});

	it("대댓글에 다시 답글을 달면 BAD_REQUEST, 다른 글의 댓글을 부모로 지정하면 NOT_FOUND", async () => {
		const fixture = await createCommunityFixture();
		try {
			const createPost = clientFor(
				communityRouter.createPost,
				fixture.femaleUserId,
				["createPost"]
			);
			const createComment = clientFor(
				communityRouter.createComment,
				fixture.femaleUserId,
				["createComment"]
			);

			const postA = await createPost({
				...basePostInput,
				board: "free",
				title: `대댓글 제한 A ${randomUUID()}`,
			});
			const postB = await createPost({
				...basePostInput,
				board: "free",
				title: `대댓글 제한 B ${randomUUID()}`,
			});
			const parent = await createComment({
				body: "부모 댓글",
				postId: postA.id,
			});
			const reply = await createComment({
				body: "답글",
				parentCommentId: parent.id,
				postId: postA.id,
			});

			// 대댓글에 다시 답글 → BAD_REQUEST (1단계 제한).
			await expectOrpcCode(
				createComment({
					body: "답글의 답글",
					parentCommentId: reply.id,
					postId: postA.id,
				}),
				"BAD_REQUEST"
			);

			// 다른 글의 댓글을 부모로 지정 → NOT_FOUND.
			await expectOrpcCode(
				createComment({
					body: "타 글 부모",
					parentCommentId: parent.id,
					postId: postB.id,
				}),
				"NOT_FOUND"
			);

			// 존재하지 않는 부모 → NOT_FOUND.
			await expectOrpcCode(
				createComment({
					body: "없는 부모",
					parentCommentId: randomUUID(),
					postId: postA.id,
				}),
				"NOT_FOUND"
			);
		} finally {
			await cleanupCommunityFixture(fixture);
		}
	});

	it("부모 댓글 삭제 후에도 published 대댓글이 있으면 부모가 isDeleted 플레이스홀더로 남는다", async () => {
		const fixture = await createCommunityFixture();
		try {
			const createPost = clientFor(
				communityRouter.createPost,
				fixture.femaleUserId,
				["createPost"]
			);
			const createComment = clientFor(
				communityRouter.createComment,
				fixture.femaleUserId,
				["createComment"]
			);
			const replyAsAdmin = clientFor(
				communityRouter.createComment,
				fixture.adminUserId,
				["createComment"]
			);
			const deleteAsAuthor = clientFor(
				communityRouter.deleteComment,
				fixture.femaleUserId,
				["deleteComment"]
			);
			const deleteReplyAsAdmin = clientFor(
				communityRouter.deleteComment,
				fixture.adminUserId,
				["deleteComment"]
			);
			const listComments = clientFor(
				communityRouter.listComments,
				fixture.femaleUserId,
				["listComments"]
			);

			const created = await createPost({
				...basePostInput,
				board: "free",
				title: `플레이스홀더 ${randomUUID()}`,
			});
			const parent = await createComment({
				body: "부모 댓글",
				postId: created.id,
			});
			const reply = await replyAsAdmin({
				body: "답글입니다",
				parentCommentId: parent.id,
				postId: created.id,
			});

			// 부모 삭제 → published 답글이 있으므로 플레이스홀더로 남는다.
			await deleteAsAuthor({ commentId: parent.id });
			const afterParentDelete = await listComments({ postId: created.id });
			expect(afterParentDelete).toHaveLength(2);
			const placeholder = afterParentDelete.find(
				(item: { id: string }) => item.id === parent.id
			);
			expect(placeholder?.isDeleted).toBe(true);
			expect(placeholder?.body).toBe("");
			expect(placeholder?.authorName).toBeNull();
			expect(placeholder?.canDelete).toBe(false);
			expect(
				afterParentDelete.some((item: { id: string }) => item.id === reply.id)
			).toBe(true);

			// 자식까지 삭제 → 부모 플레이스홀더도 사라진다.
			await deleteReplyAsAdmin({ commentId: reply.id });
			const afterAllDelete = await listComments({ postId: created.id });
			expect(afterAllDelete).toHaveLength(0);
		} finally {
			await cleanupCommunityFixture(fixture);
		}
	});
});

describe("bambi community router — 댓글 수정", () => {
	it("작성자 본인은 댓글을 수정할 수 있고 canEdit=true로 노출된다", async () => {
		const fixture = await createCommunityFixture();
		try {
			const createPost = clientFor(
				communityRouter.createPost,
				fixture.femaleUserId,
				["createPost"]
			);
			const createComment = clientFor(
				communityRouter.createComment,
				fixture.femaleUserId,
				["createComment"]
			);
			const updateComment = clientFor(
				communityRouter.updateComment,
				fixture.femaleUserId,
				["updateComment"]
			);
			const listComments = clientFor(
				communityRouter.listComments,
				fixture.femaleUserId,
				["listComments"]
			);

			const created = await createPost({
				...basePostInput,
				board: "free",
				title: `댓글 수정 ${randomUUID()}`,
			});
			const comment = await createComment({
				body: "원래 댓글",
				postId: created.id,
			});

			const updated = await updateComment({
				body: "수정된 댓글",
				commentId: comment.id,
			});
			expect(updated.id).toBe(comment.id);

			const comments = await listComments({ postId: created.id });
			const item = comments.find(
				(entry: { id: string }) => entry.id === comment.id
			);
			expect(item?.body).toBe("수정된 댓글");
			expect(item?.canEdit).toBe(true);
		} finally {
			await cleanupCommunityFixture(fixture);
		}
	});

	it("타인(비작성자)은 댓글을 수정할 수 없다(FORBIDDEN)", async () => {
		const fixture = await createCommunityFixture();
		try {
			const createPost = clientFor(
				communityRouter.createPost,
				fixture.femaleUserId,
				["createPost"]
			);
			const createComment = clientFor(
				communityRouter.createComment,
				fixture.femaleUserId,
				["createComment"]
			);
			const updateAsAdmin = clientFor(
				communityRouter.updateComment,
				fixture.adminUserId,
				["updateComment"]
			);
			const listComments = clientFor(
				communityRouter.listComments,
				fixture.adminUserId,
				["listComments"]
			);

			const created = await createPost({
				...basePostInput,
				board: "free",
				title: `댓글 수정 권한 ${randomUUID()}`,
			});
			const comment = await createComment({
				body: "구직자 댓글",
				postId: created.id,
			});

			// admin이라도 타인 댓글은 수정할 수 없다(canEdit도 false).
			const comments = await listComments({ postId: created.id });
			const item = comments.find(
				(entry: { id: string }) => entry.id === comment.id
			);
			expect(item?.canEdit).toBe(false);

			await expectOrpcCode(
				updateAsAdmin({ body: "관리자 수정 시도", commentId: comment.id }),
				"FORBIDDEN"
			);
		} finally {
			await cleanupCommunityFixture(fixture);
		}
	});

	it("삭제된 댓글은 수정할 수 없다(NOT_FOUND)", async () => {
		const fixture = await createCommunityFixture();
		try {
			const createPost = clientFor(
				communityRouter.createPost,
				fixture.femaleUserId,
				["createPost"]
			);
			const createComment = clientFor(
				communityRouter.createComment,
				fixture.femaleUserId,
				["createComment"]
			);
			const deleteComment = clientFor(
				communityRouter.deleteComment,
				fixture.femaleUserId,
				["deleteComment"]
			);
			const updateComment = clientFor(
				communityRouter.updateComment,
				fixture.femaleUserId,
				["updateComment"]
			);

			const created = await createPost({
				...basePostInput,
				board: "free",
				title: `삭제 댓글 수정 ${randomUUID()}`,
			});
			const comment = await createComment({
				body: "삭제될 댓글",
				postId: created.id,
			});
			await deleteComment({ commentId: comment.id });

			await expectOrpcCode(
				updateComment({ body: "삭제 후 수정", commentId: comment.id }),
				"NOT_FOUND"
			);
		} finally {
			await cleanupCommunityFixture(fixture);
		}
	});
});

describe("bambi community router — 계정유형·광고글·필터·공지사항", () => {
	it("업소회원은 광고글을 표시할 수 있고 목록에 authorRole·isPromotion이 스냅샷된다", async () => {
		const fixture = await createCommunityFixture();
		try {
			const createAsEmployer = clientFor(
				communityRouter.createPost,
				fixture.employerUserId,
				["createPost"]
			);
			const createAsSeeker = clientFor(
				communityRouter.createPost,
				fixture.femaleUserId,
				["createPost"]
			);
			const listPosts = clientFor(
				communityRouter.listPosts,
				fixture.employerUserId,
				["listPosts"]
			);

			const promoted = await createAsEmployer({
				...basePostInput,
				board: "market",
				isPromotion: true,
				title: `광고글 ${randomUUID()}`,
			});

			const listed = await listPosts({ board: "market", page: 1 });
			const summary = listed.items.find(
				(item: { id: string }) => item.id === promoted.id
			);
			expect(summary?.isPromotion).toBe(true);
			expect(summary?.authorRole).toBe("employer");

			// 구직자(job_seeker)는 광고글을 표시할 수 없다.
			await expectOrpcCode(
				createAsSeeker({
					...basePostInput,
					board: "market",
					isPromotion: true,
					title: `구직자 광고 시도 ${randomUUID()}`,
				}),
				"BAD_REQUEST"
			);
		} finally {
			await cleanupCommunityFixture(fixture);
		}
	});

	it("광고·업소 필터 토글이 합집합(OR)으로 해당 글만 반환한다", async () => {
		const fixture = await createCommunityFixture();
		try {
			const createAsEmployer = clientFor(
				communityRouter.createPost,
				fixture.employerUserId,
				["createPost"]
			);
			const createAsSeeker = clientFor(
				communityRouter.createPost,
				fixture.femaleUserId,
				["createPost"]
			);
			const listPosts = clientFor(
				communityRouter.listPosts,
				fixture.employerUserId,
				["listPosts"]
			);

			// 광고글(업소+광고) · 광고 아닌 업소글 · 구직자 일반글 3종으로 합집합/제외를 검증한다.
			const promoted = await createAsEmployer({
				...basePostInput,
				board: "work_talk",
				isPromotion: true,
				title: `필터 광고 ${randomUUID()}`,
			});
			const employerPlain = await createAsEmployer({
				...basePostInput,
				board: "work_talk",
				title: `필터 업소일반 ${randomUUID()}`,
			});
			const general = await createAsSeeker({
				...basePostInput,
				board: "work_talk",
				title: `필터 일반 ${randomUUID()}`,
			});

			const idsOf = (list: { items: { id: string }[] }): string[] =>
				list.items.map((item) => item.id);

			const all = await listPosts({ board: "work_talk", page: 1 });
			const promotion = await listPosts({
				board: "work_talk",
				page: 1,
				showPromotion: true,
			});
			const employerList = await listPosts({
				board: "work_talk",
				page: 1,
				showEmployer: true,
			});
			const union = await listPosts({
				board: "work_talk",
				page: 1,
				showEmployer: true,
				showPromotion: true,
			});

			// 전체(토글 off)는 세 글을 모두 포함한다.
			expect(idsOf(all)).toEqual(
				expect.arrayContaining([promoted.id, employerPlain.id, general.id])
			);

			// 광고 글보기: is_promotion=true만.
			expect(
				promotion.items.every(
					(item: { isPromotion: boolean }) => item.isPromotion === true
				)
			).toBe(true);
			expect(idsOf(promotion)).toContain(promoted.id);
			expect(idsOf(promotion)).not.toContain(employerPlain.id);
			expect(idsOf(promotion)).not.toContain(general.id);

			// 업소 회원 글보기: author_role=employer만(광고 여부 무관).
			expect(
				employerList.items.every(
					(item: { authorRole: string }) => item.authorRole === "employer"
				)
			).toBe(true);
			expect(idsOf(employerList)).toEqual(
				expect.arrayContaining([promoted.id, employerPlain.id])
			);
			expect(idsOf(employerList)).not.toContain(general.id);

			// 둘 다 켜면 합집합(광고 또는 업소) — 업소 일반글까지 포함, 구직자 일반글은 제외.
			expect(idsOf(union)).toEqual(
				expect.arrayContaining([promoted.id, employerPlain.id])
			);
			expect(idsOf(union)).not.toContain(general.id);
			expect(
				union.items.every(
					(item: { authorRole: string; isPromotion: boolean }) =>
						item.isPromotion === true || item.authorRole === "employer"
				)
			).toBe(true);
		} finally {
			await cleanupCommunityFixture(fixture);
		}
	});

	it("공지사항은 운영자만 작성할 수 있고 overview.notice에 노출된다", async () => {
		const fixture = await createCommunityFixture();
		try {
			const createAsSeeker = clientFor(
				communityRouter.createPost,
				fixture.femaleUserId,
				["createPost"]
			);
			const createAsAdmin = clientFor(
				communityRouter.createPost,
				fixture.adminUserId,
				["createPost"]
			);
			const overview = clientFor(
				communityRouter.overview,
				fixture.femaleUserId,
				["overview"]
			);

			await expectOrpcCode(
				createAsSeeker({
					...basePostInput,
					board: "notice",
					title: `구직자 공지 시도 ${randomUUID()}`,
				}),
				"FORBIDDEN"
			);

			const notice = await createAsAdmin({
				...basePostInput,
				board: "notice",
				title: `공지 ${randomUUID()}`,
			});

			const home = await overview({});
			expect(
				home.notice.some((item: { id: string }) => item.id === notice.id)
			).toBe(true);
			// 공지는 베스트 큐레이션에서 제외된다(추천 조건과 무관하게).
			expect(
				home.best.some((item: { id: string }) => item.id === notice.id)
			).toBe(false);
		} finally {
			await cleanupCommunityFixture(fixture);
		}
	});

	it("30일 내 공지에 좋아요가 있어도 best 목록·overview.best에서 제외된다", async () => {
		const fixture = await createCommunityFixture();
		try {
			const createAsAdmin = clientFor(
				communityRouter.createPost,
				fixture.adminUserId,
				["createPost"]
			);
			const toggleLike = clientFor(
				communityRouter.toggleLike,
				fixture.femaleUserId,
				["toggleLike"]
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

			const notice = await createAsAdmin({
				...basePostInput,
				board: "notice",
				title: `공지 좋아요 ${randomUUID()}`,
			});
			// 별도 유저가 좋아요를 눌러 likeCount>=1·30일 내 조건을 모두 충족시킨다.
			const liked = await toggleLike({ postId: notice.id });
			expect(liked).toEqual({ isLiked: true, likeCount: 1 });

			// 그럼에도 ne(board,notice)로 베스트에서 빠진다(like 0이 아닌 실증 경로).
			const best = await listPosts({ board: "best", page: 1 });
			expect(
				best.items.some((item: { id: string }) => item.id === notice.id)
			).toBe(false);
			const home = await overview({});
			expect(
				home.best.some((item: { id: string }) => item.id === notice.id)
			).toBe(false);
		} finally {
			await cleanupCommunityFixture(fixture);
		}
	});

	it("댓글 아이템에 authorRole이 동봉된다", async () => {
		const fixture = await createCommunityFixture();
		try {
			const createPost = clientFor(
				communityRouter.createPost,
				fixture.femaleUserId,
				["createPost"]
			);
			const commentAsAdmin = clientFor(
				communityRouter.createComment,
				fixture.adminUserId,
				["createComment"]
			);
			const commentAsSeeker = clientFor(
				communityRouter.createComment,
				fixture.femaleUserId,
				["createComment"]
			);
			const listComments = clientFor(
				communityRouter.listComments,
				fixture.femaleUserId,
				["listComments"]
			);

			const created = await createPost({
				...basePostInput,
				board: "free",
				title: `댓글 신분 ${randomUUID()}`,
			});
			const adminComment = await commentAsAdmin({
				body: "운영자 댓글",
				postId: created.id,
			});
			const seekerComment = await commentAsSeeker({
				body: "구직자 댓글",
				postId: created.id,
			});

			const comments = await listComments({ postId: created.id });
			const adminItem = comments.find(
				(item: { id: string }) => item.id === adminComment.id
			);
			const seekerItem = comments.find(
				(item: { id: string }) => item.id === seekerComment.id
			);
			expect(adminItem?.authorRole).toBe("admin");
			expect(seekerItem?.authorRole).toBe("job_seeker");
		} finally {
			await cleanupCommunityFixture(fixture);
		}
	});
});

describe("bambi community router — 운영자 조치(admin)", () => {
	it("admin이 글을 hidden 처리하면 목록·상세에서 사라지고 감사 로그가 남는다", async () => {
		const fixture = await createCommunityFixture();
		try {
			const createPost = clientFor(
				communityRouter.createPost,
				fixture.femaleUserId,
				["createPost"]
			);
			const setPostStatusByAdmin = clientFor(
				communityRouter.setPostStatusByAdmin,
				fixture.adminUserId,
				["setPostStatusByAdmin"]
			);
			const listPosts = clientFor(
				communityRouter.listPosts,
				fixture.femaleUserId,
				["listPosts"]
			);
			const getPost = clientFor(communityRouter.getPost, fixture.femaleUserId, [
				"getPost",
			]);

			const created = await createPost({
				...basePostInput,
				board: "free",
				title: `운영 숨김 ${randomUUID()}`,
			});

			const result = await setPostStatusByAdmin({
				postId: created.id,
				reason: "정책 위반으로 숨김 처리합니다.",
				status: "hidden",
			});
			expect(result).toEqual({ id: created.id, status: "hidden" });

			await expectOrpcCode(getPost({ postId: created.id }), "NOT_FOUND");
			const listed = await listPosts({ board: "free", page: 1 });
			expect(
				listed.items.some((item: { id: string }) => item.id === created.id)
			).toBe(false);

			const actions = await db
				.select()
				.from(adminModerationAction)
				.where(eq(adminModerationAction.targetId, created.id));
			expect(actions).toHaveLength(1);
			expect(actions[0]).toMatchObject({
				action: "set_community_post_status:hidden",
				reason: "정책 위반으로 숨김 처리합니다.",
				targetType: "community_post",
			});
		} finally {
			await cleanupCommunityFixture(fixture);
		}
	});

	it("admin이 hidden 글을 published로 복구하면 다시 노출된다", async () => {
		const fixture = await createCommunityFixture();
		try {
			const createPost = clientFor(
				communityRouter.createPost,
				fixture.femaleUserId,
				["createPost"]
			);
			const setPostStatusByAdmin = clientFor(
				communityRouter.setPostStatusByAdmin,
				fixture.adminUserId,
				["setPostStatusByAdmin"]
			);
			const listPosts = clientFor(
				communityRouter.listPosts,
				fixture.femaleUserId,
				["listPosts"]
			);
			const getPost = clientFor(communityRouter.getPost, fixture.femaleUserId, [
				"getPost",
			]);

			const created = await createPost({
				...basePostInput,
				board: "free",
				title: `복구 ${randomUUID()}`,
			});
			await setPostStatusByAdmin({
				postId: created.id,
				reason: "임시 숨김",
				status: "hidden",
			});

			const restored = await setPostStatusByAdmin({
				postId: created.id,
				reason: "오조치 복구합니다.",
				status: "published",
			});
			expect(restored).toEqual({ id: created.id, status: "published" });

			const detail = await getPost({ postId: created.id });
			expect(detail.id).toBe(created.id);
			const listed = await listPosts({ board: "free", page: 1 });
			expect(
				listed.items.some((item: { id: string }) => item.id === created.id)
			).toBe(true);
		} finally {
			await cleanupCommunityFixture(fixture);
		}
	});

	it("비admin의 운영자 조치는 FORBIDDEN, 없는 글은 NOT_FOUND", async () => {
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
				title: `권한 ${randomUUID()}`,
			});

			const setAsSeeker = clientFor(
				communityRouter.setPostStatusByAdmin,
				fixture.femaleUserId,
				["setPostStatusByAdmin"]
			);
			await expectOrpcCode(
				setAsSeeker({
					postId: created.id,
					reason: "비관리자 시도",
					status: "hidden",
				}),
				"FORBIDDEN"
			);

			const setAsAdmin = clientFor(
				communityRouter.setPostStatusByAdmin,
				fixture.adminUserId,
				["setPostStatusByAdmin"]
			);
			await expectOrpcCode(
				setAsAdmin({
					postId: randomUUID(),
					reason: "없는 글 조치",
					status: "hidden",
				}),
				"NOT_FOUND"
			);
		} finally {
			await cleanupCommunityFixture(fixture);
		}
	});

	it("admin이 댓글을 hidden 처리하면 마스킹되고 commentCount가 감소·복구된다", async () => {
		const fixture = await createCommunityFixture();
		try {
			const createPost = clientFor(
				communityRouter.createPost,
				fixture.femaleUserId,
				["createPost"]
			);
			const createComment = clientFor(
				communityRouter.createComment,
				fixture.femaleUserId,
				["createComment"]
			);
			const replyAsAdmin = clientFor(
				communityRouter.createComment,
				fixture.adminUserId,
				["createComment"]
			);
			const setCommentStatusByAdmin = clientFor(
				communityRouter.setCommentStatusByAdmin,
				fixture.adminUserId,
				["setCommentStatusByAdmin"]
			);
			const listComments = clientFor(
				communityRouter.listComments,
				fixture.femaleUserId,
				["listComments"]
			);
			const getPost = clientFor(communityRouter.getPost, fixture.femaleUserId, [
				"getPost",
			]);

			const created = await createPost({
				...basePostInput,
				board: "free",
				title: `댓글 숨김 ${randomUUID()}`,
			});
			// 부모+대댓글 → 부모를 숨기면 스레드 유지를 위해 플레이스홀더로 남아 마스킹을 직접 검증한다.
			const parent = await createComment({
				body: "부적절 부모 댓글",
				postId: created.id,
			});
			const reply = await replyAsAdmin({
				body: "답글입니다",
				parentCommentId: parent.id,
				postId: created.id,
			});
			expect((await getPost({ postId: created.id })).commentCount).toBe(2);

			const result = await setCommentStatusByAdmin({
				commentId: parent.id,
				reason: "부적절 댓글 숨김",
				status: "hidden",
			});
			expect(result).toEqual({ id: parent.id, status: "hidden" });

			const comments = await listComments({ postId: created.id });
			const placeholder = comments.find(
				(item: { id: string }) => item.id === parent.id
			);
			expect(placeholder?.isDeleted).toBe(true);
			expect(placeholder?.body).toBe("");
			expect(placeholder?.authorName).toBeNull();
			expect(
				comments.some((item: { id: string }) => item.id === reply.id)
			).toBe(true);
			expect((await getPost({ postId: created.id })).commentCount).toBe(1);

			// 감사 로그 확인.
			const actions = await db
				.select()
				.from(adminModerationAction)
				.where(eq(adminModerationAction.targetId, parent.id));
			expect(actions[0]).toMatchObject({
				action: "set_community_comment_status:hidden",
				targetType: "community_comment",
			});

			// 복구 시 다시 노출되고 commentCount가 회복된다.
			await setCommentStatusByAdmin({
				commentId: parent.id,
				reason: "복구합니다.",
				status: "published",
			});
			const restored = await listComments({ postId: created.id });
			const item = restored.find(
				(entry: { id: string }) => entry.id === parent.id
			);
			expect(item?.body).toBe("부적절 부모 댓글");
			expect(item?.isDeleted).toBe(false);
			expect((await getPost({ postId: created.id })).commentCount).toBe(2);
		} finally {
			await cleanupCommunityFixture(fixture);
		}
	});
});

describe("bambi community router — 본문 이미지 업로드 인텐트", () => {
	const imageInput = {
		byteSize: 256_000,
		fileName: "photo.jpg",
		mimeType: "image/jpeg",
	};

	it("여성 회원은 본인 userId 네임스페이스의 업로드 인텐트를 받는다", async () => {
		const fixture = await createCommunityFixture();
		try {
			const createMediaUpload = clientFor(
				communityRouter.createMediaUpload,
				fixture.femaleUserId,
				["createMediaUpload"]
			);

			const intent = await createMediaUpload(imageInput);

			// 키는 서버가 정한다 — 입력에 userId가 없으므로 세션 주인 외의 경로는 나올 수 없다.
			const prefix = `bambi-editor-media/${fixture.femaleUserId}/`;
			expect(intent.storageKey.startsWith(prefix)).toBe(true);
			expect(intent.mimeType).toBe("image/jpeg");
		} finally {
			await cleanupCommunityFixture(fixture);
		}
	});

	// 운영자 FAQ 답변 에디터가 이 프로시저를 그대로 재사용한다. 수다방 자격 규칙이 바뀌어
	// admin이 빠지면 FAQ 이미지 업로드가 조용히 죽으므로 여기서 먼저 터지게 못 박는다.
	it("admin도 업로드 인텐트를 받는다(운영자 FAQ 답변 에디터가 공유하는 경로)", async () => {
		const fixture = await createCommunityFixture();
		try {
			const createMediaUpload = clientFor(
				communityRouter.createMediaUpload,
				fixture.adminUserId,
				["createMediaUpload"]
			);

			const intent = await createMediaUpload(imageInput);

			const prefix = `bambi-editor-media/${fixture.adminUserId}/`;
			expect(intent.storageKey.startsWith(prefix)).toBe(true);
		} finally {
			await cleanupCommunityFixture(fixture);
		}
	});

	it("수다방 자격이 없는 남성 구직자는 FORBIDDEN으로 거부된다", async () => {
		const fixture = await createCommunityFixture();
		try {
			const createMediaUpload = clientFor(
				communityRouter.createMediaUpload,
				fixture.maleUserId,
				["createMediaUpload"]
			);

			await expectOrpcCode(createMediaUpload(imageInput), "FORBIDDEN");
		} finally {
			await cleanupCommunityFixture(fixture);
		}
	});

	it("허용되지 않은 MIME 타입은 인텐트 발급 전에 BAD_REQUEST로 막힌다", async () => {
		const fixture = await createCommunityFixture();
		try {
			const createMediaUpload = clientFor(
				communityRouter.createMediaUpload,
				fixture.femaleUserId,
				["createMediaUpload"]
			);

			await expectOrpcCode(
				createMediaUpload({ ...imageInput, mimeType: "application/pdf" }),
				"BAD_REQUEST"
			);
		} finally {
			await cleanupCommunityFixture(fixture);
		}
	});
});

describe("bambi community router — 금칙어", () => {
	const bodyWith = (text: string): string =>
		JSON.stringify({
			content: [{ content: [{ text, type: "text" }], type: "paragraph" }],
			type: "doc",
		});

	it("금칙어가 포함된 본문·댓글은 BAD_REQUEST로 차단된다", async () => {
		const fixture = await createCommunityFixture();
		const term = `금칙${randomUUID().slice(0, 8)}`;
		await db.insert(bannedWord).values({
			createdByUserId: fixture.adminUserId,
			normalizedTerm: normalizeForMatch(term),
			term,
		});
		invalidateBannedWordCache();

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
					body: bodyWith(`${term} 포함 본문`),
					title: `정상 제목 ${randomUUID()}`,
				}),
				"BAD_REQUEST"
			);
			// 제목만 걸려도 차단된다.
			await expectOrpcCode(
				createPost({
					...basePostInput,
					board: "free",
					title: `제목에 ${term} 포함`,
				}),
				"BAD_REQUEST"
			);

			// 정상 글에 다는 금칙어 댓글도 같은 코드로 차단된다.
			const created = await createPost({
				...basePostInput,
				board: "free",
				title: `댓글 금칙어 ${randomUUID()}`,
			});
			const createComment = clientFor(
				communityRouter.createComment,
				fixture.femaleUserId,
				["createComment"]
			);
			await expectOrpcCode(
				createComment({ body: `${term} 댓글`, postId: created.id }),
				"BAD_REQUEST"
			);
			// 차단된 댓글은 부분 저장되지 않는다(commentCount 캐시 무변).
			const getPost = clientFor(communityRouter.getPost, fixture.femaleUserId, [
				"getPost",
			]);
			expect((await getPost({ postId: created.id })).commentCount).toBe(0);
		} finally {
			await db.delete(bannedWord).where(eq(bannedWord.term, term));
			invalidateBannedWordCache();
			await cleanupCommunityFixture(fixture);
		}
	});

	it("금칙어가 없는 정상 글·댓글은 그대로 게시된다", async () => {
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
				body: bodyWith("주말 근무 문의드립니다"),
				title: `정상 제목 ${randomUUID()}`,
			});
			expect(created.id).toBeTruthy();

			const createComment = clientFor(
				communityRouter.createComment,
				fixture.femaleUserId,
				["createComment"]
			);
			const comment = await createComment({
				body: "정상 댓글입니다",
				postId: created.id,
			});
			expect(comment.id).toBeTruthy();
		} finally {
			await cleanupCommunityFixture(fixture);
		}
	});
});
