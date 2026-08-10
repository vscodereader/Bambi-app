import { db } from "@bambi-app/db";
import {
	adminModerationAction,
	employerOrganizationProfile,
	jobBoostOption,
	jobBoostPurchase,
	jobPost,
} from "@bambi-app/db/schema/bambi";
import { ORPCError } from "@orpc/server";
import { and, desc, eq } from "drizzle-orm";
import z from "zod";

import {
	adminProcedure,
	protectedProcedure,
	publicProcedure,
} from "../../index";
import { AD_BANNER_EXPOSURE_TYPES } from "../../services/bambi-ad-exposure";
import {
	requireActiveBambiProfile,
	requireAdminProfile,
	requireEmployerPostingAccess,
} from "../../services/bambi-authz";
import {
	type BoostPurchaseLike,
	isBoostPurchaseActive,
} from "../../services/bambi-job-boost";
import { notifyModerationAction } from "../../services/bambi-notifications";

const MS_PER_DAY = 24 * 60 * 60 * 1000;

const optionTypeSchema = z.enum([
	"manual_period",
	"manual_count",
	"auto_period",
]);

// 기간제(manual_period·auto_period)는 하루 횟수·기간을 쓰고, 횟수권(manual_count)은 총 횟수만 쓴다.
const isPeriodOption = (
	optionType: z.infer<typeof optionTypeSchema>
): boolean => optionType !== "manual_count";

const upsertOptionInput = z.object({
	optionType: optionTypeSchema,
	// null = 미판매(구인자 화면에서 옵션 자체가 숨는다). 0 이상 정수면 판매가.
	price: z.number().int().min(0).nullable(),
	boostsPerDay: z.number().int().positive().optional(),
	durationDays: z.number().int().positive().optional(),
	boostCount: z.number().int().positive().optional(),
});

const purchaseOptionInput = z.object({
	jobPostId: z.string().uuid(),
	optionType: optionTypeSchema,
	paymentMethod: z.enum(["bank_transfer", "card"]),
});

const cancelPurchaseInput = z.object({
	purchaseId: z.string().uuid(),
});

const listPurchasesForPaymentInput = z.object({
	onlyUnpaid: z.boolean().default(false),
	limit: z.number().int().min(1).max(100).default(50),
});

const confirmPurchasePaymentInput = z.object({
	purchaseId: z.string().uuid(),
	paymentStatus: z.enum(["paid", "unpaid"]),
});

const PERIOD_SPEC_MESSAGE =
	"판매 중인 기간제 옵션은 하루 끌어올리기 횟수와 기간(일)을 1 이상으로 입력해야 합니다.";
const COUNT_SPEC_MESSAGE =
	"판매 중인 횟수권 옵션은 끌어올리기 횟수를 1 이상으로 입력해야 합니다.";
const BANNER_REJECT_MESSAGE =
	"배너 광고 공고에는 끌어올리기 옵션을 제공하지 않습니다.";
const DUPLICATE_UNPAID_MESSAGE = "입금 확인 대기 중인 같은 옵션이 있습니다.";
const ACTIVE_PERIOD_MESSAGE =
	"이미 적용 중인 옵션입니다. 만료 후 다시 구매해 주세요.";
const CANCEL_PAID_MESSAGE = "입금 확인된 구매는 취소할 수 없습니다.";
const REVERT_USED_COUNT_MESSAGE =
	"이미 사용된 횟수권 구매는 미결제로 되돌릴 수 없습니다.";

