import { db } from "@bambi-app/db";
import { crawledJobPost } from "@bambi-app/db/schema/bambi";
import { ORPCError } from "@orpc/server";
import { and, eq } from "drizzle-orm";
import z from "zod";

import { publicProcedure } from "../../index";

// 공개 상세에 내려보내는 컬럼. 연락처·담당자명·카톡아이디·사업자명·주소·원본 URL은
// **의도적으로 빠져 있다** — 운영자 전용 리드이며(crawler.ts LIST_COLUMNS 주석의 원칙 그대로),
// 원본 URL도 빼는 이유는 그 링크 한 줄이 위 전부로 가는 우회로이기 때문이다.
const PUBLIC_COLUMNS = {
	ageRange: crawledJobPost.ageRange,
	body: crawledJobPost.body,
	detailImageUrls: crawledJobPost.detailImageUrls,
	district: crawledJobPost.district,
	gender: crawledJobPost.gender,
	id: crawledJobPost.id,
	industryCategory: crawledJobPost.industryCategory,
	listingType: crawledJobPost.listingType,
	payAmount: crawledJobPost.payAmount,
	payRaw: crawledJobPost.payRaw,
	payUnit: crawledJobPost.payUnit,
	region: crawledJobPost.region,
	shopName: crawledJobPost.shopName,
	sourceDeadlineAt: crawledJobPost.sourceDeadlineAt,
	sourcePostedAt: crawledJobPost.sourcePostedAt,
	thumbnailUrl: crawledJobPost.thumbnailUrl,
	title: crawledJobPost.title,
	workSchedule: crawledJobPost.workSchedule,
} as const;

export const crawledJobsRouter = {
	// 수집 공고 상세. 우리 공고(jobs.getById)와 테이블이 달라 라우터를 나눴다 —
	// 한 프로시저에서 두 테이블을 분기시키면 "이 응답에 연락처가 섞일 수 있나"를
	// 매번 다시 읽어 확인해야 한다.
	getById: publicProcedure
		.input(z.object({ id: z.uuid() }))
		.handler(async ({ input }) => {
			// status 조건을 where에 두면 응답에 상태 어휘가 섞이지 않는다 — 화면이
			// crawled_post_status(active/needs_review/expired)를 알아야 할 이유가 없다.
			// needs_review(업종 미지정)·expired는 목록에도 안 나오는 공고다.
			const [post] = await db
				.select(PUBLIC_COLUMNS)
				.from(crawledJobPost)
				.where(
					and(
						eq(crawledJobPost.id, input.id),
						eq(crawledJobPost.status, "active")
					)
				)
				.limit(1);

			if (!post) {
				throw new ORPCError("NOT_FOUND");
			}

			return post;
		}),
};
