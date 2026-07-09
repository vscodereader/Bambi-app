import { db } from "@bambi-app/db";
import { adPlacement, adProduct } from "@bambi-app/db/schema/bambi";
import { ORPCError } from "@orpc/server";
import { asc, eq } from "drizzle-orm";
import z from "zod";

import { protectedProcedure } from "../../index";
import { requireAdminProfile } from "../../services/bambi-authz";

const placementKindSchema = z.enum(["listing", "banner"]);

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

export const adProductsRouter = {
	getCatalog: protectedProcedure.handler(
		async () =>
			await db.query.adPlacement.findMany({
				where: eq(adPlacement.isActive, true),
				orderBy: [asc(adPlacement.sortOrder), asc(adPlacement.createdAt)],
				with: {
					products: {
						where: eq(adProduct.isActive, true),
						orderBy: [asc(adProduct.sortOrder), asc(adProduct.createdAt)],
					},
				},
			})
	),

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
};