export const boostOptionsRouter = {
	// 판매 중(가격 not null)인 옵션만 구인자에게 노출한다.
	listOptions: publicProcedure.handler(async () => {
		const rows = await db
			.select({
				optionType: jobBoostOption.optionType,
				price: jobBoostOption.price,
				boostsPerDay: jobBoostOption.boostsPerDay,
				durationDays: jobBoostOption.durationDays,
				boostCount: jobBoostOption.boostCount,
			})
			.from(jobBoostOption);

		return rows.filter((row) => row.price !== null);
	}),

	// 운영자 카탈로그 화면용. 미설정 유형은 기본값 null 행으로 합성해 항상 3개를 돌려준다.
	listOptionsByAdmin: adminProcedure.handler(async ({ context }) => {
		await requireAdminProfile(context.session);

		const rows = await db
			.select({
				optionType: jobBoostOption.optionType,
				price: jobBoostOption.price,
				boostsPerDay: jobBoostOption.boostsPerDay,
				durationDays: jobBoostOption.durationDays,
				boostCount: jobBoostOption.boostCount,
			})
			.from(jobBoostOption);
		const byType = new Map(rows.map((row) => [row.optionType, row]));

		return optionTypeSchema.options.map(
			(optionType) =>
				byType.get(optionType) ?? {
					optionType,
					price: null,
					boostsPerDay: null,
					durationDays: null,
					boostCount: null,
				}
		);
	}),

	// 운영자 옵션 등록·수정. optionType unique upsert. 판매 시 유형별 필수 스펙을 검증한다.
	upsertOption: adminProcedure
		.input(upsertOptionInput)
		.handler(async ({ context, input }) => {
			await requireAdminProfile(context.session);

			const period = isPeriodOption(input.optionType);

			if (input.price !== null) {
				if (period && !(input.boostsPerDay && input.durationDays)) {
					throw new ORPCError("BAD_REQUEST", { message: PERIOD_SPEC_MESSAGE });
				}
				if (!(period || input.boostCount)) {
					throw new ORPCError("BAD_REQUEST", { message: COUNT_SPEC_MESSAGE });
				}
			}

			// 유형과 무관한 스펙 칸은 null로 정규화한다(기간제엔 boostCount, 횟수권엔 기간 칸이 남지 않게).
			const values = period
				? {
						optionType: input.optionType,
						price: input.price,
						boostsPerDay: input.boostsPerDay ?? null,
						durationDays: input.durationDays ?? null,
						boostCount: null,
					}
				: {
						optionType: input.optionType,
						price: input.price,
						boostCount: input.boostCount ?? null,
						boostsPerDay: null,
						durationDays: null,
					};

			const [row] = await db
				.insert(jobBoostOption)
				.values(values)
				.onConflictDoUpdate({
					target: jobBoostOption.optionType,
					set: {
						price: values.price,
						boostsPerDay: values.boostsPerDay,
						durationDays: values.durationDays,
						boostCount: values.boostCount,
					},
				})
				.returning();

			return row;
		}),

	// 구인자가 공고에 옵션을 구매한다(무통장입금 등 입금 확인 전까지 unpaid). 반환은 { id, amount }.
	purchaseOption: protectedProcedure
		.input(purchaseOptionInput)
		.handler(async ({ context, input }) => {
			const [option] = await db
				.select({
					price: jobBoostOption.price,
					boostsPerDay: jobBoostOption.boostsPerDay,
					durationDays: jobBoostOption.durationDays,
					boostCount: jobBoostOption.boostCount,
				})
				.from(jobBoostOption)
				.where(eq(jobBoostOption.optionType, input.optionType))
				.limit(1);

			// 판매 중이 아닌(가격 null·미등록) 옵션은 구매할 수 없다.
			if (!option || option.price === null) {
				throw new ORPCError("BAD_REQUEST", {
					message: "판매 중이 아닌 옵션입니다.",
				});
			}

			const [post] = await db
				.select({
					exposureType: jobPost.exposureType,
					organizationId: jobPost.organizationId,
					teamId: jobPost.teamId,
				})
				.from(jobPost)
				.where(eq(jobPost.id, input.jobPostId))
				.limit(1);

			if (!post) {
				throw new ORPCError("NOT_FOUND");
			}

			// 배너형 공고는 끌어올리기 대상이 아니라 옵션도 팔지 않는다.
			if (
				(AD_BANNER_EXPOSURE_TYPES as readonly string[]).includes(
					post.exposureType
				)
			) {
				throw new ORPCError("BAD_REQUEST", { message: BANNER_REJECT_MESSAGE });
			}

			// promotions.boost와 동일한 공고 접근 판정(조직/팀 관리 권한)을 재사용한다.
			const actor = await requireEmployerPostingAccess({
				organizationId: post.organizationId,
				teamId: post.teamId,
				session: context.session,
			});

			const now = new Date();
			const price = option.price;

			// 공고 행을 잠가 동일 공고의 동시 구매를 직렬화한다(중복 unpaid 방지).
			const created = await db.transaction(async (tx) => {
				await tx
					.select({ id: jobPost.id })
					.from(jobPost)
					.where(eq(jobPost.id, input.jobPostId))
					.for("update");

				const existing = await tx
					.select({
						boostsPerDay: jobBoostPurchase.boostsPerDay,
						createdAt: jobBoostPurchase.createdAt,
						expiresAt: jobBoostPurchase.expiresAt,
						id: jobBoostPurchase.id,
						optionType: jobBoostPurchase.optionType,
						paymentStatus: jobBoostPurchase.paymentStatus,
						remainingCount: jobBoostPurchase.remainingCount,
					})
					.from(jobBoostPurchase)
					.where(
						and(
							eq(jobBoostPurchase.jobPostId, input.jobPostId),
							eq(jobBoostPurchase.optionType, input.optionType)
						)
					);

				if (existing.some((p) => p.paymentStatus === "unpaid")) {
					throw new ORPCError("BAD_REQUEST", {
						message: DUPLICATE_UNPAID_MESSAGE,
					});
				}

				// 기간제는 활성(paid·미만료) 동일 유형이 있으면 만료 전 중복 구매를 막는다.
				// 횟수권은 잔여가 남아 있어도 추가 구매를 허용한다(합산 소진).
				if (
					isPeriodOption(input.optionType) &&
					existing.some((p) =>
						isBoostPurchaseActive(p as BoostPurchaseLike, now)
					)
				) {
					throw new ORPCError("BAD_REQUEST", {
						message: ACTIVE_PERIOD_MESSAGE,
					});
				}

				// 옵션 스펙 4필드를 구매 시점 스냅샷으로 고정한다(운영자가 나중에 바꿔도 비소급).
				const [row] = await tx
					.insert(jobBoostPurchase)
					.values({
						jobPostId: input.jobPostId,
						organizationId: post.organizationId,
						buyerUserId: actor.userId,
						optionType: input.optionType,
						amount: price,
						boostsPerDay: option.boostsPerDay,
						durationDays: option.durationDays,
						boostCount: option.boostCount,
						paymentMethod: input.paymentMethod,
					})
					.returning({
						id: jobBoostPurchase.id,
						amount: jobBoostPurchase.amount,
					});

				return row;
			});

			return created;
		}),

	// 미결제(unpaid) 구매 취소. 구매자 본인·공고 접근 권한 보유자·운영자만.
	cancelPurchase: protectedProcedure
		.input(cancelPurchaseInput)
		.handler(async ({ context, input }) => {
			const profile = await requireActiveBambiProfile(context.session);

			const [purchase] = await db
				.select({
					id: jobBoostPurchase.id,
					buyerUserId: jobBoostPurchase.buyerUserId,
					paymentStatus: jobBoostPurchase.paymentStatus,
					organizationId: jobBoostPurchase.organizationId,
					teamId: jobPost.teamId,
				})
				.from(jobBoostPurchase)
				.innerJoin(jobPost, eq(jobPost.id, jobBoostPurchase.jobPostId))
				.where(eq(jobBoostPurchase.id, input.purchaseId))
				.limit(1);

			if (!purchase) {
				throw new ORPCError("NOT_FOUND");
			}

			// 본인·운영자가 아니면 공고 접근 권한을 요구한다(권한 없으면 requireEmployerPostingAccess가 차단).
			const isBuyer = purchase.buyerUserId === profile.userId;
			if (!(isBuyer || profile.role === "admin")) {
				await requireEmployerPostingAccess({
					organizationId: purchase.organizationId,
					teamId: purchase.teamId,
					session: context.session,
				});
			}

			if (purchase.paymentStatus !== "unpaid") {
				throw new ORPCError("BAD_REQUEST", { message: CANCEL_PAID_MESSAGE });
			}

			await db
				.delete(jobBoostPurchase)
				.where(eq(jobBoostPurchase.id, input.purchaseId));

			return { ok: true };
		}),

	// 운영자 입금 확인 큐. 구매 행 + 공고 제목·업체 표시명을 최신순으로 돌려준다.
	listPurchasesForPayment: adminProcedure
		.input(listPurchasesForPaymentInput)
		.handler(async ({ context, input }) => {
			await requireAdminProfile(context.session);

			const query = db
				.select({
					id: jobBoostPurchase.id,
					jobPostId: jobBoostPurchase.jobPostId,
					jobPostTitle: jobPost.title,
					organizationDisplayName: employerOrganizationProfile.displayName,
					optionType: jobBoostPurchase.optionType,
					amount: jobBoostPurchase.amount,
					paymentMethod: jobBoostPurchase.paymentMethod,
					paymentStatus: jobBoostPurchase.paymentStatus,
					boostsPerDay: jobBoostPurchase.boostsPerDay,
					durationDays: jobBoostPurchase.durationDays,
					boostCount: jobBoostPurchase.boostCount,
					remainingCount: jobBoostPurchase.remainingCount,
					activatedAt: jobBoostPurchase.activatedAt,
					expiresAt: jobBoostPurchase.expiresAt,
					createdAt: jobBoostPurchase.createdAt,
				})
				.from(jobBoostPurchase)
				.innerJoin(jobPost, eq(jobPost.id, jobBoostPurchase.jobPostId))
				.innerJoin(
					employerOrganizationProfile,
					eq(
						employerOrganizationProfile.organizationId,
						jobBoostPurchase.organizationId
					)
				)
				.orderBy(desc(jobBoostPurchase.createdAt))
				.limit(input.limit);

			if (input.onlyUnpaid) {
				return await query.where(eq(jobBoostPurchase.paymentStatus, "unpaid"));
			}

			return await query;
		}),

	// 운영자 입금 확인·정정. paid 전환 시 옵션을 활성화하고, unpaid 되돌림 시 세 활성 필드를 리셋한다.
	confirmPurchasePayment: adminProcedure
		.input(confirmPurchasePaymentInput)
		.handler(async ({ context, input }) => {
			const admin = await requireAdminProfile(context.session);

			const { jobPostId, optionType, updated } = await db.transaction(
				async (tx) => {
					const [locked] = await tx
						.select()
						.from(jobBoostPurchase)
						.where(eq(jobBoostPurchase.id, input.purchaseId))
						.for("update");

					if (!locked) {
						throw new ORPCError("NOT_FOUND");
					}

					// 같은 상태 재확정은 멱등 처리한다 — paid를 다시 걸어 횟수권 잔여가 초기화되는 사고를 막는다.
					if (locked.paymentStatus === input.paymentStatus) {
						return {
							jobPostId: locked.jobPostId,
							optionType: locked.optionType,
							updated: locked,
						};
					}

					const now = new Date();
					let patch: Partial<typeof jobBoostPurchase.$inferInsert>;

					if (input.paymentStatus === "paid") {
						patch =
							locked.optionType === "manual_count"
								? {
										paymentStatus: "paid",
										activatedAt: now,
										remainingCount: locked.boostCount,
										expiresAt: null,
									}
								: {
										paymentStatus: "paid",
										activatedAt: now,
										expiresAt: new Date(
											now.getTime() + (locked.durationDays ?? 0) * MS_PER_DAY
										),
										remainingCount: null,
									};
					} else {
						// 이미 차감된 횟수권을 unpaid로 되돌리면 잔여가 초기화돼 사용분이 되살아난다 → 막는다.
						if (
							locked.optionType === "manual_count" &&
							locked.remainingCount !== null &&
							locked.boostCount !== null &&
							locked.remainingCount < locked.boostCount
						) {
							throw new ORPCError("BAD_REQUEST", {
								message: REVERT_USED_COUNT_MESSAGE,
							});
						}

						patch = {
							paymentStatus: "unpaid",
							activatedAt: null,
							expiresAt: null,
							remainingCount: null,
						};
					}

					const [row] = await tx
						.update(jobBoostPurchase)
						.set(patch)
						.where(eq(jobBoostPurchase.id, input.purchaseId))
						.returning();

					await tx.insert(adminModerationAction).values({
						action: `set_boost_purchase_payment:${input.paymentStatus}`,
						adminUserId: admin.userId,
						metadata: {
							optionType: locked.optionType,
							previousStatus: locked.paymentStatus,
							purchaseId: locked.id,
						},
						reason: "끌어올리기 옵션 입금 상태 변경",
						targetId: locked.jobPostId,
						targetType: "job_post",
					});

					return {
						jobPostId: locked.jobPostId,
						optionType: locked.optionType,
						updated: row,
					};
				}
			);

			// 커밋 후 알림(best-effort). action·targetType·metadata.optionType 문자열은 웹 라벨과 바인딩돼 있다.
			await notifyModerationAction({
				action: `set_boost_purchase_payment:${input.paymentStatus}`,
				actorUserId: admin.userId,
				metadata: { optionType },
				targetId: jobPostId,
				targetType: "job_post",
			});

			return updated;
		}),
};
