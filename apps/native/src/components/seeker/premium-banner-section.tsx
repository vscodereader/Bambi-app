import type { AppRouterClient } from "@bambi-app/api/routers/index";
import { env } from "@bambi-app/env/native";
import { useQuery } from "@tanstack/react-query";
import { type Href, router } from "expo-router";
import { Skeleton, Surface } from "heroui-native";
import { Image, Pressable, Text, View } from "react-native";

import { AdBannerSlotCanvas } from "@/src/components/ad-banner-slot-canvas";
import { publicObjectUri } from "@/src/lib/bambi-native";
import { orpc } from "@/src/lib/orpc";
import {
	premiumBannerHref,
	premiumBannerSlots,
} from "@/src/lib/seeker/premium-banner";
import { usePointJobReward } from "@/src/lib/seeker/use-point-job-reward";

type BannerGroups = Awaited<
	ReturnType<AppRouterClient["bambi"]["jobs"]["listAdBanners"]>
>;
type Banner = NonNullable<BannerGroups["premiumBanner"][number]>;

const bannerUri = (item: Banner): string => {
	const key = item.adHorizontal?.storageKey ?? item.coverImage?.storageKey;
	const horizontalUrl =
		"adHorizontalUrl" in item && typeof item.adHorizontalUrl === "string"
			? item.adHorizontalUrl
			: null;
	const coverUrl =
		"coverImageUrl" in item && typeof item.coverImageUrl === "string"
			? item.coverImageUrl
			: null;
	return (
		horizontalUrl ??
		coverUrl ??
		(key ? publicObjectUri(key, env.EXPO_PUBLIC_GCS_PUBLIC_BASE_URL) : null) ??
		""
	);
};

function FilledBannerSlot({ item, index }: { index: number; item: Banner }) {
	const uri = bannerUri(item);
	const reward = usePointJobReward({
		category: "premium",
		targetId: item.id,
		targetSource: item.source === "crawled" ? "crawled_job_post" : "job_post",
	});
	const href = premiumBannerHref(item);
	let banner = (
		<Surface
			className="aspect-video items-center justify-center rounded-lg"
			variant="secondary"
		>
			<Text className="font-semibold text-foreground">{item.title}</Text>
		</Surface>
	);
	if (uri) {
		banner = (
			<Image
				className="aspect-video w-full"
				resizeMode="cover"
				source={{ uri }}
			/>
		);
	}
	if (item.layout) {
		banner = (
			<AdBannerSlotCanvas
				imageUri={uri}
				layout={item.layout.horizontal}
				selectedId={null}
				usage="ad_horizontal"
			/>
		);
	}
	return (
		<Pressable
			accessibilityLabel={`프리미엄 광고 ${index + 1}, ${item.title}`}
			accessibilityRole="button"
			className="overflow-hidden rounded-lg active:opacity-75"
			onPress={() => {
				if (reward.points > 0) {
					reward.claim();
				}
				router.push(href as unknown as Href);
			}}
		>
			{reward.points > 0 ? (
				<View className="absolute top-2 left-2 z-10 rounded-full bg-accent px-2 py-1">
					<Text className="font-bold text-accent-foreground text-xs">
						POINT
					</Text>
				</View>
			) : null}
			{banner}
		</Pressable>
	);
}

function BannerSlot({ item, index }: { index: number; item: Banner | null }) {
	return item ? (
		<FilledBannerSlot index={index} item={item} />
	) : (
		<Surface
			className="aspect-video items-center justify-center rounded-lg"
			variant="secondary"
		>
			<Text className="text-muted text-sm">프리미엄 광고 문의</Text>
		</Surface>
	);
}

export function PremiumBannerSection() {
	const query = useQuery(orpc.bambi.jobs.listAdBanners.queryOptions());
	if (query.isPending) {
		return (
			<View className="gap-3 px-4">
				<Text className="font-bold text-foreground text-lg">프리미엄 광고</Text>
				{["a", "b", "c"].map((key) => (
					<Skeleton className="aspect-video w-full rounded-lg" key={key} />
				))}
			</View>
		);
	}
	if (query.isError) {
		return null;
	}
	return (
		<View className="gap-3 px-4">
			<Text className="font-bold text-foreground text-lg">프리미엄 광고</Text>
			{premiumBannerSlots(query.data.premiumBanner).map((item, index) => (
				<BannerSlot
					index={index}
					item={item}
					key={item?.id ?? `empty-${index}`}
				/>
			))}
		</View>
	);
}
