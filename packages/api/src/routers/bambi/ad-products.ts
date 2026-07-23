import { db } from "@bambi-app/db";
import { adPlacement, adProduct } from "@bambi-app/db/schema/bambi";
import { ORPCError } from "@orpc/server";
import { and, asc, eq, notInArray } from "drizzle-orm";
import z from "zod";

import { protectedProcedure } from "../../index";
import {
	AD_BANNER_EXPOSURE_TYPES,
	type AdPreviewTemplate,
	previewTemplateToExposureType,
} from "../../services/bambi-ad-exposure";
import { requireAdminProfile } from "../../services/bambi-authz";
import { derivePremiumQueue } from "../../services/bambi-premium-capacity";

// 배너형 미리보기 템플릿(premium-top / side-horizontal / side-vertical)은 끌어올리기 비대상이다.
// 노출 타입으로 환산해 배너 여부를 판정한다(previewTemplate→exposureType 단일 소스 재사용).
const isBannerTemplate = (template: string): boolean =>
	(AD_BANNER_EXPOSURE_TYPES as readonly string[]).includes(
		previewTemplateToExposureType(template as AdPreviewTemplate)
	);

// 배너형 상품에 끌어올리기(수동·자동) 값을 저장하려 하면 거부한다. create·update 모두에서
// 최종 상태(템플릿·끌어올리기 값)를 기준으로 검증한다.
const assertBannerHasNoBoost = (finalState: {
	autoBoostsPerDay: number;
	manualBoostsPerDay: number;
	previewTemplate: string;
}): void => {
	if (
		isBannerTemplate(finalState.previewTemplate) &&
		(finalState.manualBoostsPerDay > 0 || finalState.autoBoostsPerDay > 0)
	) {
		throw new ORPCError("BAD_REQUEST", {
			message:
				"배너 광고 상품에는 끌어올리기를 설정할 수 없습니다. 끌어올리기는 리스팅 광고(스페셜·급구·추천)에서만 제공됩니다.",
		});
	}
};

const placementKindSchema = z.enum(["listing", "banner"]);

const previewTemplateSchema = z.enum([
	"premium-top",
	"special-list",
	"urgent-list",
	"recommended-list",
	"side-vertical",
	"side-horizontal",
	"none",
]);

const createPlacementInput = z.object({
	name: z.string().min(1).max(120),
	description: z.string().max(500).optional(),
	kind: placementKindSchema.default("listing"),
	sortOrder: z.number().int().min(0).default(0),
});

const updatePlacementInput = z.object({
	id: z.string().uuid(),
	name: z.string().min(1).max(120).optional(),
	description: z.string().max(500).nullish(),
	kind: placementKindSchema.optional(),
	sortOrder: z.number().int().min(0).optional(),
	isActive: z.boolean().optional(),
});

const priceOptionSchema = z.object({
	amount: z.number().int().min(0),
	days: z.number().int().min(1),
	// 옵션별 할인율(0~100 정수 %). 없거나 0이면 할인 없음.
	discountPercent: z.number().int().min(0).max(100).optional(),
});

const previewImageUrlSchema = z
	.string()
	.max(3_000_000)
	.refine(
		(val) =>
			val.length === 0 ||
			val.startsWith("data:image/") ||
			val.startsWith("http"),
		{ message: "Invalid preview image" }
	)
	.nullish();

const createProductInput = z.object({
	placementId: z.string().uuid(),
	name: z.string().min(1).max(120),
	tagline: z.string().max(200).optional(),
	benefits: z.array(z.string().min(1)).default([]),
	priceOptions: z.array(priceOptionSchema).min(1),
	previewTemplate: previewTemplateSchema.optional(),
	previewImageUrl: previewImageUrlSchema,
	manualBoostsPerDay: z.number().int().min(0).default(0),
	autoBoostsPerDay: z.number().int().min(0).default(0),
	sortOrder: z.number().int().min(0).default(0),
});

const updateProductInput = z.object({
	id: z.string().uuid(),
	name: z.string().min(1).max(120).optional(),
	tagline: z.string().max(200).nullish(),
	benefits: z.array(z.string().min(1)).optional(),
	priceOptions: z.array(priceOptionSchema).min(1).optional(),
	previewTemplate: previewTemplateSchema.optional(),
	previewImageUrl: previewImageUrlSchema,
	manualBoostsPerDay: z.number().int().min(0).optional(),
	autoBoostsPerDay: z.number().int().min(0).optional(),
	sortOrder: z.number().int().min(0).optional(),
	isActive: z.boolean().optional(),
});

