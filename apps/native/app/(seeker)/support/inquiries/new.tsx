import {
	SUPPORT_CATEGORIES,
	SUPPORT_CATEGORY_LABELS,
	type SupportCategory,
} from "@bambi-app/api/services/bambi-support-labels";
import { env } from "@bambi-app/env/native";
import { useMutation } from "@tanstack/react-query";
import { type Href, router, Stack } from "expo-router";
import { Button, Chip, Input, Label, Surface, TextField } from "heroui-native";
import { useState } from "react";
import { Alert, Text, View } from "react-native";

import { BambiScreen } from "@/src/components/bambi-screen";
import { MemberOnly } from "@/src/components/member-only";
import { SupportDocumentEditor } from "@/src/components/support/support-document-editor";
import { orpc, queryClient } from "@/src/lib/orpc";
import {
	canSubmitInquiry,
	supportInquiryHref,
} from "@/src/lib/support/support";
import { pickAndUploadSupportImage } from "@/src/lib/support/support-image-upload";

function NewInquiry() {
	const [category, setCategory] = useState<SupportCategory>("account");
	const [title, setTitle] = useState("");
	const [body, setBody] = useState("");
	const [bodyText, setBodyText] = useState("");
	const upload = useMutation(
		orpc.bambi.community.createMediaUpload.mutationOptions()
	);
	const create = useMutation(
		orpc.bambi.support.createInquiry.mutationOptions({
			onError: (error) =>
				Alert.alert("문의를 등록하지 못했어요", error.message),
			onSuccess: async (result) => {
				await queryClient.invalidateQueries({
					queryKey: orpc.bambi.support.key(),
				});
				router.replace(supportInquiryHref(result.id) as unknown as Href);
			},
		})
	);
	const pickImage = async () => {
		const result = await pickAndUploadSupportImage({
			createUpload: (input) => upload.mutateAsync(input),
			gcsPublicBaseUrl: env.EXPO_PUBLIC_GCS_PUBLIC_BASE_URL,
		});
		if ("error" in result) {
			Alert.alert("이미지를 올리지 못했어요", result.error);
			return null;
		}
		return "publicUri" in result ? result.publicUri : null;
	};
	const canSubmit = canSubmitInquiry({
		bodyText,
		hasImage: body.includes('"type":"image"'),
		title,
	});
	return (
		<BambiScreen>
			<Stack.Screen options={{ title: "문의 글 등록하기" }} />
			<Text className="font-bold text-3xl text-foreground">
				문의 글 등록하기
			</Text>
			<Surface className="gap-4 rounded-lg p-4" variant="secondary">
				<View className="flex-row flex-wrap gap-2">
					{SUPPORT_CATEGORIES.map((value) => (
						<Chip
							color={category === value ? "accent" : "default"}
							key={value}
							onPress={() => setCategory(value)}
							variant={category === value ? "primary" : "soft"}
						>
							<Chip.Label>{SUPPORT_CATEGORY_LABELS[value]}</Chip.Label>
						</Chip>
					))}
				</View>
				<TextField>
					<Label>제목</Label>
					<Input
						maxLength={100}
						onChangeText={setTitle}
						placeholder="문의 제목을 입력해 주세요 (2자 이상)"
						value={title}
					/>
				</TextField>
				<View className="gap-2">
					<Label>내용</Label>
					<SupportDocumentEditor
						isDisabled={create.isPending || upload.isPending}
						onChange={(value) => {
							setBody(value.json);
							setBodyText(value.text);
						}}
						onPickImage={pickImage}
						value={body}
					/>
				</View>
			</Surface>
			<Button
				isDisabled={!canSubmit || create.isPending}
				onPress={() => create.mutate({ body, category, title: title.trim() })}
			>
				<Button.Label>
					{create.isPending ? "등록 중" : "문의 등록"}
				</Button.Label>
			</Button>
		</BambiScreen>
	);
}

export default function NewInquiryScreen() {
	return (
		<MemberOnly>
			<NewInquiry />
		</MemberOnly>
	);
}
