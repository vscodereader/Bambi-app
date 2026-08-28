import { db } from "@bambi-app/db";
import {
	bambiSiteSettings,
	communityBoard,
	communityBoardHomeLayout,
	communityBoardLayoutSurface,
	communityPost,
} from "@bambi-app/db/schema/bambi";
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

// 빌트인 게시판 — 코드가 key 리터럴로 특수 동작을 분기하는 5종(notice 운영자 전용,
// free 잠금 금지, work_talk 수집 합류, market 반폭 카드, legal 연락처)이라 삭제를 막는다.
// 감추려면 setActive(false)를 쓴다.
const BUILTIN_BOARD_KEYS = new Set([
	"notice",
	"free",
	"work_talk",
	"market",
	"legal",
	"secret",
]);

// 운영자가 고를 수 있는 게시판 아이콘(lucide 컴포넌트 이름). 자유 입력을 받으면 웹이
// 그릴 수 없는 이름이 저장되므로 큐레이션 목록으로 좁힌다 — 웹의 이름→컴포넌트 맵
// (lib/bambi/community-board-icons.ts)과 짝이고, 웹이 모르는 이름은 화면에서 무시된다.
export const COMMUNITY_BOARD_ICONS = [
	"MessageCircle",
	"Briefcase",
	"ShoppingBag",
	"Scale",
	"Megaphone",
	"Sparkles",
	"Coffee",
	"Moon",
	"Music",
	"Heart",
	"Star",
	"Users",
	"Newspaper",
	"MessageSquareLock",
] as const;

const boardIconSchema = z.enum(COMMUNITY_BOARD_ICONS);

const boardKeyInput = z.object({ key: z.string().trim().min(1).max(40) });

const createBoardInput = z.object({
	commentPoints: z.number().int().min(0).max(100_000).default(0),
	description: z.string().trim().max(200).default(""),
	icon: boardIconSchema.optional(),
	label: z.string().trim().min(1).max(30),
	postPoints: z.number().int().min(0).max(100_000).default(0),
	slug: z.string().trim().min(2).max(30),
});

const updateBoardInput = boardKeyInput
	.extend({
		commentPoints: z.number().int().min(0).max(100_000).optional(),
		description: z.string().trim().max(200).optional(),
		// null이면 아이콘 제거(생략은 "안 건드림"과 구분된다).
		icon: boardIconSchema.nullable().optional(),
		isWritable: z.boolean().optional(),
		label: z.string().trim().min(1).max(30).optional(),
		postPoints: z.number().int().min(0).max(100_000).optional(),
		sortOrder: z.number().int().min(0).max(10_000).optional(),
	})
	// 전부 생략하면 drizzle의 set에 넘길 값이 남지 않아 쿼리 자체가 터진다.
	.refine(
		(value) =>
			value.commentPoints !== undefined ||
			value.description !== undefined ||
			value.icon !== undefined ||
			value.isWritable !== undefined ||
			value.label !== undefined ||
			value.postPoints !== undefined ||
			value.sortOrder !== undefined,
		{ message: "바꿀 값을 하나 이상 보내야 합니다." }
	);

const setBoardActiveInput = boardKeyInput.extend({ isActive: z.boolean() });
const layoutSurfaceSchema = z.enum(communityBoardLayoutSurface.enumValues);
const getHomeLayoutInput = z.object({ surface: layoutSurfaceSchema });
const updateHomeLayoutInput = z.object({
	rows: z.array(z.array(z.string().trim().min(1).max(40)).min(1)).max(30),
	surface: layoutSurfaceSchema,
});

// 베스트글(가상 게시판) 전용. null은 아이콘 해제(기존 코럴 액센트 바로 복귀)다.
const updateBestBoardIconInput = z.object({ icon: boardIconSchema.nullable() });

// site_settings 단일 행 고정 키. site-settings.ts의 SETTINGS_ROW_ID와 동일 규약이며,
// 베스트 아이콘도 그 행의 컬럼 하나라 여기서만 별도로 상수를 둔다.
const SETTINGS_ROW_ID = "default";