export const adProductsRouter = {
	getCatalog: protectedProcedure.handler(
		async () =>
			await db.query.adPlacement.findMany({
				where: eq(adPlacement.isActive, true),
				orderBy: [asc(adPlacement.sortOrder), asc(adPlacement.createdAt)],
				with: {
					products: {
						// 좌/우 사이드 배너(side-horizontal·side-vertical)는 프리미엄 광고로 통합돼
						// 신규 구매를 차단한다. 레거시 데이터(이미 팔린 공고)는 계속 노출하되
						// 구인자 구매 카탈로그에서만 제외한다. 운영자 관리(listCatalogAdmin)에는 계속 노출.
						where: and(
							eq(adProduct.isActive, true),
							notInArray(adProduct.previewTemplate, [
								"side-horizontal",
								"side-vertical",
							])
						),
						orderBy: [asc(adProduct.sortOrder), asc(adProduct.createdAt)],
					},
				},
			})
	),

	// 프리미엄 광고(배너 3종 통합 풀)의 남은 자리·정원. 광고 안내 페이지가 "N/10" 표시와
	// 정원 만석 안내에 쓴다. getCatalog와 같은 protected 조회다.
	premiumCapacity: protectedProcedure.handler(async () => {
		const { activeCount, capacity, pendingCount, remaining } =
			await derivePremiumQueue(db, new Date());
		return { activeCount, capacity, pendingCount, remaining };
	}),

	listCatalogAdmin: protectedProcedure.handler(async ({ context }) => {
		await requireAdminProfile(context.session);
		return await db.query.adPlacement.findMany({
			orderBy: [asc(adPlacement.sortOrder), asc(adPlacement.createdAt)],
			with: {
				products: {
					orderBy: [asc(adProduct.sortOrder), asc(adProduct.createdAt)],
				},
			},
		});
	}),

	createPlacement: protectedProcedure
		.input(createPlacementInput)
		.handler(async ({ context, input }) => {
			await requireAdminProfile(context.session);
			const [created] = await db.insert(adPlacement).values(input).returning();
			if (!created) {
				throw new ORPCError("INTERNAL_SERVER_ERROR");
			}
			return created;
		}),

	updatePlacement: protectedProcedure
		.input(updatePlacementInput)
		.handler(async ({ context, input }) => {
			await requireAdminProfile(context.session);
			const { id, ...patch } = input;
			const [updated] = await db
				.update(adPlacement)
				.set(patch)
				.where(eq(adPlacement.id, id))
				.returning();
			if (!updated) {
				throw new ORPCError("NOT_FOUND");
			}
			return updated;
		}),

	deletePlacement: protectedProcedure
		.input(z.object({ id: z.string().uuid() }))
		.handler(async ({ context, input }) => {
			await requireAdminProfile(context.session);
			const [deleted] = await db
				.delete(adPlacement)
				.where(eq(adPlacement.id, input.id))
				.returning({ id: adPlacement.id });
			if (!deleted) {
				throw new ORPCError("NOT_FOUND");
			}
			return deleted;
		}),

	reorderPlacements: protectedProcedure
		.input(z.object({ ids: z.array(z.string().uuid()).min(1) }))
		.handler(async ({ context, input }) => {
			await requireAdminProfile(context.session);
			await db.transaction(async (tx) => {
				for (const [i, id] of input.ids.entries()) {
					await tx
						.update(adPlacement)
						.set({ sortOrder: i })
						.where(eq(adPlacement.id, id));
				}
			});
			return { ok: true as const };
		}),

	createProduct: protectedProcedure
		.input(createProductInput)
		.handler(async ({ context, input }) => {
			await requireAdminProfile(context.session);
			// previewTemplate 미지정 시 컬럼 기본값 "none"(비배너)로 검증한다.
			assertBannerHasNoBoost({
				autoBoostsPerDay: input.autoBoostsPerDay,
				manualBoostsPerDay: input.manualBoostsPerDay,
				previewTemplate: input.previewTemplate ?? "none",
			});
			const [created] = await db.insert(adProduct).values(input).returning();
			if (!created) {
				throw new ORPCError("INTERNAL_SERVER_ERROR");
			}
			return created;
		}),

	updateProduct: protectedProcedure
		.input(updateProductInput)
		.handler(async ({ context, input }) => {
			await requireAdminProfile(context.session);
			const { id, ...patch } = input;
			// 부분 수정이라 미지정 필드는 기존 값을 유지한다. 템플릿만 배너형으로 바꾸면서
			// 기존 끌어올리기 값이 남는 경우도 잡으려면 최종 상태를 기존 행과 합쳐 검증해야 한다.
			const existing = await db.query.adProduct.findFirst({
				where: eq(adProduct.id, id),
			});
			if (!existing) {
				throw new ORPCError("NOT_FOUND");
			}
			assertBannerHasNoBoost({
				autoBoostsPerDay: patch.autoBoostsPerDay ?? existing.autoBoostsPerDay,
				manualBoostsPerDay:
					patch.manualBoostsPerDay ?? existing.manualBoostsPerDay,
				previewTemplate: patch.previewTemplate ?? existing.previewTemplate,
			});
			const [updated] = await db
				.update(adProduct)
				.set(patch)
				.where(eq(adProduct.id, id))
				.returning();
			if (!updated) {
				throw new ORPCError("NOT_FOUND");
			}
			return updated;
		}),

	deleteProduct: protectedProcedure
		.input(z.object({ id: z.string().uuid() }))
		.handler(async ({ context, input }) => {
			await requireAdminProfile(context.session);
			const [deleted] = await db
				.delete(adProduct)
				.where(eq(adProduct.id, input.id))
				.returning({ id: adProduct.id });
			if (!deleted) {
				throw new ORPCError("NOT_FOUND");
			}
			return deleted;
		}),

	reorderProducts: protectedProcedure
		.input(
			z.object({
				placementId: z.string().uuid(),
				ids: z.array(z.string().uuid()).min(1),
			})
		)
		.handler(async ({ context, input }) => {
			await requireAdminProfile(context.session);
			await db.transaction(async (tx) => {
				for (const [i, id] of input.ids.entries()) {
					await tx
						.update(adProduct)
						.set({ sortOrder: i })
						.where(
							and(
								eq(adProduct.id, id),
								eq(adProduct.placementId, input.placementId)
							)
						);
				}
			});
			return { ok: true as const };
		}),
};
