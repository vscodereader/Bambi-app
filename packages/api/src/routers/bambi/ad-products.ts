import { db } from "@bambi-app/db";
import {
	adPlacement,
	adProduct,
	adProductDiscountCampaign,
} from "@bambi-app/db/schema/bambi";
import { ORPCError } from "@orpc/server";
import { and, asc, eq, inArray, notInArray } from "drizzle-orm";
import z from "zod";

import { protectedProcedure } from "../../index";
import {
	discountCampaignStatus,
	loadDiscountCampaigns,
	resolveEffectiveAdPrice,
} from "../../services/bambi-ad-discount-campaigns";
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

const discountCampaignInputSchema = z
	.object({
		discountPercent: z.number().int().min(0).max(100),
		endsAt: z.coerce.date().nullable(),
		priceOptionDays: z.number().int().min(1),
		startsAt: z.coerce.date(),
	})
	.refine(
		(campaign) =>
			!campaign.endsAt ||
			campaign.endsAt.getTime() >= campaign.startsAt.getTime(),
		{
			message: "종료 일시는 시작 일시보다 빠를 수 없습니다.",
			path: ["endsAt"],
		}
	);

const discountCampaignsSchema = z
	.array(discountCampaignInputSchema)
	.superRefine((campaigns, context) => {
		const seenDays = new Set<number>();
		for (const [index, campaign] of campaigns.entries()) {
			if (seenDays.has(campaign.priceOptionDays)) {
				context.addIssue({
					code: "custom",
					message: "같은 이용 기간에는 기간 할인을 하나만 설정할 수 있습니다.",
					path: [index, "priceOptionDays"],
				});
			}
			seenDays.add(campaign.priceOptionDays);
		}
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
	discountCampaigns: discountCampaignsSchema.default([]),
	previewTemplate: previewTemplateSchema.optional(),
	previewImageUrl: previewImageUrlSchema,
	manualBoostsPerDay: z.number().int().min(0).default(0),
	autoBoostsPerDay: z.number().int().min(0).default(0),
	// 상세이미지 디자인 제작 애드온 가격. 비우면(null) 이 상품에는 옵션을 팔지 않는다.
	detailDesignPrice: z.number().int().min(0).nullish(),
	sortOrder: z.number().int().min(0).default(0),
});

const updateProductInput = z.object({
	id: z.string().uuid(),
	name: z.string().min(1).max(120).optional(),
	tagline: z.string().max(200).nullish(),
	benefits: z.array(z.string().min(1)).optional(),
	priceOptions: z.array(priceOptionSchema).min(1).optional(),
	discountCampaigns: discountCampaignsSchema.optional(),
	previewTemplate: previewTemplateSchema.optional(),
	previewImageUrl: previewImageUrlSchema,
	manualBoostsPerDay: z.number().int().min(0).optional(),
	autoBoostsPerDay: z.number().int().min(0).optional(),
	// nullish라 명시적 null이 오면 옵션 미제공으로 되돌린다(키 생략은 기존 값 유지).
	detailDesignPrice: z.number().int().min(0).nullish(),
	sortOrder: z.number().int().min(0).optional(),
	isActive: z.boolean().optional(),
});

type AdProductDiscountCampaignInput = z.infer<
	typeof discountCampaignInputSchema
>;
type DbTransaction = Parameters<Parameters<typeof db.transaction>[0]>[0];

const assertCampaignOptionsExist = (
	campaigns: AdProductDiscountCampaignInput[],
	priceOptions: { days: number }[]
) => {
	const optionDays = new Set(priceOptions.map((option) => option.days));
	if (campaigns.some((campaign) => !optionDays.has(campaign.priceOptionDays))) {
		throw new ORPCError("BAD_REQUEST", {
			message: "존재하지 않는 가격 옵션에는 기간 할인을 설정할 수 없습니다.",
		});
	}
};

const toExclusiveEnd = (endsAt: Date | null | undefined) =>
	endsAt ? new Date(endsAt.getTime() + 60_000) : null;

const sameCampaign = (
	existing: typeof adProductDiscountCampaign.$inferSelect | undefined,
	desired: AdProductDiscountCampaignInput,
	endsAtExclusive: Date | null
) =>
	Boolean(
		existing &&
			existing.discountPercent === desired.discountPercent &&
			existing.startsAt.getTime() === desired.startsAt.getTime() &&
			existing.endsAtExclusive?.getTime() === endsAtExclusive?.getTime()
	);

