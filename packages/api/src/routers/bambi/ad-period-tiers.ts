import { db } from "@bambi-app/db";
import { bambiAdPeriodTier } from "@bambi-app/db/schema/bambi";
import { ORPCError } from "@orpc/server";
import { asc, eq } from "drizzle-orm";
import z from "zod";

import { adminProcedure, publicProcedure } from "../../index";
import {
	isAdPeriodTierColorClassValid,
	isAdPeriodTierRangeValid,
} from "../../services/bambi-ad-period-tiers";

const DAYS_MAX = 100_000;
const RANGE_REFINE = {
	message: "최소 일수는 최대 일수보다 클 수 없습니다.",
	path: ["maxDays"],
};

const tierShape = z.object({
	// 아이콘 색: Tailwind 텍스트 색 유틸만 허용(raw hex 금지). 브랜드색 text-primary 포함.
	colorClass: z.string().trim().refine(isAdPeriodTierColorClassValid),
	icon: z.enum(["crown", "medal"]),
	label: z.string().trim().min(1).max(20),
	maxDays: z.number().int().min(0).max(DAYS_MAX).nullable(),
	minDays: z.number().int().min(0).max(DAYS_MAX),
	sortOrder: z.number().int().min(0).max(1000).optional(),
});

const isRangeValid = (value: { maxDays: null | number; minDays: number }) =>
	isAdPeriodTierRangeValid(value.minDays, value.maxDays);

const createTierInput = tierShape.refine(isRangeValid, RANGE_REFINE);
const updateTierInput = tierShape
	.extend({ id: z.string().uuid() })
	.refine(isRangeValid, RANGE_REFINE);
const tierIdInput = z.object({ id: z.string().uuid() });

export const adPeriodTiersRouter = {
	// 공개: 카드 배지·구인자 안내 등급표가 운영자 설정 등급을 읽는다. sort_order → min_days 순.
	list: publicProcedure.handler(async () =>
		db
			.select()
			.from(bambiAdPeriodTier)
			.orderBy(asc(bambiAdPeriodTier.sortOrder), asc(bambiAdPeriodTier.minDays))
	),

	create: adminProcedure.input(createTierInput).handler(async ({ input }) => {
		const [created] = await db
			.insert(bambiAdPeriodTier)
			.values({
				colorClass: input.colorClass,
				icon: input.icon,
				label: input.label,
				maxDays: input.maxDays,
				minDays: input.minDays,
				// 지정이 없으면 최소 일수를 정렬 키로 써 자연 오름차순으로 쌓인다(별도 순서 UI 없음).
				sortOrder: input.sortOrder ?? input.minDays,
			})
			.returning({ id: bambiAdPeriodTier.id });
		return created;
	}),

	update: adminProcedure.input(updateTierInput).handler(async ({ input }) => {
		const [updated] = await db
			.update(bambiAdPeriodTier)
			.set({
				colorClass: input.colorClass,
				icon: input.icon,
				label: input.label,
				maxDays: input.maxDays,
				minDays: input.minDays,
				...(input.sortOrder === undefined
					? {}
					: { sortOrder: input.sortOrder }),
			})
			.where(eq(bambiAdPeriodTier.id, input.id))
			.returning({ id: bambiAdPeriodTier.id });
		if (!updated) {
			throw new ORPCError("NOT_FOUND", { message: "등급을 찾을 수 없습니다." });
		}
		return updated;
	}),

	remove: adminProcedure.input(tierIdInput).handler(async ({ input }) => {
		await db
			.delete(bambiAdPeriodTier)
			.where(eq(bambiAdPeriodTier.id, input.id));
		return { id: input.id };
	}),
};
