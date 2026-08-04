import { randomUUID } from "node:crypto";

import dotenv from "dotenv";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

dotenv.config({ path: "../../apps/server/.env" });

const { db } = await import("@bambi-app/db");
const { bambiProfile, faqEntry, supportInquiry } = await import(
	"@bambi-app/db/schema/bambi"
);
const { user } = await import("@bambi-app/db/schema/auth");
const { supportRouter } = await import("./support");
const { createProcedureClient } = await import("@orpc/server");
const { eq, inArray } = await import("drizzle-orm");

const createContextForUser = (userId: string) =>
	({ auth: null, session: { user: { id: userId } } }) as never;

const seedUserIds: string[] = [];

const seedUser = async (role: "job_seeker" | "employer" | "admin") => {
	const id = randomUUID();
	await db.insert(user).values({
		id,
		name: `테스트-${id.slice(0, 8)}`,
		email: `${id}@test.local`,
		emailVerified: false,
		createdAt: new Date(),
		updatedAt: new Date(),
	});
	await db.insert(bambiProfile).values({
		userId: id,
		role,
	});
	seedUserIds.push(id);
	return id;
};

let seekerId = "";
let otherSeekerId = "";
let adminId = "";

beforeAll(async () => {
	seekerId = await seedUser("job_seeker");
	otherSeekerId = await seedUser("job_seeker");
	adminId = await seedUser("admin");
});

afterAll(async () => {
	await db
		.delete(supportInquiry)
		.where(inArray(supportInquiry.authorUserId, seedUserIds));
	await db
		.delete(bambiProfile)
		.where(inArray(bambiProfile.userId, seedUserIds));
	await db.delete(user).where(inArray(user.id, seedUserIds));
});

const createInquiryAs = async (userId: string) => {
	const caller = createProcedureClient(supportRouter.createInquiry, {
		context: createContextForUser(userId),
	});
	return await caller({
		body: "문의 본문입니다. 확인 부탁드립니다.",
		category: "account",
		title: "계정 문의",
	});
};

describe("고객센터 문의", () => {
	it("구직자가 문의를 등록할 수 있다", async () => {
		const created = await createInquiryAs(seekerId);
		expect(created.id).toBeTruthy();
	});

	it("타인의 문의는 NOT_FOUND다 (FORBIDDEN이 아니다)", async () => {
		const created = await createInquiryAs(seekerId);

		const caller = createProcedureClient(supportRouter.getInquiry, {
			context: createContextForUser(otherSeekerId),
		});

		await expect(caller({ inquiryId: created.id })).rejects.toMatchObject({
			code: "NOT_FOUND",
		});
	});

	it("작성자 본인은 자기 문의를 볼 수 있다", async () => {
		const created = await createInquiryAs(seekerId);

		const caller = createProcedureClient(supportRouter.getInquiry, {
			context: createContextForUser(seekerId),
		});

		const result = await caller({ inquiryId: created.id });
		expect(result.inquiry.id).toBe(created.id);
	});

	it("운영자는 타인의 문의도 볼 수 있다", async () => {
		const created = await createInquiryAs(seekerId);

		const caller = createProcedureClient(supportRouter.getInquiry, {
			context: createContextForUser(adminId),
		});

		const result = await caller({ inquiryId: created.id });
		expect(result.inquiry.id).toBe(created.id);
	});

	it("운영자가 답하면 inquiryStatus가 answered로 바뀐다", async () => {
		const created = await createInquiryAs(seekerId);

		const caller = createProcedureClient(supportRouter.createInquiryMessage, {
			context: createContextForUser(adminId),
		});
		await caller({ inquiryId: created.id, body: "확인했습니다." });

		const [row] = await db
			.select({ inquiryStatus: supportInquiry.inquiryStatus })
			.from(supportInquiry)
			.where(eq(supportInquiry.id, created.id))
			.limit(1);

		expect(row?.inquiryStatus).toBe("answered");
	});

	it("종료된 문의에는 메시지를 남길 수 없다", async () => {
		const created = await createInquiryAs(seekerId);

		// 종료는 answered 이후에만 열리므로 운영자 답변을 먼저 넣는다.
		const answerCaller = createProcedureClient(
			supportRouter.createInquiryMessage,
			{ context: createContextForUser(adminId) }
		);
		await answerCaller({ inquiryId: created.id, body: "확인했습니다." });

		const closeCaller = createProcedureClient(supportRouter.closeInquiry, {
			context: createContextForUser(adminId),
		});
		await closeCaller({ inquiryId: created.id });

		const messageCaller = createProcedureClient(
			supportRouter.createInquiryMessage,
			{ context: createContextForUser(seekerId) }
		);

		await expect(
			messageCaller({ inquiryId: created.id, body: "추가 문의" })
		).rejects.toMatchObject({ code: "BAD_REQUEST" });
	});

	it("문의자는 문의를 종료할 수 없다", async () => {
		const created = await createInquiryAs(seekerId);

		const caller = createProcedureClient(supportRouter.closeInquiry, {
			context: createContextForUser(seekerId),
		});

		await expect(caller({ inquiryId: created.id })).rejects.toMatchObject({
			code: "FORBIDDEN",
		});
	});

	it("답변 전 문의는 운영자도 종료할 수 없다", async () => {
		const created = await createInquiryAs(seekerId);

		const caller = createProcedureClient(supportRouter.closeInquiry, {
			context: createContextForUser(adminId),
		});

		await expect(caller({ inquiryId: created.id })).rejects.toMatchObject({
			code: "BAD_REQUEST",
		});
	});
});

