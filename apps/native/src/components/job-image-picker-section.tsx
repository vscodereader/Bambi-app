import { useMutation } from "@tanstack/react-query";
import { Button } from "heroui-native";
import { useState } from "react";
import { Alert, Image, Pressable, Text, View } from "react-native";

import {
	pickAndUploadDetailImages,
	pickAndUploadJobImage,
} from "@/src/lib/employer/job-image-upload";
import {
	JOB_DETAIL_LIMIT,
	type JobMediaUploadItem,
} from "@/src/lib/employer/job-media";
import { orpc } from "@/src/lib/orpc";

interface Props {
	cover: JobMediaUploadItem | null;
	detail: JobMediaUploadItem[];
	// 수정 프리필용 storageKey→원격 미리보기 URL. 없으면 파일명으로 폴백한다.
	initialPreviews?: Record<string, string>;
	// 픽커가 열려 있거나 업로드 중인 동안 true. 폼이 "다음"을 잠그는 데 쓴다 — Android 포토
	// 픽커의 Done 버튼이 고정 바의 "다음"과 같은 자리라, 픽커가 닫히는 순간 겹쳐 들어온 탭이
	// 노출 화면으로 넘어가 버린다.
	onBusyChange?: (busy: boolean) => void;
	onChange: (next: {
		cover: JobMediaUploadItem | null;
		detail: JobMediaUploadItem[];
	}) => void;
	// 대표 이미지의 화면용 uri(로컬 픽 또는 원격 프리필). 폼의 목록 노출 미리보기가 아직
	// 공개 URL이 없는 방금 고른 이미지를 그리려면 이 값이 필요하다 — payload에는 담기지
	// 않는 표시용 값이라 onChange와 분리해 둔다.
	onCoverPreviewChange?: (uri: null | string) => void;
	organizationId: string;
	teamId: null | string;
}

// 미리보기 uri는 payload에 담지 않는다 — 화면 표시용으로만 storageKey에 매핑해 둔다.
type PreviewMap = Record<string, string>;

// web이 만든 조각 그룹은 sliceIndex 0..n으로 여러 행이 들어온다. 개수·한도(5장)는 원본
// 단위로 세야 하므로 그룹 첫 조각(또는 조각 아님)만 원본 1장으로 취급한다. native 새 픽·
// 단일 이미지는 sliceIndex가 없다.
const isOriginalDetail = (item: JobMediaUploadItem): boolean =>
	item.sliceIndex === undefined || item.sliceIndex === 0;

const sliceCount = (
	detail: JobMediaUploadItem[],
	item: JobMediaUploadItem
): number =>
	item.sliceGroupId
		? detail.filter((x) => x.sliceGroupId === item.sliceGroupId).length
		: 1;

