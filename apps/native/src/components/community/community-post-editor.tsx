import { env } from "@bambi-app/env/native";
import { useMutation, useQuery } from "@tanstack/react-query";
import { type Href, router, useLocalSearchParams } from "expo-router";
import { Button, Chip, Input, Label, Surface, TextField } from "heroui-native";
import { useState } from "react";
import { Alert, Text, View } from "react-native";

import { authClient } from "@/lib/auth-client";
import {
	BambiScreen,
	ErrorState,
	LoadingState,
} from "@/src/components/bambi-screen";
import { CommunityDocumentEditor } from "@/src/components/community/community-document-editor";
import {
	canSubmitCommunityPost,
	communityBodyText,
} from "@/src/lib/community/community";
import { pickAndUploadCommunityImage } from "@/src/lib/community/community-image-upload";
import { useVisitor } from "@/src/lib/guest-store";
import { orpc, queryClient } from "@/src/lib/orpc";

// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: 생성과 수정이 서버 입력과 폼 상태를 공유해 한 화면에서 분기한다
export function CommunityPostEditor({ mode }: { mode: "create" | "edit" }) {
	const { board: slug, postId } = useLocalSearchParams<{
		board: string;
		postId?: string;
	}>();
	const session = authClient.useSession();
	const { state } = useVisitor();
	const [password, setPassword] = useState("");
	const [submittedPassword, setSubmittedPassword] = useState("");
	const boards = useQuery(orpc.bambi.communityBoards.listActive.queryOptions());
	const mine = useQuery({
		...orpc.bambi.onboarding.getMine.queryOptions(),
		enabled: state === "member",
	});
	const board = boards.data?.boards.find((item) => item.slug === slug);
	const post = useQuery({
		...orpc.bambi.community.getPost.queryOptions({
			input: {
				password: submittedPassword || undefined,
				postId: postId ?? "00000000-0000-0000-0000-000000000000",
			},
		}),
		enabled: mode === "edit" && Boolean(postId),
	});
	const initial =
		post.data && !post.data.locked
			? {
					authorName: post.data.authorName,
					body: post.data.body,
					bodyText: communityBodyText(post.data.body),
					contactPhone: post.data.contactPhone ?? "",
					isAnonymous: post.data.isAnonymous,
					isLocked: post.data.isLocked,
					isPromotion: post.data.isPromotion,
					title: post.data.title,
				}
			: null;
	const [title, setTitle] = useState<string | null>(null);
	const [body, setBody] = useState<string | null>(null);
	const [bodyText, setBodyText] = useState<string | null>(null);
	const [authorName, setAuthorName] = useState<string | null>(null);
	const [contactPhone, setContactPhone] = useState<string | null>(null);
	const [isLocked, setIsLocked] = useState<boolean | null>(null);
	const [isAnonymous, setIsAnonymous] = useState<boolean | null>(null);
	const [isPromotion, setIsPromotion] = useState<boolean | null>(null);
	const effectiveTitle = title ?? initial?.title ?? "";
	const effectiveBody = body ?? initial?.body ?? "";
	const effectiveBodyText = bodyText ?? initial?.bodyText ?? "";
	const effectiveAuthorName =
		authorName ??
		initial?.authorName ??
		session.data?.user.name?.trim() ??
		"비회원";
	const effectiveLocked =
		board?.key === "legal" ? true : (isLocked ?? initial?.isLocked ?? false);
	const effectiveAnonymous = isAnonymous ?? initial?.isAnonymous ?? false;
	const effectivePromotion = isPromotion ?? initial?.isPromotion ?? false;
	const effectiveContact = contactPhone ?? initial?.contactPhone ?? "";
	const isGuest = state === "guest";
	const canMarkPromotion = mine.data?.bambiProfile?.role === "employer";

	const invalidate = async () => {
		await queryClient.invalidateQueries({
			queryKey: orpc.bambi.community.key(),
		});
	};
	const create = useMutation(
		orpc.bambi.community.createPost.mutationOptions({
			onError: (error) => Alert.alert("등록하지 못했어요", error.message),
			onSuccess: async (result) => {
				await invalidate();
				router.replace(
					`/(seeker)/community/${slug}/${result.id}` as unknown as Href
				);
			},
		})
	);
	const update = useMutation(
		orpc.bambi.community.updatePost.mutationOptions({
			onError: (error) => Alert.alert("수정하지 못했어요", error.message),
			onSuccess: async () => {
				await invalidate();
				router.back();
			},
		})
	);
	const createMediaUpload = useMutation(
		orpc.bambi.community.createMediaUpload.mutationOptions()
	);
	const pickImage = async (): Promise<string | null> => {
		const result = await pickAndUploadCommunityImage({
			createUpload: (input) => createMediaUpload.mutateAsync(input),
			gcsPublicBaseUrl: env.EXPO_PUBLIC_GCS_PUBLIC_BASE_URL,
		});
		if ("error" in result) {
			Alert.alert("이미지를 올리지 못했어요", result.error);
			return null;
		}
		return "publicUri" in result ? result.publicUri : null;
	};

	if (boards.isPending || (mode === "edit" && post.isPending)) {
		return <LoadingState label="작성 화면을 준비하고 있어요." />;
	}
	if (!board) {
		return null;
	}
	if (
		!board.isWritable ||
		(board.key === "notice" && mine.data?.bambiProfile?.role !== "admin")
	) {
		return (
			<BambiScreen>
				<Surface className="gap-2 rounded-lg p-4" variant="secondary">
					<Text className="font-bold text-foreground text-lg">글쓰기 제한</Text>
					<Text className="text-muted">
						이 게시판에는 글을 작성할 수 없어요.
					</Text>
				</Surface>
			</BambiScreen>
		);
	}
	if (
		mode === "edit" &&
		(post.data?.locked || (post.isError && submittedPassword))
	) {
		return (
			<BambiScreen>
				<Surface className="gap-3 rounded-lg p-4" variant="secondary">
					<Text className="font-semibold text-foreground">
						수정하려면 글 비밀번호를 입력해 주세요.
					</Text>
					<TextField>
						<Input
							onChangeText={setPassword}
							placeholder="비밀번호"
							secureTextEntry
							value={password}
						/>
					</TextField>
					{post.isError ? (
						<Text className="text-danger text-sm">
							비밀번호가 일치하지 않아요.
						</Text>
					) : null}
					<Button
						isDisabled={password.trim().length < 4}
						onPress={() => setSubmittedPassword(password.trim())}
					>
						<Button.Label>글 열기</Button.Label>
					</Button>
				</Surface>
			</BambiScreen>
		);
	}
	if (mode === "edit" && post.isError) {
		return (
			<ErrorState onRetry={() => post.refetch()} title="글을 열지 못했어요" />
		);
	}

	const canSubmit = canSubmitCommunityPost({
		body: effectiveBodyText,
		isGuest,
		isLocked: effectiveLocked,
		password,
		title: effectiveTitle,
	});
	const submit = () => {
		if (!canSubmit) {
			Alert.alert(
				"입력을 확인해 주세요",
				"제목과 본문을 입력하고, 필요한 경우 4자 이상 비밀번호를 설정해 주세요."
			);
			return;
		}
		const common = {
			authorName: effectiveAuthorName.trim(),
			body: effectiveBody,
			contactPhone:
				board.key === "legal" && effectiveContact.trim()
					? effectiveContact.trim()
					: undefined,
			isLocked: effectiveLocked,
			isPromotion: effectivePromotion,
			password: password.trim() || undefined,
			title: effectiveTitle.trim(),
		};
		if (mode === "edit" && postId) {
			update.mutate({
				...common,
				isAnonymous: effectiveAnonymous,
				postId,
			});
			return;
		}
		create.mutate({
			...common,
			board: board.key,
			commentsDisabled: false,
			isAnonymous: effectiveAnonymous,
			isEvent: false,
			noticeBoardKeys: [],
		});
	};

	return (
		<BambiScreen>
			<Text className="font-bold text-3xl text-foreground">
				{mode === "create" ? "글쓰기" : "글 수정"}
			</Text>
			<Surface className="gap-4 rounded-lg p-4" variant="secondary">
				{isGuest ? null : (
					<TextField>
						<Label>작성자</Label>
						<Input
							maxLength={30}
							onChangeText={setAuthorName}
							value={effectiveAuthorName}
						/>
					</TextField>
				)}
				<TextField>
					<Label>제목</Label>
					<Input
						maxLength={100}
						onChangeText={setTitle}
						placeholder="제목을 입력해 주세요"
						value={effectiveTitle}
					/>
				</TextField>
				<View className="gap-2">
					<Label>내용</Label>
					<CommunityDocumentEditor
						isDisabled={
							create.isPending ||
							update.isPending ||
							createMediaUpload.isPending
						}
						key={initial?.body ?? "new"}
						onChange={(value) => {
							setBody(value.json);
							setBodyText(value.text);
						}}
						onPickImage={isGuest ? undefined : pickImage}
						value={effectiveBody}
					/>
				</View>
				<View className="flex-row flex-wrap gap-2">
					{board.key === "legal" ? (
						<Chip color="accent" variant="soft">
							<Chip.Label>법률 자문 글은 비밀글</Chip.Label>
						</Chip>
					) : (
						<Chip
							color={effectiveLocked ? "accent" : "default"}
							onPress={() => setIsLocked(!effectiveLocked)}
							variant={effectiveLocked ? "primary" : "soft"}
						>
							<Chip.Label>비밀글</Chip.Label>
						</Chip>
					)}
					{isGuest ? null : (
						<Chip
							color={effectiveAnonymous ? "accent" : "default"}
							onPress={() => setIsAnonymous(!effectiveAnonymous)}
							variant={effectiveAnonymous ? "primary" : "soft"}
						>
							<Chip.Label>익명</Chip.Label>
						</Chip>
					)}
					{canMarkPromotion ? (
						<Chip
							color={effectivePromotion ? "accent" : "default"}
							onPress={() => setIsPromotion(!effectivePromotion)}
							variant={effectivePromotion ? "primary" : "soft"}
						>
							<Chip.Label>광고 글</Chip.Label>
						</Chip>
					) : null}
				</View>
				{board.key === "legal" ? (
					<TextField>
						<Label>연락처 (선택)</Label>
						<Input
							keyboardType="phone-pad"
							maxLength={20}
							onChangeText={setContactPhone}
							value={effectiveContact}
						/>
					</TextField>
				) : null}
				{isGuest || effectiveLocked || mode === "edit" ? (
					<TextField>
						<Label>비밀번호</Label>
						<Input
							maxLength={30}
							onChangeText={setPassword}
							placeholder="4자 이상"
							secureTextEntry
							value={password}
						/>
					</TextField>
				) : null}
			</Surface>
			<Button
				isDisabled={create.isPending || update.isPending}
				onPress={submit}
			>
				<Button.Label>
					{mode === "create" ? "등록하기" : "수정하기"}
				</Button.Label>
			</Button>
		</BambiScreen>
	);
}
