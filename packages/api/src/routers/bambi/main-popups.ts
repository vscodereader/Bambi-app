import { db } from "@bambi-app/db";
import { member, user } from "@bambi-app/db/schema/auth";
import {
	bambiProfile,
	employerOrganizationProfile,
	mainPopup,
} from "@bambi-app/db/schema/bambi";
import { ORPCError } from "@orpc/server";
import { and, asc, eq, gt, inArray } from "drizzle-orm";
import z from "zod";

import { adminProcedure, publicProcedure } from "../../index";
import {
	hasPopupContent,
	isPopupScheduledNow,
	normalizePopupLink,
	popupImageAssetSchema,
	popupTextDocumentSchema,
} from "../../services/bambi-main-popups";

const countInput = z.object({ count: z.number().int().min(0) });
const deleteInput = z.object({ id: z.string().uuid() });

const saveInput = z
	.object({
		contentHeight: z.number().int().min(1),
		contentType: z.enum(["image", "text"]),
		contentWidth: z.number().int().min(1),
		editedImage: popupImageAssetSchema.nullable(),
		enabled: z.boolean(),
		endsAt: z.coerce.date().nullable(),
		expectedRevision: z.number().int().min(0),
		id: z.string().uuid(),
		linkPath: z.string().max(2000).nullable(),
		audience: z.enum(["common", "job_seeker", "employer"]),
		originalImage: popupImageAssetSchema.nullable(),
		startsAt: z.coerce.date().nullable(),
		textDocument: popupTextDocumentSchema.nullable(),
	})
	.superRefine((input, context) => {
		if (input.startsAt && input.endsAt && input.endsAt <= input.startsAt) {
			context.addIssue({
				code: "custom",
				message: "종료 일시는 시작 일시보다 늦어야 합니다.",
				path: ["endsAt"],
			});
		}
		if (input.contentType === "image" && input.textDocument) {
			context.addIssue({
				code: "custom",
				message: "이미지형 팝업에는 글 내용을 저장할 수 없습니다.",
				path: ["textDocument"],
			});
		}
		if (
			input.contentType === "text" &&
			(input.originalImage || input.editedImage || input.linkPath)
		) {
			context.addIssue({
				code: "custom",
				message: "글형 팝업에는 이미지나 이미지 링크를 저장할 수 없습니다.",
				path: ["contentType"],
			});
		}
	});

const adminColumns = {
	contentHeight: mainPopup.contentHeight,
	audience: mainPopup.audience,
	contentType: mainPopup.contentType,
	contentWidth: mainPopup.contentWidth,
	createdAt: mainPopup.createdAt,
	editedImage: mainPopup.editedImage,
	enabled: mainPopup.enabled,
	endsAt: mainPopup.endsAt,
	id: mainPopup.id,
	linkPath: mainPopup.linkPath,
	originalImage: mainPopup.originalImage,
	revision: mainPopup.revision,
	slotIndex: mainPopup.slotIndex,
	startsAt: mainPopup.startsAt,
	textDocument: mainPopup.textDocument,
	updatedAt: mainPopup.updatedAt,
} as const;

const publicColumns = {
	contentHeight: mainPopup.contentHeight,
	audience: mainPopup.audience,
	contentType: mainPopup.contentType,
	contentWidth: mainPopup.contentWidth,
	editedImage: mainPopup.editedImage,
	id: mainPopup.id,
	linkPath: mainPopup.linkPath,
	revision: mainPopup.revision,
	slotIndex: mainPopup.slotIndex,
	textDocument: mainPopup.textDocument,
} as const;

