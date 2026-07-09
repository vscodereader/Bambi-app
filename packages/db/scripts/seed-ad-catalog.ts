import { eq } from "drizzle-orm";
import { db } from "../src/index";
import { adPlacement, adProduct } from "../src/schema/bambi";

const SEED: {
	name: string;
	description: string;
	kind: "banner" | "listing";
	products: {
		name: string;
		tagline: string;
		benefits: string[];
		priceOptions: { amount: number; days: number }[];
	}[];
}[] = [
	{
		name: "스페셜 채용(프리미엄 노출)",
		description: "채용 마켓 최상단 스페셜 섹션에 노출됩니다.",
		kind: "listing",
		products: [
			{
				name: "프리미엄 광고",
				tagline: "스페셜 섹션 상단 고정",
				benefits: ["스페셜 채용 섹션 노출", "상단 고정"],
				priceOptions: [
					{ amount: 330_000, days: 30 },
					{ amount: 600_000, days: 60 },
					{ amount: 850_000, days: 90 },
				],
			},
		],
	},
	{
		name: "추천 채용",
		description: "추천 채용 섹션에 노출됩니다.",
		kind: "listing",
		products: [
			{
				name: "추천 광고",
				tagline: "추천 섹션 노출",
				benefits: ["추천 채용 섹션 노출"],
				priceOptions: [
					{ amount: 220_000, days: 30 },
					{ amount: 400_000, days: 60 },
					{ amount: 560_000, days: 90 },
				],
			},
		],
	},
	{
		name: "상단 프리미엄 배너",
		description: "채용 마켓 상단 프리미엄 배너 4칸 중 1칸.",
		kind: "banner",
		products: [
			{
				name: "프리미엄 배너",
				tagline: "상단 배너 노출",
				benefits: ["상단 프리미엄 배너"],
				priceOptions: [{ amount: 500_000, days: 30 }],
			},
		],
	},
];

async function main() {
	for (const [i, entry] of SEED.entries()) {
		const existing = await db
			.select({ id: adPlacement.id })
			.from(adPlacement)
			.where(eq(adPlacement.name, entry.name))
			.limit(1);
		if (existing.length > 0) {
			continue;
		}
		const [placement] = await db
			.insert(adPlacement)
			.values({
				name: entry.name,
				description: entry.description,
				kind: entry.kind,
				sortOrder: i,
			})
			.returning();
		if (!placement) {
			continue;
		}
		await db.insert(adProduct).values(
			entry.products.map((p, idx) => ({
				...p,
				placementId: placement.id,
				sortOrder: idx,
			}))
		);
	}
	// biome-ignore lint/suspicious/noConsole: 시드 스크립트 로그
	console.log("ad catalog seeded");
}

main().then(() => process.exit(0));
