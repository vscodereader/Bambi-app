import { useMutation } from "@tanstack/react-query";
import { Button } from "heroui-native";
import { type ReactElement, useState } from "react";
import { Alert, Image, Pressable, Text, View } from "react-native";

import {
	AD_BANNER_USAGE_HINTS,
	AD_BANNER_USAGE_LABELS,
	type JobAdBannerUsage,
} from "@/src/lib/employer/ad-exposure";
import { pickAndUploadJobImage } from "@/src/lib/employer/job-image-upload";
import type { JobMediaUploadItem } from "@/src/lib/employer/job-media";
import { orpc } from "@/src/lib/orpc";

interface BannerMedia {
	adHorizontal?: JobMediaUploadItem;
	adVertical?: JobMediaUploadItem;
}

interface Props {
	media: BannerMedia;
	onChange: (next: BannerMedia) => void;
	organizationId: string;
	requiredUsages: readonly JobAdBannerUsage[];
	teamId: null | string;
}

// 미리보기 uri는 payload에 담지 않는다 — 화면 표시용으로만 storageKey에 매핑해 둔다.
type PreviewMap = Record<string, string>;

// usage 두 값과 media 두 키를 매핑한다 — 슬롯이 둘뿐이라 표로 두지 않고 여기서 바로 고른다.
const mediaKeyFor = (usage: JobAdBannerUsage): "adHorizontal" | "adVertical" =>
	usage === "ad_horizontal" ? "adHorizontal" : "adVertical";

export function JobBannerPickerSection({
	media,
	onChange,
	organizationId,
	requiredUsages,
	teamId,
}: Props): ReactElement | null {
	const [isBusy, setIsBusy] = useState(false);
	const [previews, setPreviews] = useState<PreviewMap>({});
	const uploadMutation = useMutation(
		orpc.bambi.jobs.createMediaUpload.mutationOptions()
	);

	// 무료·리스팅 상품은 배너 슬롯이 없다. 훅 호출 뒤에 분기해야 렌더 간 훅 순서가 안 어긋난다.
	if (requiredUsages.length === 0) {
		return null;
	}

	const handlePick = async (usage: JobAdBannerUsage) => {
		setIsBusy(true);
		const result = await pickAndUploadJobImage({
			createUpload: uploadMutation.mutateAsync,
			organizationId,
			teamId,
			usage,
		});
		setIsBusy(false);

		if ("cancelled" in result) {
			return;
		}

		if ("error" in result) {
			// 규격(비율·최소 크기) 판정은 서버 몫이라 그 사유를 그대로 띄운다.
			Alert.alert("등록할 수 없는 이미지예요", result.error);
			return;
		}

		setPreviews((prev) => ({
			...prev,
			[result.item.storageKey]: result.previewUri,
		}));
		onChange({ ...media, [mediaKeyFor(usage)]: result.item });
	};

	const handleRemove = (usage: JobAdBannerUsage) => {
		const next = { ...media };
		delete next[mediaKeyFor(usage)];
		onChange(next);
	};

	return (
		<View className="gap-3">
			<View className="gap-1">
				<Text className="font-semibold text-foreground text-sm" selectable>
					광고 배너 이미지
				</Text>
				<Text className="text-muted text-xs" selectable>
					선택한 광고 상품에 필요한 배너 이미지를 등록해 주세요. 규격은 등록 시
					서버가 확인해요.
				</Text>
			</View>

			{requiredUsages.map((usage) => {
				const item = media[mediaKeyFor(usage)];
				const previewUri = item ? (previews[item.storageKey] ?? "") : "";
				const isVertical = usage === "ad_vertical";
				const label = AD_BANNER_USAGE_LABELS[usage];

				return (
					<View className="gap-2" key={usage}>
						<View className="flex-row items-center gap-2">
							<Text className="font-medium text-foreground text-sm" selectable>
								{label}
							</Text>
							{item ? null : (
								<Text className="text-danger-soft-foreground text-xs dark:text-danger">
									필수
								</Text>
							)}
						</View>
						<Text className="text-muted text-xs" selectable>
							{AD_BANNER_USAGE_HINTS[usage]}
						</Text>

						{item ? (
							<View className="gap-2">
								{previewUri ? (
									<Image
										accessibilityLabel={`${label} 미리보기`}
										className={
											isVertical
												? "h-64 w-40 rounded-lg"
												: "h-32 w-full rounded-lg"
										}
										source={{ uri: previewUri }}
									/>
								) : (
									<Text className="text-muted text-xs" selectable>
										{`등록된 ${label}`}
									</Text>
								)}
								<Button
									isDisabled={isBusy}
									onPress={() => handlePick(usage)}
									variant="secondary"
								>
									<Button.Label>
										{isBusy ? "처리 중" : "다른 이미지로 변경"}
									</Button.Label>
								</Button>
								<Pressable
									className="min-h-11 justify-center self-start rounded-lg border border-border bg-background px-3 active:opacity-75"
									onPress={() => handleRemove(usage)}
								>
									<Text className="text-danger-soft-foreground text-sm dark:text-danger">
										제거
									</Text>
								</Pressable>
							</View>
						) : (
							<Button
								isDisabled={isBusy}
								onPress={() => handlePick(usage)}
								variant="secondary"
							>
								<Button.Label>
									{isBusy ? "처리 중" : "이미지 등록"}
								</Button.Label>
							</Button>
						)}
					</View>
				);
			})}
		</View>
	);
}