describe("고객센터 FAQ", () => {
	const createdFaqIds: string[] = [];

	// FAQ 답변은 리치 에디터가 만든 Tiptap doc JSON이라 평문은 더 이상 통과하지 않는다.
	const FAQ_ANSWER = JSON.stringify({
		content: [
			{ content: [{ text: "답변입니다.", type: "text" }], type: "paragraph" },
		],
		type: "doc",
	});

	afterAll(async () => {
		if (createdFaqIds.length > 0) {
			await db.delete(faqEntry).where(inArray(faqEntry.id, createdFaqIds));
		}
	});

	it("비공개 FAQ는 일반 회원 목록에 나오지 않는다", async () => {
		const createCaller = createProcedureClient(supportRouter.createFaq, {
			context: createContextForUser(adminId),
		});
		const created = await createCaller({
			answer: FAQ_ANSWER,
			category: "account",
			question: `비공개질문-${randomUUID().slice(0, 8)}`,
			sortOrder: 0,
		});
		createdFaqIds.push(created.id);

		const publishCaller = createProcedureClient(supportRouter.setFaqPublished, {
			context: createContextForUser(adminId),
		});
		await publishCaller({ faqId: created.id, isPublished: false });

		const listCaller = createProcedureClient(supportRouter.listFaq, {
			context: createContextForUser(seekerId),
		});
		const result = await listCaller({});

		expect(result.items.some((item) => item.id === created.id)).toBe(false);
	});

	it("일반 회원은 includeUnpublished로도 비공개 FAQ를 볼 수 없다", async () => {
		const createCaller = createProcedureClient(supportRouter.createFaq, {
			context: createContextForUser(adminId),
		});
		const created = await createCaller({
			answer: FAQ_ANSWER,
			category: "account",
			question: `우회시도-${randomUUID().slice(0, 8)}`,
			sortOrder: 0,
		});
		createdFaqIds.push(created.id);

		const publishCaller = createProcedureClient(supportRouter.setFaqPublished, {
			context: createContextForUser(adminId),
		});
		await publishCaller({ faqId: created.id, isPublished: false });

		const seekerCaller = createProcedureClient(supportRouter.listFaq, {
			context: createContextForUser(seekerId),
		});
		const seekerResult = await seekerCaller({ includeUnpublished: true });

		expect(seekerResult.items.some((item) => item.id === created.id)).toBe(
			false
		);

		// 운영자는 같은 입력으로 비공개 FAQ를 보고 다시 공개로 되돌릴 수 있어야 한다.
		const adminCaller = createProcedureClient(supportRouter.listFaq, {
			context: createContextForUser(adminId),
		});
		const adminResult = await adminCaller({ includeUnpublished: true });

		expect(adminResult.items.some((item) => item.id === created.id)).toBe(true);
	});

	it("일반 회원은 FAQ를 만들 수 없다", async () => {
		const caller = createProcedureClient(supportRouter.createFaq, {
			context: createContextForUser(seekerId),
		});

		await expect(
			caller({
				answer: FAQ_ANSWER,
				category: "etc",
				question: "질문",
				sortOrder: 0,
			})
		).rejects.toMatchObject({ code: "FORBIDDEN" });
	});

	it("답변이 Tiptap doc JSON이 아니면 BAD_REQUEST", async () => {
		const caller = createProcedureClient(supportRouter.createFaq, {
			context: createContextForUser(adminId),
		});

		await expect(
			caller({
				answer: "그냥 텍스트",
				category: "etc",
				question: `본문검증-${randomUUID().slice(0, 8)}`,
				sortOrder: 0,
			})
		).rejects.toMatchObject({ code: "BAD_REQUEST" });
	});
});