const BOARD_NOT_FOUND = "게시판을 찾을 수 없습니다.";
const BEST_BOARD_KEY = "best";
const NOTICE_BOARD_KEY = "notice";

export const assertLayoutBoardsUnique = (rows: string[][]): void => {
	const keys = rows.flat();
	if (new Set(keys).size !== keys.length) {
		throw new ORPCError("BAD_REQUEST", {
			message: "같은 게시판을 한 배치에 두 번 넣을 수 없습니다.",
		});
	}
};

// 운영자가 코드 배포 없이 수다방 게시판을 늘리고 감추는 라우터. 삭제(remove)는 글이 하나도
// 없는 운영자 생성 게시판에만 열려 있다 — 글이 FK로 매달린 게시판은 지우면 과거 글이 함께
// 사라지므로 숨김(setActive(false))으로 안내한다.
export const communityBoardsRouter = {
	// 화면(목록·글쓰기·홈)이 소비하는 게시판 목록. 비로그인도 게시판 이름은 볼 수 있다
	// (글 열람 자격은 community 라우터가 따로 본다). 베스트글은 DB 행이 없는 가상 게시판이라
	// 아이콘이 site_settings에 있는데, 화면(toBoardMetas)이 best를 선두에 얹으므로 그 아이콘도
	// 여기서 함께 내려준다 — 목록·상세 헤더가 홈 미리보기(overview)와 같은 아이콘을 보게 한다.
	listActive: publicProcedure.handler(async () => {
		const [boards, [settingsRow]] = await Promise.all([
			db
				.select({
					description: communityBoard.description,
					icon: communityBoard.icon,
					isWritable: communityBoard.isWritable,
					key: communityBoard.key,
					label: communityBoard.label,
					slug: communityBoard.slug,
					sortOrder: communityBoard.sortOrder,
				})
				.from(communityBoard)
				.where(eq(communityBoard.isActive, true))
				.orderBy(asc(communityBoard.sortOrder)),
			db
				.select({ icon: bambiSiteSettings.bestBoardIcon })
				.from(bambiSiteSettings)
				.where(eq(bambiSiteSettings.id, SETTINGS_ROW_ID))
				.limit(1),
		]);
		return { bestIcon: settingsRow?.icon ?? null, boards };
	}),

	list: adminProcedure.handler(async () =>
		db.select().from(communityBoard).orderBy(asc(communityBoard.sortOrder))
	),

	getHomeLayout: adminProcedure
		.input(getHomeLayoutInput)
		.handler(async ({ input }) =>
			db
				.select()
				.from(communityBoardHomeLayout)
				.where(eq(communityBoardHomeLayout.surface, input.surface))
				.orderBy(
					asc(communityBoardHomeLayout.rowIndex),
					asc(communityBoardHomeLayout.position)
				)
		),

	updateHomeLayout: adminProcedure
		.input(updateHomeLayoutInput)
		.handler(async ({ input }) => {
			assertLayoutBoardsUnique(input.rows);
			const keys = input.rows.flat();
			const validRows = await db
				.select({ key: communityBoard.key })
				.from(communityBoard);
			const validKeys = new Set([
				BEST_BOARD_KEY,
				...validRows.map((row) => row.key),
			]);
			if (keys.some((key) => !validKeys.has(key))) {
				throw new ORPCError("BAD_REQUEST", {
					message: "존재하지 않는 게시판이 홈 배치에 포함되어 있습니다.",
				});
			}
			await db.transaction(async (tx) => {
				await tx
					.delete(communityBoardHomeLayout)
					.where(eq(communityBoardHomeLayout.surface, input.surface));
				const values = input.rows.flatMap((row, rowIndex) =>
					row.map((boardKey, position) => ({
						boardKey,
						position,
						rowIndex,
						surface: input.surface,
					}))
				);
				if (values.length > 0) {
					await tx.insert(communityBoardHomeLayout).values(values);
				}
			});
			return { rows: input.rows, surface: input.surface };
		}),

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
				commentPoints: input.commentPoints,
				description: input.description,
				icon: input.icon,
				key: input.slug,
				label: input.label,
				postPoints: input.postPoints,
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
				commentPoints: input.commentPoints,
				description: input.description,
				// undefined는 drizzle이 set에서 빼고, null은 그대로 실려 아이콘이 지워진다.
				icon: input.icon,
				isWritable: input.isWritable,
				label: input.label,
				// 공지는 운영자만 글을 쓰므로 글 작성 적립이 무의미하다 — 화면이 입력을 숨기지만
				// 여기서도 0으로 고정해 우회 저장을 막는다(게시판 관리가 이 값의 단일 소스).
				postPoints: input.key === NOTICE_BOARD_KEY ? 0 : input.postPoints,
				sortOrder: input.sortOrder,
			})
			.where(eq(communityBoard.key, input.key))
			.returning({ key: communityBoard.key });

		if (!updated) {
			throw new ORPCError("NOT_FOUND", { message: BOARD_NOT_FOUND });
		}

		return updated;
	}),

	// 잘못 만든 게시판을 되돌리는 용도. 글이 붙은 뒤에는 못 지운다 — community_post.board가
	// FK로 참조하므로 지우면 과거 글이 함께 사라진다(그 경우 노출을 끄는 게 정답이다).
	remove: adminProcedure.input(boardKeyInput).handler(async ({ input }) => {
		if (BUILTIN_BOARD_KEYS.has(input.key)) {
			throw new ORPCError("BAD_REQUEST", {
				message: "기본 게시판은 삭제할 수 없습니다.",
			});
		}

		// 삭제 대상 글이 몇 건인지는 알 필요가 없다 — 한 건이라도 있으면 거절이라 limit 1이다.
		const [post] = await db
			.select({ id: communityPost.id })
			.from(communityPost)
			.where(eq(communityPost.board, input.key))
			.limit(1);
		if (post) {
			throw new ORPCError("CONFLICT", {
				message:
					"글이 있는 게시판은 삭제할 수 없습니다. 노출을 끄는 방식을 사용해 주세요.",
			});
		}

		const [deleted] = await db
			.delete(communityBoard)
			.where(eq(communityBoard.key, input.key))
			.returning({ key: communityBoard.key });

		if (!deleted) {
			throw new ORPCError("NOT_FOUND", { message: BOARD_NOT_FOUND });
		}
		await db
			.delete(communityBoardHomeLayout)
			.where(eq(communityBoardHomeLayout.boardKey, input.key));

		return deleted;
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

	// 베스트글은 community_board 행이 없는 가상 게시판이라 위 CRUD로 다룰 수 없다.
	// 아이콘은 site_settings 단일 행에 저장하고, 운영자 게시판 관리 화면이 이 조회로
	// 현재값을 읽는다.
	getBestBoardIcon: adminProcedure.handler(async () => {
		const [row] = await db
			.select({ icon: bambiSiteSettings.bestBoardIcon })
			.from(bambiSiteSettings)
			.where(eq(bambiSiteSettings.id, SETTINGS_ROW_ID))
			.limit(1);
		return { icon: row?.icon ?? null };
	}),

	// 운영자 전용 저장. site_settings 단일 행을 upsert 하되 베스트 아이콘 컬럼만 갱신한다.
	updateBestBoardIcon: adminProcedure
		.input(updateBestBoardIconInput)
		.handler(async ({ input }) => {
			const [saved] = await db
				.insert(bambiSiteSettings)
				.values({ bestBoardIcon: input.icon, id: SETTINGS_ROW_ID })
				.onConflictDoUpdate({
					set: { bestBoardIcon: input.icon },
					target: bambiSiteSettings.id,
				})
				.returning({ icon: bambiSiteSettings.bestBoardIcon });
			return { icon: saved?.icon ?? null };
		}),
};
