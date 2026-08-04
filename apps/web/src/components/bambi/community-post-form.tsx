"use client";

// 글 작성/수정 공용 폼. 컨트롤드 필드 + Tiptap 본문 에디터, 서버 검증에 위임한다.

import { Button } from "@bambi-app/ui/components/button";
import { Input } from "@bambi-app/ui/components/input";
import { Label } from "@bambi-app/ui/components/label";
import { Switch } from "@bambi-app/ui/components/switch";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { Route } from "next";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { CommunityPostEditor } from "@/components/bambi/community-editor";
import { authClient } from "@/lib/auth-client";
import {
	type CommunityBoardKey,
	type CommunityBoardMeta,
	communityBoardPath,
	communityPostPath,
} from "@/lib/bambi/community";
import { orpc } from "@/utils/orpc";

const TITLE_MAX = 100;
const AUTHOR_MAX = 30;
const PASSWORD_MIN = 4;
const PASSWORD_MAX = 30;
const MIN_TEXT = 2;

type WritableBoardKey = Exclude<CommunityBoardKey, "best">;

const isWritableBoardKey = (key: CommunityBoardKey): key is WritableBoardKey =>
	key !== "best";

const getInitialLockedState = (
	boardKey: CommunityBoardKey,
	initiallyLocked: boolean | undefined
): boolean => boardKey !== "free" && Boolean(initiallyLocked);

const isLockPasswordRequired = (
	isEdit: boolean,
	isFreeBoard: boolean,
	isLocked: boolean
): boolean => !(isEdit || isFreeBoard) && isLocked;

interface CommunityPostInitial {
	authorName: string;
	// 글 작성자의 role 스냅샷(getPost.authorRole). 수정 모드 광고 Switch 게이트에 쓴다.
	authorRole: "admin" | "employer" | "job_seeker";
	body: string;
	id: string;
	isLocked: boolean;
	// 수정 모드 광고글 초기값. 편집 페이지가 getPost.isPromotion을 넘겨주면 사용한다.
	isPromotion?: boolean;
	title: string;
}

interface CommunityPostFormProps {
	board: CommunityBoardMeta;
	// 수정 모드 초기값. 비작성자(비밀번호 수정)는 editPassword로 게이트 통과 비번을 넘긴다.
	editPassword?: string;
	initialPost?: CommunityPostInitial;
}

// 비밀글 잠금 스위치 + (잠금 시) 비밀번호 필드. 자유수다는 스위치를 숨기되 수정 권한 확인용
// 비밀번호 필드는 유지한다. 작성 모드는 잠금을 끄면 잔여 비번을 비운다.
function PostLockField({
	allowLocking,
	isEdit,
	isLocked,
	password,
	setIsLocked,
	setPassword,
}: {
	allowLocking: boolean;
	isEdit: boolean;
	isLocked: boolean;
	password: string;
	setIsLocked: (value: boolean) => void;
	setPassword: (value: string) => void;
}) {
	const showPasswordField = isEdit || (allowLocking && isLocked);
	const handleLockChange = (checked: boolean) => {
		setIsLocked(checked);
		if (!(checked || isEdit)) {
			setPassword("");
		}
	};
	return (
		<div className="flex flex-col gap-2">
			{allowLocking ? (
				<div className="flex items-center gap-2">
					<Switch
						checked={isLocked}
						id="community-post-lock"
						onCheckedChange={handleLockChange}
					/>
					<Label htmlFor="community-post-lock">비밀글로 잠그기</Label>
				</div>
			) : null}
			{showPasswordField ? (
				<div className="flex flex-col gap-2">
					<Label htmlFor="community-post-password">
						{isEdit ? "글 비밀번호" : "비밀글 비밀번호"}
					</Label>
					<Input
						autoComplete="new-password"
						id="community-post-password"
						maxLength={PASSWORD_MAX}
						onChange={(event) => setPassword(event.target.value)}
						placeholder={isEdit ? "본인은 비워둘 수 있어요" : "4자 이상"}
						type="password"
						value={password}
					/>
				</div>
			) : null}
		</div>
	);
}