const syncDiscountCampaigns = async ({
	campaigns,
	productId,
	tx,
	userId,
}: {
	campaigns: AdProductDiscountCampaignInput[];
	productId: string;
	tx: DbTransaction;
	userId: string;
}) => {
	const now = new Date();
	const existingCampaigns = await tx
		.select()
		.from(adProductDiscountCampaign)
		.where(eq(adProductDiscountCampaign.adProductId, productId));
	const open = existingCampaigns.filter(
		(campaign) =>
			!campaign.cancelledAt &&
			(!campaign.endsAtExclusive || campaign.endsAtExclusive > now)
	);
	const desiredDays = new Set(
		campaigns.map((campaign) => campaign.priceOptionDays)
	);
	const toCancel = open.filter(
		(campaign) => !desiredDays.has(campaign.priceOptionDays)
	);
	if (toCancel.length > 0) {
		await tx
			.update(adProductDiscountCampaign)
			.set({ cancelledAt: now, updatedAt: now })
			.where(
				inArray(
					adProductDiscountCampaign.id,
					toCancel.map((campaign) => campaign.id)
				)
			);
	}
	for (const campaign of campaigns) {
		const old = open.find(
			(item) => item.priceOptionDays === campaign.priceOptionDays
		);
		const endsAtExclusive = toExclusiveEnd(campaign.endsAt);
		if (sameCampaign(old, campaign, endsAtExclusive)) {
			continue;
		}
		const [created] = await tx
			.insert(adProductDiscountCampaign)
			.values({
				adProductId: productId,
				createdByUserId: userId,
				discountPercent: campaign.discountPercent,
				endsAtExclusive,
				priceOptionDays: campaign.priceOptionDays,
				startsAt: campaign.startsAt,
			})
			.returning({ id: adProductDiscountCampaign.id });
		if (old && created) {
			await tx
				.update(adProductDiscountCampaign)
				.set({
					cancelledAt: now,
					supersededById: created.id,
					updatedAt: now,
				})
				.where(eq(adProductDiscountCampaign.id, old.id));
		}
	}
};