export function JobImagePickerSection({
	cover,
	detail,
	initialPreviews,
	onBusyChange,
	onChange,
	onCoverPreviewChange,
	organizationId,
	teamId,
}: Props) {
	const [isBusy, setIsBusy] = useState(false);
	const [previews, setPreviews] = useState<PreviewMap>(initialPreviews ?? {});
	const setBusy = (busy: boolean) => {
		setIsBusy(busy);
		onBusyChange?.(busy);
	};
	const uploadMutation = useMutation(
		orpc.bambi.jobs.createMediaUpload.mutationOptions()
	);
	// 조각 그룹은 원본 1장으로 접어서 세고 렌더한다(개수·한도·목록 모두).
	const originalDetail = detail.filter(isOriginalDetail);

	const handleCoverPick = async () => {
		setBusy(true);
		const result = await pickAndUploadJobImage({
			createUpload: uploadMutation.mutateAsync,
			organizationId,
			teamId,
			usage: "cover",
		});
		setBusy(false);

		if ("cancelled" in result) {
			return;
		}

		if ("error" in result) {
			Alert.alert("등록할 수 없는 이미지예요", result.error);
			return;
		}

		setPreviews((prev) => ({
			...prev,
			[result.item.storageKey]: result.previewUri,
		}));
		onCoverPreviewChange?.(result.previewUri);
		onChange({ cover: result.item, detail });
	};

	const handleDetailPick = async () => {
		if (originalDetail.length >= JOB_DETAIL_LIMIT) {
			Alert.alert(
				"상세 이미지는 최대 5장",
				"이미 5장을 등록했어요. 기존 이미지를 제거한 뒤 추가해 주세요."
			);
			return;
		}

		setBusy(true);
		const result = await pickAndUploadDetailImages({
			createUpload: uploadMutation.mutateAsync,
			organizationId,
			teamId,
		});
		setBusy(false);

		if ("cancelled" in result) {
			return;
		}

		if ("error" in result) {
			Alert.alert("등록할 수 없는 이미지예요", result.error);
			return;
		}

		// 조각 그룹은 items가 여러 장이어도 원본 1장(sliceIndex 0)만 한도에 세므로 통째로 더한다.
		setPreviews((prev) => ({ ...prev, ...result.previews }));
		onChange({ cover, detail: [...detail, ...result.items] });
	};

	const previewFor = (item: JobMediaUploadItem): string =>
		previews[item.storageKey] ?? "";

	return (
		<View className="gap-3">
			<View className="gap-1">
				<Text className="font-semibold text-foreground text-sm" selectable>
					공고 이미지 (선택)
				</Text>
				<Text className="text-muted text-xs" selectable>
					대표 이미지 1장과 상세 이미지 최대 5장을 등록할 수 있어요.
					JPG·PNG·WebP, 한 장당 10MB 이하.
				</Text>
			</View>

			<View className="gap-2">
				<Text className="text-muted text-xs">대표 이미지</Text>
				{cover ? (
					<View className="gap-2">
						{previewFor(cover) ? (
							<Image
								accessibilityLabel="대표 이미지 미리보기"
								className="h-40 w-full rounded-lg"
								source={{ uri: previewFor(cover) }}
							/>
						) : (
							<Text className="text-muted text-xs" selectable>
								{`등록된 대표 이미지 (${cover.fileName})`}
							</Text>
						)}
						<Pressable
							className="self-start rounded-lg border border-border bg-background px-3 py-2 active:opacity-75"
							onPress={() => {
								onCoverPreviewChange?.(null);
								onChange({ cover: null, detail });
							}}
						>
							<Text className="text-danger-soft-foreground text-sm dark:text-danger">
								대표 이미지 제거
							</Text>
						</Pressable>
					</View>
				) : (
					<Button
						isDisabled={isBusy}
						onPress={handleCoverPick}
						variant="secondary"
					>
						<Button.Label>
							{isBusy ? "처리 중" : "대표 이미지 선택"}
						</Button.Label>
					</Button>
				)}
			</View>

			<View className="gap-2">
				<Text className="text-muted text-xs">{`상세 이미지 (${originalDetail.length}/${JOB_DETAIL_LIMIT})`}</Text>
				{originalDetail.map((item, index) => {
					const pieces = sliceCount(detail, item);
					const label =
						pieces > 1
							? `상세 이미지 ${index + 1} (조각 ${pieces}장)`
							: `상세 이미지 ${index + 1}`;
					// 조각 그룹은 통째로 제거한다 — 일부만 지우면 잘린 그룹이 남는다.
					const removed = item.sliceGroupId
						? detail.filter((x) => x.sliceGroupId !== item.sliceGroupId)
						: detail.filter((x) => x.storageKey !== item.storageKey);

					return (
						<View className="gap-2" key={item.storageKey}>
							{previewFor(item) ? (
								<Image
									accessibilityLabel={`${label} 미리보기`}
									className="h-40 w-full rounded-lg"
									source={{ uri: previewFor(item) }}
								/>
							) : (
								<Text className="text-muted text-xs" selectable>
									{pieces > 1
										? `등록된 ${label}`
										: `등록된 ${label} (${item.fileName})`}
								</Text>
							)}
							<Pressable
								className="self-start rounded-lg border border-border bg-background px-3 py-2 active:opacity-75"
								onPress={() => onChange({ cover, detail: removed })}
							>
								<Text className="text-danger-soft-foreground text-sm dark:text-danger">
									{`${label} 제거`}
								</Text>
							</Pressable>
						</View>
					);
				})}
				{originalDetail.length < JOB_DETAIL_LIMIT ? (
					<Button
						isDisabled={isBusy}
						onPress={handleDetailPick}
						variant="secondary"
					>
						<Button.Label>
							{isBusy ? "처리 중" : "상세 이미지 추가"}
						</Button.Label>
					</Button>
				) : null}
			</View>
		</View>
	);
}
