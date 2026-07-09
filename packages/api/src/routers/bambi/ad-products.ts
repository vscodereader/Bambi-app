import { db } from "@bambi-app/db";
import { adPlacement, adProduct } from "@bambi-app/db/schema/bambi";
import { asc, eq } from "drizzle-orm";

import { protectedProcedure } from "../../index";
import { requireAdminProfile } from "../../services/bambi-authz";

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
};
