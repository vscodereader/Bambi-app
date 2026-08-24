"use client";

import { Button } from "@bambi-app/ui/components/button";
import { Input } from "@bambi-app/ui/components/input";
import { Label } from "@bambi-app/ui/components/label";
import { Skeleton } from "@bambi-app/ui/components/skeleton";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { CommunityPostForm } from "@/components/bambi/community-post-form";
import type { CommunityBoardMeta } from "@/lib/bambi/community";
import { canOpenEditForm } from "@/lib/bambi/community-edit-gate";
import { orpc } from "@/utils/orpc";

const PASSWORD_MIN = 4;

// 비작성자·비밀글 수정 진입 게이트. 글 비밀번호로 getPost 재조회를 트리거한다.
function CommunityEditPasswordGate({
	hasError,
	onSubmit,
	password,
	setPassword,
}: {
	hasError: boolean;
	onSubmit: () => void;
	password: string;
	setPassword: (value: string) => void;
}) {
	return (
		<div className="flex flex-col gap-4">
			<h1 className="m-0 font-extrabold text-xl">글 비밀번호 확인</h1>
			<p className="m-0 text-muted-foreground text-sm">
				이 글을 수정하려면 글 비밀번호를 입력해 주세요.
			</p>
			<div className="flex flex-col gap-2">
				<Label htmlFor="community-edit-gate-password">글 비밀번호</Label>
				<Input
					autoComplete="off"
					id="community-edit-gate-password"
					maxLength={30}
					onChange={(event) => setPassword(event.target.value)}
					placeholder="4자 이상"
					type="password"
					value={password}
				/>
				{hasError ? (
					<p className="m-0 text-destructive text-sm">
						비밀번호가 일치하지 않거나 글을 찾을 수 없어요.
					</p>
				) : null}
			</div>
			<div className="flex justify-end">
				<Button
					disabled={password.length < PASSWORD_MIN}
					onClick={onSubmit}
					type="button"
				>
					확인
				</Button>
			</div>
		</div>
	);
}

export function CommunityEditGate({
	board,
	guest,
	postId,
}: {
	board: CommunityBoardMeta;
	guest: boolean;
	postId: string;
}) {
	const [password, setPassword] = useState("");
	const [appliedPassword, setAppliedPassword] = useState<string | undefined>();

	const postQuery = useQuery(
		orpc.bambi.community.getPost.queryOptions({
			input: { password: appliedPassword, postId },
		})
	);

	useEffect(() => {
		if (postQuery.isError && appliedPassword) {
			toast("비밀번호를 확인해 주세요.");
		}
	}, [postQuery.isError, appliedPassword]);

	if (postQuery.isPending) {
		return <Skeleton className="h-64 w-full" />;
	}

	const data = postQuery.data;

	// 회원 작성자(canEdit)만 게이트를 건너뛰고 즉시 폼을 연다. 비회원은 gid 힌트로 canEdit이
	// 서더라도 항상 게이트를 거쳐 서버가 비밀번호를 실검증하게 한다(getPost가 비잠금 글도 검증).
	// 회원 작성자는 세션으로 소유권이 증명되므로 폼에 비번을 채우지 않고(editPassword undefined),
	// 그 외에는 게이트를 통과한 비번을 폼으로 넘겨 저장 시 재입력을 없앤다.
	// data.locked === false로 먼저 좁혀야 canEdit·body 등 비잠금 응답 필드에 접근할 수 있다.
	if (data && data.locked === false) {
		const isMemberAuthor = !guest && data.canEdit;
		if (
			canOpenEditForm({ appliedPassword, isMemberAuthor, locked: data.locked })
		) {
			return (
				<CommunityPostForm
					board={board}
					editPassword={isMemberAuthor ? undefined : appliedPassword}
					guest={guest}
					initialPost={{
						authorName: data.authorName,
						authorRole: data.authorRole,
						board: data.board,
						body: data.body,
						contactPhone: data.contactPhone,
						commentsDisabled: data.commentsDisabled,
						id: data.id,
						isAnonymous: data.isAnonymous,
						isLocked: data.isLocked,
						isEvent: data.isEvent,
						isPromotion: data.isPromotion,
						noticeBoardKeys: data.noticeBoardKeys,
						title: data.title,
					}}
				/>
			);
		}
	}

	return (
		<CommunityEditPasswordGate
			hasError={postQuery.isError}
			onSubmit={() => setAppliedPassword(password)}
			password={password}
			setPassword={setPassword}
		/>
	);
}
