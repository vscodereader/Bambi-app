import type { AppRouterClient } from "@bambi-app/api/routers/index";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Button, Input, TextField, useToast } from "heroui-native";
import { useState } from "react";
import { Text, View } from "react-native";
import {
	AdminImagePicker,
	uploadAdminImage,
} from "@/src/components/moderation/admin-image-picker";
import { orpc } from "@/src/lib/orpc";

export function GradeEdit({
	grade,
}: {
	grade: Awaited<
		ReturnType<AppRouterClient["bambi"]["memberGrades"]["list"]>
	>[number];
}) {
	const [open, setOpen] = useState(false);
	const [name, setName] = useState(grade.name);
	const [points, setPoints] = useState(String(grade.minPoints));
	const [color, setColor] = useState(grade.color ?? "");
	const [icon, setIcon] = useState(grade.iconStorageKey);
	const [preview, setPreview] = useState(grade.iconUrl);
	const [uploading, setUploading] = useState(false);
	const update = useMutation(orpc.bambi.memberGrades.update.mutationOptions());
	const upload = useMutation(
		orpc.bambi.memberGrades.createIconUpload.mutationOptions()
	);
	const client = useQueryClient();
	const { toast } = useToast();
	return (
		<View className="gap-2">
			<Button onPress={() => setOpen(!open)} size="sm" variant="secondary">
				<Button.Label>등급 수정</Button.Label>
			</Button>
			{open ? (
				<View className="gap-2">
					<TextField>
						<Input
							accessibilityLabel="등급 이름"
							maxLength={20}
							onChangeText={setName}
							value={name}
						/>
					</TextField>
					<TextField>
						<Input
							accessibilityLabel="등급 기준 포인트"
							keyboardType="number-pad"
							onChangeText={setPoints}
							value={points}
						/>
					</TextField>
					<TextField>
						<Input
							accessibilityLabel="등급 색상"
							autoCapitalize="none"
							onChangeText={setColor}
							placeholder="색상 #RRGGBB (비우면 기본색)"
							value={color}
						/>
					</TextField>
					<Text className="text-muted text-xs">등급 아이콘: GIF 2MB 이하</Text>
					<AdminImagePicker
						maxBytes={2 * 1024 * 1024}
						mimeTypes={["image/gif"]}
						onBusyChange={setUploading}
						onChange={(value) => {
							setPreview(value);
							if (!value) {
								setIcon(null);
							}
						}}
						upload={async (pick) => {
							const intent = await upload.mutateAsync({
								byteSize: pick.bytes.length,
								fileName: pick.fileName,
								mimeType: "image/gif",
								gradeId: grade.id,
							});
							await uploadAdminImage(pick, intent);
							setIcon(intent.storageKey);
							return pick.uri;
						}}
						value={preview}
					/>
					<Button
						isDisabled={update.isPending || uploading || !name.trim()}
						onPress={async () => {
							try {
								await update.mutateAsync({
									id: grade.id,
									name: name.trim(),
									minPoints: Number(points),
									color: color.trim() || null,
									iconStorageKey: icon,
								});
								await Promise.all([
									client.invalidateQueries({
										queryKey: orpc.bambi.memberGrades.key(),
									}),
									client.invalidateQueries({
										queryKey: orpc.bambi.attendance.key(),
									}),
								]);
								setOpen(false);
								toast.show({ label: "등급을 수정했어요." });
							} catch (error) {
								toast.show({
									label:
										error instanceof Error
											? error.message
											: "수정하지 못했어요.",
									variant: "danger",
								});
							}
						}}
					>
						<Button.Label>등급 저장</Button.Label>
					</Button>
				</View>
			) : null}
		</View>
	);
}
