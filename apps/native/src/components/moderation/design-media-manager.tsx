import type { AppRouterClient } from "@bambi-app/api/routers/index";
import { env } from "@bambi-app/env/native";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button, useToast } from "heroui-native";
import { useState } from "react";
import { Image, Text, View } from "react-native";
import {
	AdminImagePicker,
	uploadAdminImage,
} from "@/src/components/moderation/admin-image-picker";
import { publicObjectUri } from "@/src/lib/bambi-native";
import { orpc } from "@/src/lib/orpc";

type Data = Awaited<
	ReturnType<AppRouterClient["bambi"]["moderation"]["getJobPostForAdmin"]>
>;
type Media = Parameters<
	AppRouterClient["bambi"]["moderation"]["setJobPostDesignMedia"]
>[0]["detail"][number];
export function DesignMediaManager({ jobPostId }: { jobPostId: string }) {
	const [open, setOpen] = useState(false);
	const query = useQuery(
		orpc.bambi.moderation.getJobPostForAdmin.queryOptions({
			input: { jobPostId },
			enabled: open,
		})
	);
	return (
		<View className="gap-2">
			<Button onPress={() => setOpen(!open)} size="sm" variant="secondary">
				<Button.Label>디자인 제작 관리</Button.Label>
			</Button>
			{open && query.data ? <Editor data={query.data} key={jobPostId} /> : null}
			{open && query.isError ? (
				<Text className="text-danger">
					공고 정보를 불러오지 못해 저장할 수 없어요.
				</Text>
			) : null}
		</View>
	);
}
function Editor({ data }: { data: Data }) {
	const [detail, setDetail] = useState<Media[]>(() =>
		data.media.detail.map((item) => ({
			altText: item.altText ?? "",
			byteSize: item.byteSize,
			fileName: item.fileName,
			height: item.height ?? undefined,
			mimeType: item.mimeType,
			storageKey: item.storageKey,
			width: item.width ?? undefined,
		}))
	);
	const [busy, setBusy] = useState(false);
	const upload = useMutation(
		orpc.bambi.moderation.createJobPostDesignMediaUpload.mutationOptions()
	);
	const save = useMutation(
		orpc.bambi.moderation.setJobPostDesignMedia.mutationOptions()
	);
	const status = useMutation(
		orpc.bambi.moderation.setJobPostDesignStatus.mutationOptions()
	);
	const client = useQueryClient();
	const { toast } = useToast();
	const act = async (action: () => Promise<unknown>) => {
		try {
			await action();
			await client.invalidateQueries({ queryKey: orpc.bambi.moderation.key() });
			toast.show({ label: "디자인 제작 정보를 저장했어요." });
		} catch (error) {
			toast.show({
				label: error instanceof Error ? error.message : "저장하지 못했어요.",
				variant: "danger",
			});
		}
	};
	return (
		<View className="gap-3">
			<Text className="text-muted text-sm">
				완성한 상세이미지는 최대 5장입니다. 이미지 저장 후 제작 완료를 별도로
				처리해 주세요.
			</Text>
			{detail.map((item) => (
				<View className="gap-2" key={item.storageKey}>
					<Image
						accessibilityLabel={item.fileName}
						className="h-40 w-full"
						resizeMode="contain"
						source={{
							uri:
								publicObjectUri(
									item.storageKey,
									env.EXPO_PUBLIC_GCS_PUBLIC_BASE_URL
								) ?? undefined,
						}}
					/>
					<Button
						isDisabled={busy || save.isPending}
						onPress={() =>
							setDetail((current) =>
								current.filter((value) => value.storageKey !== item.storageKey)
							)
						}
						size="sm"
						variant="danger-soft"
					>
						<Button.Label>이미지 제거</Button.Label>
					</Button>
				</View>
			))}
			{detail.length < 5 ? (
				<AdminImagePicker
					maxBytes={10 * 1024 * 1024}
					onBusyChange={setBusy}
					onChange={() => undefined}
					upload={async (pick) => {
						const intent = await upload.mutateAsync({
							jobPostId: data.id,
							byteSize: pick.bytes.length,
							fileName: pick.fileName,
							mimeType: pick.mimeType,
						});
						await uploadAdminImage(pick, intent);
						setDetail((current) => [
							...current,
							{
								storageKey: intent.storageKey,
								mimeType: intent.mimeType,
								fileName: intent.fileName,
								byteSize: intent.byteSize,
								width: pick.width,
								height: pick.height,
								altText: "",
							},
						]);
						return pick.uri;
					}}
				/>
			) : null}
			<Button
				isDisabled={busy || save.isPending}
				onPress={() =>
					act(() => save.mutateAsync({ jobPostId: data.id, detail }))
				}
			>
				<Button.Label>상세 이미지 저장</Button.Label>
			</Button>
			<Button
				isDisabled={busy || status.isPending || !data.detailDesignStatus}
				onPress={() =>
					act(() =>
						status.mutateAsync({
							jobPostId: data.id,
							status:
								data.detailDesignStatus === "completed"
									? "requested"
									: "completed",
						})
					)
				}
				variant="secondary"
			>
				<Button.Label>
					{data.detailDesignStatus === "completed"
						? "제작 대기로 되돌리기"
						: "제작 완료 처리"}
				</Button.Label>
			</Button>
		</View>
	);
}
