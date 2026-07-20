import { db } from "@bambi-app/db";
import {
	faqEntry,
	supportInquiry,
	supportInquiryMessage,
} from "@bambi-app/db/schema/bambi";
import { ORPCError } from "@orpc/server";
import { and, asc, count, desc, eq } from "drizzle-orm";
import z from "zod";

import { adminProcedure, protectedProcedure } from "../../index";
import {
	requireActiveBambiProfile,
	type SessionLike,
} from "../../services/bambi-authz";
import { assertNoBannedWords } from "../../services/bambi-banned-words";

const PAGE_SIZE = 20;
const BODY_MAX = 5000;
const MESSAGES_CAP = 100;
const TITLE_MAX = 100;
const TITLE_MIN = 2;
const BODY_MIN = 5;
const FAQ_ANSWER_MAX = 5000;
const FAQ_QUESTION_MAX = 300;
const FAQ_QUESTION_MIN = 2;

const inquiryCategorySchema = z.enum([
	"account",
	"job_post",
	"payment",
	"report",
	"etc",
]);

const createInquiryInput = z.object({
	body: z.string().trim().min(BODY_MIN).max(BODY_MAX),
	category: inquiryCategorySchema,
	title: z.string().trim().min(TITLE_MIN).max(TITLE_MAX),
});

const listMyInquiriesInput = z.object({
	page: z.number().int().min(1).default(1),
});

const inquiryIdInput = z.object({
	inquiryId: z.string().uuid(),
});

const createInquiryMessageInput = inquiryIdInput.extend({
	body: z.string().trim().min(1).max(BODY_MAX),
});

const listFaqInput = z.object({
	category: inquiryCategorySchema.optional(),
});

const createFaqInput = z.object({
	answer: z.string().trim().min(1).max(FAQ_ANSWER_MAX),
	category: inquiryCategorySchema,
	question: z.string().trim().min(FAQ_QUESTION_MIN).max(FAQ_QUESTION_MAX),
	sortOrder: z.number().int().min(0).default(0),
});

const faqIdInput = z.object({
	faqId: z.string().uuid(),
});

const updateFaqInput = faqIdInput.extend({
	answer: z.string().trim().min(1).max(FAQ_ANSWER_MAX),
	category: inquiryCategorySchema,
	question: z.string().trim().min(FAQ_QUESTION_MIN).max(FAQ_QUESTION_MAX),
	sortOrder: z.number().int().min(0),
});

const setFaqPublishedInput = faqIdInput.extend({
	isPublished: z.boolean(),
});

const listInquiriesByAdminInput = z.object({
	inquiryStatus: z.enum(["open", "answered", "closed"]).optional(),
	page: z.number().int().min(1).default(1),
});

const INQUIRY_NOT_FOUND = "문의를 찾을 수 없습니다.";

// 본인 또는 운영자만 문의에 접근한다. 타인에게는 NOT_FOUND를 던진다 —
// FORBIDDEN은 "그 id의 문의가 존재한다"를 알려주므로 비공개 문의의 존재가 새어 나간다.
const loadAccessibleInquiry = async (
	inquiryId: string,
	session: SessionLike | null | undefined
) => {
	const profile = await requireActiveBambiProfile(session);

	const [inquiry] = await db
		.select()
		.from(supportInquiry)
		.where(eq(supportInquiry.id, inquiryId))
		.limit(1);

	const notFound = new ORPCError("NOT_FOUND", { message: INQUIRY_NOT_FOUND });

	if (!inquiry || inquiry.status === "deleted") {
		throw notFound;
	}

	const isOwner = inquiry.authorUserId === profile.userId;
	const isAdmin = profile.role === "admin";

	if (!(isOwner || isAdmin)) {
		throw notFound;
	}

	// 운영자가 숨긴 문의는 작성자에게도 보이지 않는다(운영자 본인은 계속 볼 수 있다).
	if (inquiry.status === "hidden" && !isAdmin) {
		throw notFound;
	}

	return { inquiry, isAdmin, profile };
};

