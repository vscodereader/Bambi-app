"use client";

import { Button } from "@bambi-app/ui/components/button";
import { Input } from "@bambi-app/ui/components/input";
import { Label } from "@bambi-app/ui/components/label";
import { Skeleton } from "@bambi-app/ui/components/skeleton";
import { useQuery } from "@tanstack/react-query";
import { notFound, useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { CommunityPostForm } from "@/components/bambi/community-post-form";
import { type CommunityBoardMeta, getBoardBySlug } from "@/lib/bambi/community";
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

function CommunityEditContent({
	board,
	postId,
}: {
	board: CommunityBoardMeta;
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

	// 작성자(canEdit)는 즉시, 비작성자는 게이트 비번을 통과했을 때만 폼 로드.
	if (data && data.locked === false && (data.canEdit || appliedPassword)) {
		return (
			<CommunityPostForm
				board={board}
				editPassword={data.canEdit ? undefined : appliedPassword}
				initialPost={{
					authorName: data.authorName,
					authorRole: data.authorRole,
					body: data.body,
					id: data.id,
					isLocked: data.isLocked,
					isPromotion: data.isPromotion,
					title: data.title,
				}}
			/>
		);
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

export default function SeekerCommunityEditPage() {
	const params = useParams<{ board: string; postId: string }>();
	const board = getBoardBySlug(params.board);

	if (!board?.writable) {
		notFound();
	}

	return <CommunityEditContent board={board} postId={params.postId} />;
}
