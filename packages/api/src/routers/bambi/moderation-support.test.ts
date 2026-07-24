import { randomUUID } from "node:crypto";

import { createProcedureClient } from "@orpc/server";
import dotenv from "dotenv";
import { eq, inArray } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type { Context } from "../../context";

dotenv.config({
	path: "../../apps/server/.env",
});

const [{ db }, authSchema, bambiSchema, { moderationRouter }] =
	await Promise.all([
		import("@bambi-app/db"),
		import("@bambi-app/db/schema/auth"),
		import("@bambi-app/db/schema/bambi"),
		import("./moderation"),
	]);

const { user } = authSchema;
const { adminModerationAction, bambiProfile, supportInquiry } = bambiSchema;

const createContextForUser = (userId: string): Context =>
	({
		auth: null,
		session: {
			user: {
				id: userId,
			},
		},
	}) as Context;

const seedUserIds: string[] = [];

const seedUser = async (role: "job_seeker" | "admin"): Promise<string> => {
	const id = `user_test_modsupport_${randomUUID()}`;

	await db.insert(user).values({
		id,
		name: `테스트-${id.slice(-8)}`,
		email: `${id}@bambi.test`,
	});
	await db.insert(bambiProfile).values({
		userId: id,
		role,
	});

	seedUserIds.push(id);

	return id;
};

// support.ts는 다른 작업에서 동시에 만들어지므로 라우터를 거치지 않고 직접 시드한다.
const createInquiryAs = async (userId: string): Promise<{ id: string }> => {
	const [created] = await db
		.insert(supportInquiry)
		.values({
			authorUserId: userId,
			authorRole: "job_seeker",
			category: "account",
			title: `문의 제목 ${randomUUID().slice(0, 8)}`,
			body: "문의 본문입니다. 확인 부탁드립니다.",
		})
		.returning({ id: supportInquiry.id });

	if (!created) {
		throw new Error("문의 픽스처 생성에 실패했습니다.");
	}

	return created;
};

let seekerId = "";
let adminId = "";

beforeAll(async () => {
	seekerId = await seedUser("job_seeker");
	adminId = await seedUser("admin");
});

afterAll(async () => {
	await db
		.delete(adminModerationAction)
		.where(inArray(adminModerationAction.adminUserId, seedUserIds));
	await db
		.delete(supportInquiry)
		.where(inArray(supportInquiry.authorUserId, seedUserIds));
	await db
		.delete(bambiProfile)
		.where(inArray(bambiProfile.userId, seedUserIds));
	await db.delete(user).where(inArray(user.id, seedUserIds));
});

describe("고객센터 운영 조치", () => {
	it("문의 블라인드 시 상태 전환과 감사로그가 함께 남는다", async () => {
		const created = await createInquiryAs(seekerId);

		const caller = createProcedureClient(
			moderationRouter.setInquiryStatusByAdmin,
			{ context: createContextForUser(adminId) }
		);
		await caller({
			inquiryId: created.id,
			reason: "테스트 사유",
			status: "hidden",
		});

		const [inquiryRow] = await db
			.select({ status: supportInquiry.status })
			.from(supportInquiry)
			.where(eq(supportInquiry.id, created.id))
			.limit(1);

		expect(inquiryRow?.status).toBe("hidden");

		// 공유 개발 DB라 targetId로 좁혀 조회한다(전역 카운트 단언 금지).
		const logRows = await db
			.select()
			.from(adminModerationAction)
			.where(eq(adminModerationAction.targetId, created.id));

		expect(logRows).toHaveLength(1);
		expect(logRows[0]?.action).toBe("set_status:hidden");
		expect(logRows[0]?.targetType).toBe("support_inquiry");
	});

	it("사유가 없으면 조치가 거부된다", async () => {
		const created = await createInquiryAs(seekerId);

		const caller = createProcedureClient(
			moderationRouter.setInquiryStatusByAdmin,
			{ context: createContextForUser(adminId) }
		);

		await expect(
			caller({ inquiryId: created.id, reason: "", status: "hidden" })
		).rejects.toBeTruthy();
	});

	it("일반 회원은 조치할 수 없다", async () => {
		const created = await createInquiryAs(seekerId);

		const caller = createProcedureClient(
			moderationRouter.setInquiryStatusByAdmin,
			{ context: createContextForUser(seekerId) }
		);

		await expect(
			caller({ inquiryId: created.id, reason: "사유", status: "hidden" })
		).rejects.toMatchObject({ code: "FORBIDDEN" });
	});

	it("통합 목록이 유형별로 공통 형태를 반환한다", async () => {
		await createInquiryAs(seekerId);

		const caller = createProcedureClient(
			moderationRouter.listModeratableContent,
			{ context: createContextForUser(adminId) }
		);

		const result = await caller({ targetType: "support_inquiry", page: 1 });

		expect(result.items.length).toBeGreaterThan(0);
		expect(result.items[0]).toHaveProperty("targetType", "support_inquiry");
		expect(result.items[0]).toHaveProperty("authorName");
		expect(result.items[0]).toHaveProperty("excerpt");
	});

	it("상세 조회가 발췌가 아닌 전체 본문을 돌려준다", async () => {
		const created = await createInquiryAs(seekerId);

		const caller = createProcedureClient(
			moderationRouter.getModeratableContentDetail,
			{ context: createContextForUser(adminId) }
		);

		const detail = await caller({
			id: created.id,
			targetType: "support_inquiry",
		});

		expect(detail.body).toBe("문의 본문입니다. 확인 부탁드립니다.");
		expect(detail.category).toBe("account");
		expect(detail.authorName).toContain("표시명-");
	});

	it("없는 대상 상세는 NOT_FOUND", async () => {
		const caller = createProcedureClient(
			moderationRouter.getModeratableContentDetail,
			{ context: createContextForUser(adminId) }
		);

		await expect(
			caller({ id: randomUUID(), targetType: "support_inquiry" })
		).rejects.toMatchObject({ code: "NOT_FOUND" });
	});
});