export const supportRouter = {
	createInquiry: protectedProcedure
		.input(createInquiryInput)
		.handler(async ({ context, input }) => {
			const profile = await requireActiveBambiProfile(context.session);

			await assertNoBannedWords([input.title, input.body]);

			const [created] = await db
				.insert(supportInquiry)
				.values({
					authorUserId: profile.userId,
					authorRole: profile.role,
					category: input.category,
					title: input.title,
					body: input.body,
				})
				.returning({ id: supportInquiry.id });

			if (!created) {
				throw new ORPCError("INTERNAL_SERVER_ERROR", {
					message: "문의를 등록하지 못했습니다.",
				});
			}

			return { id: created.id };
		}),

	listMyInquiries: protectedProcedure
		.input(listMyInquiriesInput)
		.handler(async ({ context, input }) => {
			const profile = await requireActiveBambiProfile(context.session);

			const where = and(
				eq(supportInquiry.authorUserId, profile.userId),
				eq(supportInquiry.status, "published")
			);

			const [totalRow] = await db
				.select({ value: count() })
				.from(supportInquiry)
				.where(where);

			const items = await db
				.select({
					id: supportInquiry.id,
					category: supportInquiry.category,
					title: supportInquiry.title,
					inquiryStatus: supportInquiry.inquiryStatus,
					lastMessageAt: supportInquiry.lastMessageAt,
					createdAt: supportInquiry.createdAt,
				})
				.from(supportInquiry)
				.where(where)
				.orderBy(desc(supportInquiry.lastMessageAt))
				.limit(PAGE_SIZE)
				.offset((input.page - 1) * PAGE_SIZE);

			return {
				items,
				page: input.page,
				pageSize: PAGE_SIZE,
				totalCount: totalRow?.value ?? 0,
			};
		}),

	getInquiry: protectedProcedure
		.input(inquiryIdInput)
		.handler(async ({ context, input }) => {
			const { inquiry, isAdmin } = await loadAccessibleInquiry(
				input.inquiryId,
				context.session
			);

			const messageRows = await db
				.select()
				.from(supportInquiryMessage)
				.where(eq(supportInquiryMessage.inquiryId, inquiry.id))
				.orderBy(asc(supportInquiryMessage.createdAt))
				.limit(MESSAGES_CAP);

			// 숨김·삭제된 메시지는 운영자에게만 원문이 보인다. 작성자에게는 자리표시로 바뀐다.
			const messages = messageRows.map((message) => {
				if (message.status === "published" || isAdmin) {
					return message;
				}

				return { ...message, body: "운영자가 숨긴 메시지입니다." };
			});

			return { inquiry, messages };
		}),

	createInquiryMessage: protectedProcedure
		.input(createInquiryMessageInput)
		.handler(async ({ context, input }) => {
			const { inquiry, isAdmin, profile } = await loadAccessibleInquiry(
				input.inquiryId,
				context.session
			);

			if (inquiry.inquiryStatus === "closed") {
				throw new ORPCError("BAD_REQUEST", {
					message: "종료된 문의에는 답변을 남길 수 없습니다.",
				});
			}

			await assertNoBannedWords([input.body]);

			const created = await db.transaction(async (tx) => {
				const [message] = await tx
					.insert(supportInquiryMessage)
					.values({
						inquiryId: inquiry.id,
						authorUserId: profile.userId,
						isStaff: isAdmin,
						body: input.body,
					})
					.returning({ id: supportInquiryMessage.id });

				if (!message) {
					throw new ORPCError("INTERNAL_SERVER_ERROR", {
						message: "메시지를 등록하지 못했습니다.",
					});
				}

				// 운영자가 답하면 answered로 올린다. 사용자가 재질문하면 다시 open으로 내린다.
				await tx
					.update(supportInquiry)
					.set({
						inquiryStatus: isAdmin ? "answered" : "open",
						lastMessageAt: new Date(),
						updatedAt: new Date(),
					})
					.where(eq(supportInquiry.id, inquiry.id));

				return message;
			});

			return { id: created.id };
		}),

	closeInquiry: protectedProcedure
		.input(inquiryIdInput)
		.handler(async ({ context, input }) => {
			const { inquiry } = await loadAccessibleInquiry(
				input.inquiryId,
				context.session
			);

			await db
				.update(supportInquiry)
				.set({ inquiryStatus: "closed", updatedAt: new Date() })
				.where(eq(supportInquiry.id, inquiry.id));

			return { ok: true };
		}),

	listFaq: protectedProcedure
		.input(listFaqInput)
		.handler(async ({ context, input }) => {
			await requireActiveBambiProfile(context.session);

			const where = input.category
				? and(
						eq(faqEntry.isPublished, true),
						eq(faqEntry.category, input.category)
					)
				: eq(faqEntry.isPublished, true);

			const items = await db
				.select()
				.from(faqEntry)
				.where(where)
				.orderBy(asc(faqEntry.sortOrder), asc(faqEntry.createdAt));

			return { items };
		}),

	listInquiriesByAdmin: adminProcedure
		.input(listInquiriesByAdminInput)
		.handler(async ({ input }) => {
			const where = input.inquiryStatus
				? and(
						eq(supportInquiry.status, "published"),
						eq(supportInquiry.inquiryStatus, input.inquiryStatus)
					)
				: eq(supportInquiry.status, "published");

			const [totalRow] = await db
				.select({ value: count() })
				.from(supportInquiry)
				.where(where);

			const items = await db
				.select()
				.from(supportInquiry)
				.where(where)
				.orderBy(desc(supportInquiry.lastMessageAt))
				.limit(PAGE_SIZE)
				.offset((input.page - 1) * PAGE_SIZE);

			return {
				items,
				page: input.page,
				pageSize: PAGE_SIZE,
				totalCount: totalRow?.value ?? 0,
			};
		}),

	createFaq: adminProcedure.input(createFaqInput).handler(async ({ input }) => {
		const [created] = await db
			.insert(faqEntry)
			.values({
				category: input.category,
				question: input.question,
				answer: input.answer,
				sortOrder: input.sortOrder,
			})
			.returning({ id: faqEntry.id });

		if (!created) {
			throw new ORPCError("INTERNAL_SERVER_ERROR", {
				message: "FAQ를 등록하지 못했습니다.",
			});
		}

		return { id: created.id };
	}),

	updateFaq: adminProcedure.input(updateFaqInput).handler(async ({ input }) => {
		await db
			.update(faqEntry)
			.set({
				category: input.category,
				question: input.question,
				answer: input.answer,
				sortOrder: input.sortOrder,
				updatedAt: new Date(),
			})
			.where(eq(faqEntry.id, input.faqId));

		return { ok: true };
	}),

	setFaqPublished: adminProcedure
		.input(setFaqPublishedInput)
		.handler(async ({ input }) => {
			await db
				.update(faqEntry)
				.set({ isPublished: input.isPublished, updatedAt: new Date() })
				.where(eq(faqEntry.id, input.faqId));

			return { ok: true };
		}),

	// FAQ는 운영자가 쓰는 문서라 사용자 콘텐츠와 달리 하드 삭제한다(감사 대상이 아니다).
	removeFaq: adminProcedure.input(faqIdInput).handler(async ({ input }) => {
		await db.delete(faqEntry).where(eq(faqEntry.id, input.faqId));

		return { ok: true };
	}),
};
