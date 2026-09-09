import type { AppRouterClient } from "@bambi-app/api/routers/index";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button, Input, Switch, TextField, useToast } from "heroui-native";
import { useState } from "react";
import { Text, View } from "react-native";
import { orpc } from "@/src/lib/orpc";

const LIMITS = [
	["adBannerLimit", "프리미엄 배너"],
	["specialLimit", "스페셜 채용"],
	["urgentLimit", "급구 채용"],
	["recommendedLimit", "추천 채용"],
	["communityLimit", "회차당 커뮤니티 글"],
] as const;
type Limits = Awaited<
	ReturnType<AppRouterClient["bambi"]["siteSettings"]["getCrawledLimits"]>
>;
type Exposure = Awaited<
	ReturnType<AppRouterClient["bambi"]["siteSettings"]["getCrawledExposure"]>
>;
export function CrawledExposureSettings() {
	const limits = useQuery(
		orpc.bambi.siteSettings.getCrawledLimits.queryOptions()
	);
	const exposure = useQuery(
		orpc.bambi.siteSettings.getCrawledExposure.queryOptions()
	);
	return limits.data && exposure.data ? (
		<Editor initialExposure={exposure.data} initialLimits={limits.data} />
	) : null;
}
function Editor({
	initialLimits,
	initialExposure,
}: {
	initialLimits: Limits;
	initialExposure: Exposure;
}) {
	const [limits, setLimits] = useState(() =>
		Object.fromEntries(
			LIMITS.map(([key]) => [
				key,
				initialLimits[key] == null ? "" : String(initialLimits[key]),
			])
		)
	);
	const [exposure, setExposure] = useState({
		adBannerEnabled: initialExposure.crawledAdBannerEnabled,
		communityFeedEnabled: initialExposure.crawledCommunityFeedEnabled,
		jobFeedEnabled: initialExposure.crawledJobFeedEnabled,
	});
	const saveLimits = useMutation(
		orpc.bambi.siteSettings.updateCrawledLimits.mutationOptions()
	);
	const saveExposure = useMutation(
		orpc.bambi.siteSettings.updateCrawledExposure.mutationOptions()
	);
	const client = useQueryClient();
	const { toast } = useToast();
	const optional = (key: string) =>
		limits[key]?.trim() ? Number(limits[key]) : null;
	const act = async (action: () => Promise<unknown>) => {
		try {
			await action();
			await client.invalidateQueries({
				queryKey: orpc.bambi.siteSettings.key(),
			});
			toast.show({ label: "수집 노출 설정을 저장했어요." });
		} catch (error) {
			toast.show({
				label: error instanceof Error ? error.message : "저장하지 못했어요.",
				variant: "danger",
			});
		}
	};
	return (
		<View className="gap-3">
			<Text className="font-bold text-foreground">수집 상한·노출</Text>
			{LIMITS.map(([key, label]) => (
				<TextField key={key}>
					<Text className="text-foreground text-sm">
						{label} (비우면 서버 기본값)
					</Text>
					<Input
						accessibilityLabel={label}
						keyboardType="number-pad"
						onChangeText={(value) =>
							setLimits((current) => ({ ...current, [key]: value }))
						}
						value={limits[key] ?? ""}
					/>
				</TextField>
			))}
			<Button
				isDisabled={saveLimits.isPending}
				onPress={() =>
					act(() =>
						saveLimits.mutateAsync({
							adBannerLimit: optional("adBannerLimit"),
							specialLimit: optional("specialLimit"),
							urgentLimit: optional("urgentLimit"),
							recommendedLimit: optional("recommendedLimit"),
							communityLimit: optional("communityLimit"),
						})
					)
				}
			>
				<Button.Label>수집 상한 저장</Button.Label>
			</Button>
			{(
				[
					["adBannerEnabled", "수집 광고 배너 노출"],
					["jobFeedEnabled", "수집 공고 노출"],
					["communityFeedEnabled", "수집 커뮤니티 노출"],
				] as const
			).map(([key, label]) => (
				<View className="flex-row items-center justify-between" key={key}>
					<Text className="text-foreground">{label}</Text>
					<Switch
						isSelected={exposure[key]}
						onSelectedChange={(value) =>
							setExposure((current) => ({ ...current, [key]: value }))
						}
					/>
				</View>
			))}
			<Button
				isDisabled={saveExposure.isPending}
				onPress={() => act(() => saveExposure.mutateAsync(exposure))}
			>
				<Button.Label>노출 설정 저장</Button.Label>
			</Button>
		</View>
	);
}
