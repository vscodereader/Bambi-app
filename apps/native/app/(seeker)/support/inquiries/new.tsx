import {
	SUPPORT_CATEGORIES,
	SUPPORT_CATEGORY_LABELS,
	type SupportCategory,
} from "@bambi-app/api/services/bambi-support-labels";
import { env } from "@bambi-app/env/native";
import { useMutation } from "@tanstack/react-query";
import { type Href, router, Stack } from "expo-router";
import { Button, Description, Input, Label, TextField } from "heroui-native";
import { useState } from "react";
import { Alert, Text, View } from "react-native";

import { BambiScreen } from "@/src/components/bambi-screen";
import { FieldSelect } from "@/src/components/field-select";
import { MemberOnly } from "@/src/components/member-only";
import { SupportDocumentEditor } from "@/src/components/support/support-document-editor";
import { orpc, queryClient } from "@/src/lib/orpc";
import {
	INQUIRY_TITLE_MAX,
	inquirySubmitBlocker,
	supportInquiryHref,
} from "@/src/lib/support/support";
import { pickAndUploadSupportImage } from "@/src/lib/support/support-image-upload";

// enum 원값은 화면에 내지 않는다 — 라벨 맵을 거쳐 옵션을 만든다.
const CATEGORY_OPTIONS = SUPPORT_CATEGORIES.map((value) => ({
	label: SUPPORT_CATEGORY_LABELS[value],
	value,
}));

function NewInquiry() {
	const [category, setCategory] = useState<SupportCategory>("account");
	const [title, setTitle] = useState("");
	const [body, setBody] = useState("");
	const [bodyText, setBodyText] = useState("");
	// 이미지만 있고 글이 없는 문의도 등록할 수 있어야 해서 본문 길이와 따로 들고 있다.
	// 에디터가 문서에서 직접 계산해 준다(JSON 문자열을 훑는 스니핑은 링크 텍스트 등에
	// 오탐이 난다).
	const [hasImage, setHasImage] = useState(false);
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
	const blocker = inquirySubmitBlocker({ bodyText, hasImage, title });
	const isBusy = create.isPending || upload.isPending;
	return (
		<BambiScreen
			stickyFooter={
				<View className="gap-2">
					{/* 사유는 버튼과 같은 고정 바에 둔다 — 본문에 두면 스크롤 위쪽에 숨어,
					    고정 바에서 버튼이 왜 꺼져 있는지 물은 사용자에게 안 보인다. */}
					{blocker ? (
						<Text className="text-muted text-sm" selectable>
							{blocker}
						</Text>
					) : null}
					<Button
						isDisabled={blocker !== null || create.isPending}
						onPress={() =>
							create.mutate({ body, category, title: title.trim() })
						}
					>
						<Button.Label>
							{create.isPending ? "등록 중" : "문의 등록"}
						</Button.Label>
					</Button>
				</View>
			}
		>
			<Stack.Screen options={{ title: "문의 글 등록하기" }} />
			<FieldSelect
				isRequired
				label="문의 유형"
				// 옵션을 SUPPORT_CATEGORIES에서 만들었으니 올라오는 값은 그 중 하나다.
				onChange={(value) => setCategory(value as SupportCategory)}
				options={CATEGORY_OPTIONS}
				placeholder="문의 유형을 골라 주세요"
				snapPoints={["45%"]}
				value={category}
			/>
			<TextField isRequired>
				<Label>제목</Label>
				<Input
					maxLength={INQUIRY_TITLE_MAX}
					onChangeText={setTitle}
					placeholder="예: 로그인이 안 돼요"
					value={title}
				/>
				<View className="flex-row items-start justify-between gap-2">
					<Description className="flex-1">
						2~{INQUIRY_TITLE_MAX}자로 입력해 주세요
					</Description>
					<Text className="text-muted text-xs">
						{title.trim().length}/{INQUIRY_TITLE_MAX}
					</Text>
				</View>
			</TextField>
			<View className="gap-2">
				<Label isRequired>내용</Label>
				<SupportDocumentEditor
					isDisabled={isBusy}
					onChange={(value) => {
						setBody(value.json);
						setBodyText(value.text);
						setHasImage(value.hasImage);
					}}
					onPickImage={pickImage}
					value={body}
				/>
			</View>
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