export const adProductsRouter = {
	getCatalog: protectedProcedure.handler(async () => {
		const placements = await db.query.adPlacement.findMany({
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
		});
		const products = placements.flatMap((placement) => placement.products);
		const campaigns = await loadDiscountCampaigns(
			products.map((product) => product.id)
		);
		const now = new Date();
		return placements.map((placement) => ({
			...placement,
			products: placement.products.map((product) => {
				const productCampaigns = campaigns.filter(
					(campaign) => campaign.adProductId === product.id
				);
				const priceOptions = product.priceOptions.map((option) => {
					const resolved = resolveEffectiveAdPrice({
						amount: option.amount,
						baseDiscountPercent: option.discountPercent ?? 0,
						campaigns: productCampaigns.filter(
							(campaign) => campaign.priceOptionDays === option.days
						),
						now,
					});
					return {
						...option,
						...(resolved.campaignStartsAt
							? {
									campaignEndsAt: resolved.campaignEndsAt,
									campaignStartsAt: resolved.campaignStartsAt,
								}
							: {}),
						...(resolved.discountPercent > 0
							? { discountPercent: resolved.discountPercent }
							: {}),
						...(resolved.nextPricingChangeAt
							? { nextPricingChangeAt: resolved.nextPricingChangeAt }
							: {}),
					};
				});
				return { ...product, priceOptions };
			}),
		}));
	}),

	// 프리미엄 광고(배너 3종 통합 풀)의 남은 자리·정원. 광고 안내 페이지가 "N/10" 표시와
	// 정원 만석 안내에 쓴다. getCatalog와 같은 protected 조회다.
	premiumCapacity: protectedProcedure.handler(async () => {
		const { activeCount, capacity, pendingCount, remaining } =
			await derivePremiumQueue(db, new Date());
		return { activeCount, capacity, pendingCount, remaining };
	}),

	listCatalogAdmin: protectedProcedure.handler(async ({ context }) => {
		await requireAdminProfile(context.session);
		const placements = await db.query.adPlacement.findMany({
			orderBy: [asc(adPlacement.sortOrder), asc(adPlacement.createdAt)],
			with: {
				products: {
					orderBy: [asc(adProduct.sortOrder), asc(adProduct.createdAt)],
				},
			},
		});
		const products = placements.flatMap((placement) => placement.products);
		const campaigns = await loadDiscountCampaigns(
			products.map((product) => product.id)
		);
		const now = new Date();
		return placements.map((placement) => ({
			...placement,
			products: placement.products.map((product) => {
				const productCampaigns = campaigns.filter(
					(campaign) => campaign.adProductId === product.id
				);
				return {
					...product,
					priceOptions: product.priceOptions.map((option) => {
						const resolved = resolveEffectiveAdPrice({
							amount: option.amount,
							baseDiscountPercent: option.discountPercent ?? 0,
							campaigns: productCampaigns.filter(
								(campaign) => campaign.priceOptionDays === option.days
							),
							now,
						});
						return {
							...option,
							effectiveAmount: resolved.amount,
							effectiveDiscountPercent: resolved.discountPercent,
							nextPricingChangeAt: resolved.nextPricingChangeAt,
						};
					}),
					discountCampaigns: productCampaigns.map((campaign) => ({
						...campaign,
						endsAt: campaign.endsAtExclusive
							? new Date(campaign.endsAtExclusive.getTime() - 60_000)
							: null,
						status: discountCampaignStatus(campaign, now),
					})),
				};
			}),
		}));
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
			assertCampaignOptionsExist(input.discountCampaigns, input.priceOptions);
			// previewTemplate 미지정 시 컬럼 기본값 "none"(비배너)로 검증한다.
			assertBannerHasNoBoost({
				autoBoostsPerDay: input.autoBoostsPerDay,
				manualBoostsPerDay: input.manualBoostsPerDay,
				previewTemplate: input.previewTemplate ?? "none",
			});
			const { discountCampaigns, ...productInput } = input;
			const created = await db.transaction(async (tx) => {
				const [product] = await tx
					.insert(adProduct)
					.values(productInput)
					.returning();
				if (!product) {
					return null;
				}
				if (discountCampaigns.length > 0) {
					await tx.insert(adProductDiscountCampaign).values(
						discountCampaigns.map((campaign) => ({
							adProductId: product.id,
							createdByUserId: context.session.user.id,
							discountPercent: campaign.discountPercent,
							endsAtExclusive: campaign.endsAt
								? new Date(campaign.endsAt.getTime() + 60_000)
								: null,
							priceOptionDays: campaign.priceOptionDays,
							startsAt: campaign.startsAt,
						}))
					);
				}
				return product;
			});
			if (!created) {
				throw new ORPCError("INTERNAL_SERVER_ERROR");
			}
			return created;
		}),

	updateProduct: protectedProcedure
		.input(updateProductInput)
		.handler(async ({ context, input }) => {
			await requireAdminProfile(context.session);
			const { discountCampaigns, id, ...patch } = input;
			// 부분 수정이라 미지정 필드는 기존 값을 유지한다. 템플릿만 배너형으로 바꾸면서
			// 기존 끌어올리기 값이 남는 경우도 잡으려면 최종 상태를 기존 행과 합쳐 검증해야 한다.
			const existing = await db.query.adProduct.findFirst({
				where: eq(adProduct.id, id),
			});
			if (!existing) {
				throw new ORPCError("NOT_FOUND");
			}
			if (discountCampaigns) {
				assertCampaignOptionsExist(
					discountCampaigns,
					patch.priceOptions ?? existing.priceOptions
				);
			}
			assertBannerHasNoBoost({
				autoBoostsPerDay: patch.autoBoostsPerDay ?? existing.autoBoostsPerDay,
				manualBoostsPerDay:
					patch.manualBoostsPerDay ?? existing.manualBoostsPerDay,
				previewTemplate: patch.previewTemplate ?? existing.previewTemplate,
			});
			const updated = await db.transaction(async (tx) => {
				const [product] = await tx
					.update(adProduct)
					.set(patch)
					.where(eq(adProduct.id, id))
					.returning();
				if (!product) {
					return null;
				}
				if (patch.priceOptions) {
					const days = patch.priceOptions.map((option) => option.days);
					await tx
						.delete(adProductDiscountCampaign)
						.where(
							and(
								eq(adProductDiscountCampaign.adProductId, id),
								notInArray(adProductDiscountCampaign.priceOptionDays, days)
							)
						);
				}
				if (discountCampaigns) {
					await syncDiscountCampaigns({
						campaigns: discountCampaigns,
						productId: id,
						tx,
						userId: context.session.user.id,
					});
				}
				return product;
			});
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