export function CommunityPostForm({
	board,
	editPassword,
	initialPost,
}: CommunityPostFormProps) {
	const router = useRouter();
	const queryClient = useQueryClient();
	const isEdit = Boolean(initialPost);
	const isFreeBoard = board.key === "free";

	const [authorName, setAuthorName] = useState(initialPost?.authorName ?? "");
	const [password, setPassword] = useState(editPassword ?? "");
	const [isLocked, setIsLocked] = useState(
		getInitialLockedState(board.key, initialPost?.isLocked)
	);
	const [isPromotion, setIsPromotion] = useState(
		initialPost?.isPromotion ?? false
	);
	const [title, setTitle] = useState(initialPost?.title ?? "");
	const [bodyJson, setBodyJson] = useState(initialPost?.body ?? "");
	const [bodyText, setBodyText] = useState("");
	// 이미지만 있고 텍스트가 없는 글도 허용(서버 검증과 일치) — 에디터가 이미지 포함 여부를 보고한다.
	const [bodyHasImage, setBodyHasImage] = useState(false);

	// 현재 편집자가 admin인지 알아야 예약 작성인 예외를 적용할 수 있으므로 작성·수정
	// 모두 프로필을 조회한다. 광고 게이트는 수정 모드에서 글 작성자 role 스냅샷을 쓴다.
	const session = authClient.useSession();
	const mineQuery = useQuery(orpc.bambi.onboarding.getMine.queryOptions());
	const role = mineQuery.data?.bambiProfile?.role;
	// 작성인 기본값은 표시명(user.name, 세션)에서 가져온다 — bambi_profile.display_name은 제거됐다.
	const displayName = session.data?.user?.name ?? "";
	// 광고 Switch 노출: 작성 모드는 편집자 role, 수정 모드는 글 작성자 role 기준.
	// employer가 비번으로 타인(job_seeker) 글을 수정할 때 서버 검증(작성자 role
	// 기준)과 어긋나 BAD_REQUEST 나던 문제를 막는다.
	const canPromote = isEdit
		? initialPost?.authorRole === "employer"
		: role === "employer";
	useEffect(() => {
		if (!isEdit && displayName) {
			setAuthorName((previous) => (previous === "" ? displayName : previous));
		}
	}, [displayName, isEdit]);

	// 공지사항은 운영자만 작성 가능 — 작성 모드에서 비운영자는 안내 후 목록으로 보낸다.
	const blockedFromNotice =
		!(isEdit || mineQuery.isPending) && board.adminOnly && role !== "admin";
	useEffect(() => {
		if (blockedFromNotice) {
			toast("공지사항은 운영자만 작성할 수 있어요.");
			router.replace(communityBoardPath(board.slug) as Route);
		}
	}, [blockedFromNotice, board.slug, router]);

	const invalidateAndGo = async (postId: string) => {
		await queryClient.invalidateQueries({
			queryKey: orpc.bambi.community.key(),
		});
		router.replace(communityPostPath(board.slug, postId) as Route);
	};

	const createMutation = useMutation(
		orpc.bambi.community.createPost.mutationOptions({
			onError: (error) => {
				toast(error.message || "글을 등록하지 못했어요.");
			},
			onSuccess: async (created) => {
				toast("글이 등록됐어요.");
				await invalidateAndGo(created.id);
			},
		})
	);
	const updateMutation = useMutation(
		orpc.bambi.community.updatePost.mutationOptions({
			onError: (error) => {
				toast(error.message || "글을 수정하지 못했어요.");
			},
			onSuccess: async (updated) => {
				toast("글이 수정됐어요.");
				await invalidateAndGo(updated.id);
			},
		})
	);

	// 비밀번호는 비밀글(잠금)에만 필요하다 — 작성 모드에서 잠그지 않으면 비번 없이 등록할 수 있다.
	const requiresPassword = isLockPasswordRequired(
		isEdit,
		isFreeBoard,
		isLocked
	);
	const submittedIsLocked = !isFreeBoard && isLocked;

	const isSubmitting = createMutation.isPending || updateMutation.isPending;
	const canSubmit =
		authorName.trim().length >= 1 &&
		title.trim().length >= MIN_TEXT &&
		(bodyText.trim().length >= MIN_TEXT || bodyHasImage) &&
		(!requiresPassword || password.length >= PASSWORD_MIN) &&
		!isSubmitting;

	const submitEdit = (postId: string) => {
		const trimmedPassword = password.trim();
		updateMutation.mutate({
			authorName: authorName.trim(),
			body: bodyJson,
			isLocked: submittedIsLocked,
			isPromotion,
			postId,
			title: title.trim(),
			...(trimmedPassword ? { password: trimmedPassword } : {}),
		});
	};

	const submitCreate = () => {
		const boardKey = board.key;
		if (!isWritableBoardKey(boardKey)) {
			return;
		}
		const trimmedPassword = password.trim();
		createMutation.mutate({
			authorName: authorName.trim(),
			board: boardKey,
			body: bodyJson,
			isLocked: submittedIsLocked,
			isPromotion,
			title: title.trim(),
			...(trimmedPassword ? { password: trimmedPassword } : {}),
		});
	};

	const handleSubmit = () => {
		if (!canSubmit) {
			return;
		}
		if (isEdit && initialPost) {
			submitEdit(initialPost.id);
			return;
		}
		submitCreate();
	};

	if (blockedFromNotice) {
		return null;
	}

	return (
		<div className="flex flex-col gap-4">
			<h1 className="m-0 font-extrabold text-xl">
				{board.label} {isEdit ? "글 수정" : "글쓰기"}
			</h1>

			<div className="flex flex-col gap-2">
				<Label htmlFor="community-post-author">작성인</Label>
				<Input
					id="community-post-author"
					maxLength={AUTHOR_MAX}
					onChange={(event) => setAuthorName(event.target.value)}
					placeholder="작성인 이름"
					value={authorName}
				/>
			</div>

			<PostLockField
				allowLocking={!isFreeBoard}
				isEdit={isEdit}
				isLocked={isLocked}
				password={password}
				setIsLocked={setIsLocked}
				setPassword={setPassword}
			/>

			{canPromote ? (
				<div className="flex items-center gap-2">
					<Switch
						checked={isPromotion}
						id="community-post-promotion"
						onCheckedChange={setIsPromotion}
					/>
					<Label htmlFor="community-post-promotion">광고글로 표시하기</Label>
				</div>
			) : null}

			<div className="flex flex-col gap-2">
				<Label htmlFor="community-post-title">제목</Label>
				<Input
					id="community-post-title"
					maxLength={TITLE_MAX}
					onChange={(event) => setTitle(event.target.value)}
					placeholder="제목을 입력해 주세요 (2자 이상)"
					value={title}
				/>
			</div>

			<div className="flex flex-col gap-2">
				<Label>본문</Label>
				<CommunityPostEditor
					onChange={(payload) => {
						setBodyJson(payload.json);
						setBodyText(payload.text);
						setBodyHasImage(payload.hasImage);
					}}
					value={bodyJson}
				/>
			</div>

			<div className="flex justify-end gap-2">
				<Button
					onClick={() => router.push(communityBoardPath(board.slug) as Route)}
					type="button"
					variant="outline"
				>
					취소
				</Button>
				<Button disabled={!canSubmit} onClick={handleSubmit} type="button">
					{isEdit ? "수정하기" : "등록하기"}
				</Button>
			</div>
		</div>
	);
}
