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
import { notifyBambiNotification } from "../../services/bambi-notifications";
import { assertTiptapDoc } from "../../services/bambi-tiptap-text";

const PAGE_SIZE = 20;
const BODY_MAX = 5000;
const MESSAGES_CAP = 100;
const TITLE_MAX = 100;
const TITLE_MIN = 2;
const BODY_MIN = 5;
// FAQ 답변은 1:1 문의 본문과 달리 리치 에디터(CommunityPostEditor)가 만든 Tiptap JSON이라
// 마크·노드 래핑 오버헤드(문단당 ~50자, 이미지 노드는 URL까지)가 붙는다. 같은 에디터로
// 쓰는 수다방 본문 상한(community BODY_MAX=30_000)과 값을 맞춰 두 리치 본문이 하나의
// 천장을 공유하게 한다 — FAQ만 더 좁게 잡을 근거가 없고, 다르면 에디터 동작이 화면마다 갈린다.
const FAQ_ANSWER_MAX = 30_000;
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
	// 운영자 화면 전용. 비공개 FAQ를 목록에서 감추면 다시 공개로 되돌릴 진입점이 사라진다.
	// 일반 회원이 true를 보내도 아래 핸들러에서 role로 한 번 더 막는다.
	includeUnpublished: z.boolean().default(false),
});

const createFaqInput = z.object({
	// 직렬화된 Tiptap JSON이라 .trim()은 의미가 없다(문서 형식은 핸들러의 assertTiptapDoc이 검증).
	answer: z.string().min(1).max(FAQ_ANSWER_MAX),
	category: inquiryCategorySchema,
	question: z.string().trim().min(FAQ_QUESTION_MIN).max(FAQ_QUESTION_MAX),
	sortOrder: z.number().int().min(0).default(0),
});

const faqIdInput = z.object({
	faqId: z.string().uuid(),
});

const updateFaqInput = faqIdInput.extend({
	answer: z.string().min(1).max(FAQ_ANSWER_MAX),
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
const ADMIN_CANNOT_CREATE_INQUIRY =
	"운영자 계정은 문의 접수 대상이 아니에요. 회원 문의는 운영자 콘솔의 고객센터 관리에서 답변해 주세요.";

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

			// 운영자는 문의를 받는 쪽이다. 운영자 계정으로 접수된 문의는 답변 큐
			// (listInquiriesByAdmin)에 자기 글로 섞여 처리 대상을 흐린다.
			if (profile.role === "admin") {
				throw new ORPCError("FORBIDDEN", {
					message: ADMIN_CANNOT_CREATE_INQUIRY,
				});
			}

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

			// 새 문의는 운영자 답변 큐에 쌓인다. 개인 수신자가 없으니 role 공유 1행.
			await notifyBambiNotification({
				actorUserId: profile.userId,
				metadata: { action: "submitted", category: input.category },
				recipientRole: "admin",
				targetId: created.id,
				targetType: "support_inquiry",
			});

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

			// 운영자 답변은 문의자에게, 사용자 재질문은 운영자 큐(공유 1행)에 알린다.
			// 문의자 본인이 자기 문의에 글을 더 남긴 경우는 recipient가 본인이라 생략된다.
			await (isAdmin
				? notifyBambiNotification({
						actorUserId: profile.userId,
						metadata: { action: "answered" },
						recipientUserId: inquiry.authorUserId,
						targetId: inquiry.id,
						targetType: "support_inquiry",
					})
				: notifyBambiNotification({
						actorUserId: profile.userId,
						metadata: { action: "replied" },
						recipientRole: "admin",
						targetId: inquiry.id,
						targetType: "support_inquiry",
					}));

			return { id: created.id };
		}),

	// 종료는 운영자 전용이다. 문의자가 종료할 수 있으면 운영자가 답변을 남길 수 없게 된다
	// (createInquiryMessage가 closed를 400으로 막는다). 답변을 한 번도 안 한 문의를 닫으면
	// 문의자가 답을 못 받고 끝나므로 answered 이후에만 연다.
	closeInquiry: adminProcedure
		.input(inquiryIdInput)
		.handler(async ({ context, input }) => {
			const { inquiry } = await loadAccessibleInquiry(
				input.inquiryId,
				context.session
			);

			if (inquiry.inquiryStatus !== "answered") {
				throw new ORPCError("BAD_REQUEST", {
					message: "답변을 보낸 뒤에 문의를 종료할 수 있습니다.",
				});
			}

			await db
				.update(supportInquiry)
				.set({ inquiryStatus: "closed", updatedAt: new Date() })
				.where(eq(supportInquiry.id, inquiry.id));

			return { ok: true };
		}),

	listFaq: protectedProcedure
		.input(listFaqInput)
		.handler(async ({ context, input }) => {
			const profile = await requireActiveBambiProfile(context.session);

			// 비공개 FAQ는 운영자에게만 보인다. 입력값만 믿으면 일반 회원이 초안을 읽는다.
			const canSeeUnpublished =
				input.includeUnpublished && profile.role === "admin";
			const publishedOnly = canSeeUnpublished
				? undefined
				: eq(faqEntry.isPublished, true);
			const categoryMatch = input.category
				? eq(faqEntry.category, input.category)
				: undefined;
			const where =
				publishedOnly && categoryMatch
					? and(publishedOnly, categoryMatch)
					: (publishedOnly ?? categoryMatch);

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
		assertTiptapDoc(input.answer);

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
		assertTiptapDoc(input.answer);

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