export const mainPopupsRouter = {
	listAdmin: adminProcedure.handler(async () => {
		const rows = await db
			.select({ ...adminColumns, updatedByName: user.name })
			.from(mainPopup)
			.leftJoin(user, eq(mainPopup.updatedByUserId, user.id))
			.orderBy(asc(mainPopup.slotIndex));
		return { count: rows.length, items: rows };
	}),

	listPublic: publicProcedure.handler(async ({ context }) => {
		const now = new Date();
		const userId = context.session?.user?.id;
		let allowedAudiences: Array<"common" | "job_seeker" | "employer"> = [
			"common",
		];
		if (userId) {
			const [profile] = await db
				.select({ role: bambiProfile.role })
				.from(bambiProfile)
				.where(eq(bambiProfile.userId, userId))
				.limit(1);
			if (profile?.role === "admin") {
				return { items: [] };
			}
			if (profile?.role === "job_seeker") {
				allowedAudiences = ["common", "job_seeker"];
			}
			if (profile?.role === "employer") {
				const [verified] = await db
					.select({ organizationId: member.organizationId })
					.from(member)
					.innerJoin(
						employerOrganizationProfile,
						eq(
							member.organizationId,
							employerOrganizationProfile.organizationId
						)
					)
					.where(
						and(
							eq(member.userId, userId),
							eq(member.status, "active"),
							eq(employerOrganizationProfile.verificationStatus, "verified")
						)
					)
					.limit(1);
				allowedAudiences = verified ? ["common", "employer"] : ["common"];
			}
		}
		const rows = await db
			.select({
				...publicColumns,
				endsAt: mainPopup.endsAt,
				startsAt: mainPopup.startsAt,
			})
			.from(mainPopup)
			.where(
				and(
					eq(mainPopup.enabled, true),
					inArray(mainPopup.audience, allowedAudiences)
				)
			)
			.orderBy(asc(mainPopup.slotIndex));
		return {
			items: rows.filter(
				(row) =>
					isPopupScheduledNow(row.startsAt, row.endsAt, now) &&
					hasPopupContent(row)
			),
		};
	}),

	setCount: adminProcedure.input(countInput).handler(async ({ input }) => {
		await db.transaction(async (transaction) => {
			const existing = await transaction
				.select({ slotIndex: mainPopup.slotIndex })
				.from(mainPopup)
				.orderBy(asc(mainPopup.slotIndex));
			const currentCount = existing.length;
			if (input.count < currentCount) {
				await transaction
					.delete(mainPopup)
					.where(gt(mainPopup.slotIndex, input.count));
				return;
			}
			if (input.count > currentCount) {
				await transaction.insert(mainPopup).values(
					Array.from({ length: input.count - currentCount }, (_, index) => ({
						slotIndex: currentCount + index + 1,
					}))
				);
			}
		});
		return { count: input.count };
	}),

	delete: adminProcedure.input(deleteInput).handler(async ({ input }) =>
		db.transaction(async (transaction) => {
			const [removed] = await transaction
				.delete(mainPopup)
				.where(eq(mainPopup.id, input.id))
				.returning({ slotIndex: mainPopup.slotIndex });
			if (!removed) {
				throw new ORPCError("NOT_FOUND", {
					message: "삭제할 팝업을 찾을 수 없습니다.",
				});
			}
			const subsequent = await transaction
				.select({ id: mainPopup.id, slotIndex: mainPopup.slotIndex })
				.from(mainPopup)
				.where(gt(mainPopup.slotIndex, removed.slotIndex))
				.orderBy(asc(mainPopup.slotIndex));
			for (const popup of subsequent) {
				await transaction
					.update(mainPopup)
					.set({ slotIndex: popup.slotIndex - 1 })
					.where(eq(mainPopup.id, popup.id));
			}
			const remaining = await transaction
				.select({ id: mainPopup.id })
				.from(mainPopup);
			return { count: remaining.length };
		})
	),

	save: adminProcedure.input(saveInput).handler(async ({ context, input }) => {
		const [existing] = await db
			.select({ startsAt: mainPopup.startsAt })
			.from(mainPopup)
			.where(eq(mainPopup.id, input.id))
			.limit(1);
		const currentMinute = new Date(Math.floor(Date.now() / 60_000) * 60_000);
		if (
			input.startsAt &&
			input.startsAt < currentMinute &&
			input.startsAt.getTime() !== existing?.startsAt?.getTime()
		) {
			throw new ORPCError("BAD_REQUEST", {
				message: "새 시작 일시는 현재 시각보다 이를 수 없습니다.",
			});
		}
		let linkPath: string | null;
		try {
			linkPath = normalizePopupLink(input.linkPath);
		} catch (error) {
			throw new ORPCError("BAD_REQUEST", {
				message: error instanceof Error ? error.message : "잘못된 링크입니다.",
			});
		}
		const [saved] = await db
			.update(mainPopup)
			.set({
				audience: input.audience,
				contentHeight: input.contentHeight,
				contentType: input.contentType,
				contentWidth: input.contentWidth,
				editedImage: input.editedImage,
				enabled: input.enabled,
				endsAt: input.endsAt,
				linkPath,
				originalImage: input.originalImage,
				revision: input.expectedRevision + 1,
				startsAt: input.startsAt,
				textDocument: input.textDocument,
				updatedAt: new Date(),
				updatedByUserId: context.session.user.id,
			})
			.where(
				and(
					eq(mainPopup.id, input.id),
					eq(mainPopup.revision, input.expectedRevision)
				)
			)
			.returning(adminColumns);
		if (!saved) {
			throw new ORPCError("CONFLICT", {
				message:
					"다른 운영자가 먼저 수정했습니다. 새로고침 후 다시 시도해 주세요.",
			});
		}
		return saved;
	}),
};
