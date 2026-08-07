import { db } from "@bambi-app/db";
import { communityBoard } from "@bambi-app/db/schema/bambi";
import { ORPCError } from "@orpc/server";
import { asc, eq, max } from "drizzle-orm";
import z from "zod";

import { adminProcedure, publicProcedure } from "../../index";

// 게시판 key는 URL 세그먼트(slug)와 저장값을 겸한다 — 새 게시판은 key === slug다.
// 레거시 work_talk만 slug가 "work-talk"으로 갈려 있고, 그건 시드로만 존재한다.
const SLUG_PATTERN = /^[a-z0-9_-]{2,30}$/;

// slug로 못 쓰는 값. best는 가상 큐레이션 게시판, crawled는 수집 글 상세 경로,
// write는 글쓰기 경로 세그먼트라 실제 게시판이 그 이름을 가지면 라우팅이 겹친다.
// 기존 게시판 이름(notice 등)은 DB unique가 따로 걸러낸다.
const RESERVED_SLUGS = new Set(["best", "crawled", "write"]);

const boardKeyInput = z.object({ key: z.string().trim().min(1).max(40) });

const createBoardInput = z.object({
	description: z.string().trim().max(200).default(""),
	label: z.string().trim().min(1).max(30),
	slug: z.string().trim().min(2).max(30),
});

const updateBoardInput = boardKeyInput
	.extend({
		description: z.string().trim().max(200).optional(),
		isWritable: z.boolean().optional(),
		label: z.string().trim().min(1).max(30).optional(),
		sortOrder: z.number().int().min(0).max(10_000).optional(),
	})
	// 전부 생략하면 drizzle의 set에 넘길 값이 남지 않아 쿼리 자체가 터진다.
	.refine(
		(value) =>
			value.description !== undefined ||
			value.isWritable !== undefined ||
			value.label !== undefined ||
			value.sortOrder !== undefined,
		{ message: "바꿀 값을 하나 이상 보내야 합니다." }
	);

const setBoardActiveInput = boardKeyInput.extend({ isActive: z.boolean() });

const BOARD_NOT_FOUND = "게시판을 찾을 수 없습니다.";

// 운영자가 코드 배포 없이 수다방 게시판을 늘리고 감추는 라우터. 삭제 프로시저는 없다 —
// 글이 FK로 매달려 있어 지우면 과거 글이 함께 사라진다. 숨김은 setActive(false)다.
export const communityBoardsRouter = {
	// 화면(목록·글쓰기·홈)이 소비하는 게시판 목록. 비로그인도 게시판 이름은 볼 수 있다
	// (글 열람 자격은 community 라우터가 따로 본다).
	listActive: publicProcedure.handler(async () =>
		db
			.select({
				description: communityBoard.description,
				isWritable: communityBoard.isWritable,
				key: communityBoard.key,
				label: communityBoard.label,
				slug: communityBoard.slug,
				sortOrder: communityBoard.sortOrder,
			})
			.from(communityBoard)
			.where(eq(communityBoard.isActive, true))
			.orderBy(asc(communityBoard.sortOrder))
	),

	list: adminProcedure.handler(async () =>
		db.select().from(communityBoard).orderBy(asc(communityBoard.sortOrder))
	),

	create: adminProcedure.input(createBoardInput).handler(async ({ input }) => {
		if (!SLUG_PATTERN.test(input.slug)) {
			throw new ORPCError("BAD_REQUEST", {
				message: "주소는 영소문자·숫자·하이픈·밑줄 2~30자로 입력해 주세요.",
			});
		}
		if (RESERVED_SLUGS.has(input.slug)) {
			throw new ORPCError("BAD_REQUEST", {
				message: "이미 쓰이고 있는 주소입니다. 다른 주소를 입력해 주세요.",
			});
		}

		const [existing] = await db
			.select({ key: communityBoard.key })
			.from(communityBoard)
			.where(eq(communityBoard.slug, input.slug))
			.limit(1);
		if (existing) {
			throw new ORPCError("CONFLICT", {
				message: "이미 등록된 게시판 주소입니다.",
			});
		}

		// 새 게시판은 목록 맨 뒤에 세운다. 순서 조정은 update의 sortOrder로 한다.
		const [tail] = await db
			.select({ value: max(communityBoard.sortOrder) })
			.from(communityBoard);

		const [created] = await db
			.insert(communityBoard)
			.values({
				description: input.description,
				key: input.slug,
				label: input.label,
				slug: input.slug,
				sortOrder: (tail?.value ?? 0) + 10,
			})
			.returning({ key: communityBoard.key });

		if (!created) {
			throw new ORPCError("INTERNAL_SERVER_ERROR", {
				message: "게시판을 만들지 못했습니다.",
			});
		}

		return created;
	}),

	// key·slug는 바꾸지 않는다 — 저장된 글이 key를 참조하고 있고, slug가 바뀌면
	// 밖으로 나간 링크가 전부 깨진다.
	update: adminProcedure.input(updateBoardInput).handler(async ({ input }) => {
		const [updated] = await db
			.update(communityBoard)
			.set({
				description: input.description,
				isWritable: input.isWritable,
				label: input.label,
				sortOrder: input.sortOrder,
			})
			.where(eq(communityBoard.key, input.key))
			.returning({ key: communityBoard.key });

		if (!updated) {
			throw new ORPCError("NOT_FOUND", { message: BOARD_NOT_FOUND });
		}

		return updated;
	}),

	setActive: adminProcedure
		.input(setBoardActiveInput)
		.handler(async ({ input }) => {
			const [updated] = await db
				.update(communityBoard)
				.set({ isActive: input.isActive })
				.where(eq(communityBoard.key, input.key))
				.returning({ key: communityBoard.key });

			if (!updated) {
				throw new ORPCError("NOT_FOUND", { message: BOARD_NOT_FOUND });
			}

			return updated;
		}),
};
