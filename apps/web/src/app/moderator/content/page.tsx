"use client";

// 운영자 통합 게시물 조치 화면. 커뮤니티 글·댓글·고객센터 문의를 한 화면에서 숨김/복구/삭제한다.
// 서버가 유형별 행을 공통 형태({id,targetType,title,excerpt,...})로 내려주므로 표시에는 분기가 없고,
// 조치 mutation의 입력 키(postId/commentId/inquiryId)만 유형별로 갈린다.

import { Badge } from "@bambi-app/ui/components/badge";
import { Button } from "@bambi-app/ui/components/button";
import { Input } from "@bambi-app/ui/components/input";
import { Label } from "@bambi-app/ui/components/label";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@bambi-app/ui/components/table";
import { Tabs, TabsList, TabsTrigger } from "@bambi-app/ui/components/tabs";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { EmptyState } from "@/components/bambi/empty-state";
import { CONTENT_STATUS_LABELS, type ContentStatus } from "@/lib/bambi/support";
import { formatDateTime } from "@/lib/bambi-format";
import { orpc } from "@/utils/orpc";

const TARGET_TABS = [
	{ value: "community_post", label: "커뮤니티 글" },
	{ value: "community_comment", label: "커뮤니티 댓글" },
	{ value: "support_inquiry", label: "고객센터 문의" },
] as const;

type TargetType = (typeof TARGET_TABS)[number]["value"];

// 서버 min(2) 거절을 왕복 없이 막기 위한 UI 선제 검사 기준.
const REASON_MIN_LENGTH = 2;

const STATUS_ACTIONS: { status: ContentStatus; label: string }[] = [
	{ status: "hidden", label: "숨김" },
	{ status: "published", label: "복구" },
	{ status: "deleted", label: "삭제" },
];

export default function ModeratorContentPage() {
	const queryClient = useQueryClient();
	const [targetType, setTargetType] = useState<TargetType>("community_post");
	const [page, setPage] = useState(1);
	const [reason, setReason] = useState("");

	const listQuery = useQuery(
		orpc.bambi.moderation.listModeratableContent.queryOptions({
			input: { page, targetType },
		})
	);

	const invalidate = async () => {
		toast.success("조치했어요.");
		setReason("");
		await queryClient.invalidateQueries({
			// input 없이 호출해 유형·페이지 전체를 한 번에 무효화한다.
			queryKey: orpc.bambi.moderation.listModeratableContent.key(),
		});
	};
	const onError = (error: Error) => toast.error(error.message);

	const setPostStatus = useMutation(
		orpc.bambi.community.setPostStatusByAdmin.mutationOptions({
			onSuccess: invalidate,
			onError,
		})
	);
	const setCommentStatus = useMutation(
		orpc.bambi.community.setCommentStatusByAdmin.mutationOptions({
			onSuccess: invalidate,
			onError,
		})
	);
	const setInquiryStatus = useMutation(
		orpc.bambi.moderation.setInquiryStatusByAdmin.mutationOptions({
			onSuccess: invalidate,
			onError,
		})
	);

	const isPending =
		setPostStatus.isPending ||
		setCommentStatus.isPending ||
		setInquiryStatus.isPending;

	const apply = (id: string, status: ContentStatus) => {
		const trimmed = reason.trim();
		if (trimmed.length < REASON_MIN_LENGTH) {
			toast.error(`조치 사유를 ${REASON_MIN_LENGTH}자 이상 입력해 주세요.`);
			return;
		}
		if (targetType === "community_post") {
			setPostStatus.mutate({ postId: id, reason: trimmed, status });
		} else if (targetType === "community_comment") {
			setCommentStatus.mutate({ commentId: id, reason: trimmed, status });
		} else {
			setInquiryStatus.mutate({ inquiryId: id, reason: trimmed, status });
		}
	};

	const items = listQuery.data?.items ?? [];
	const totalCount = listQuery.data?.totalCount ?? 0;
	const pageSize = listQuery.data?.pageSize ?? 20;
	const hasNextPage = page * pageSize < totalCount;

	return (
		<div className="mx-auto flex w-full max-w-3xl flex-col gap-4 px-6 py-6">
			<h1 className="m-0 font-extrabold text-2xl">게시물 조치</h1>

			<Tabs
				onValueChange={(value) => {
					setTargetType(value as TargetType);
					setPage(1);
				}}
				value={targetType}
			>
				<TabsList className="max-w-full flex-wrap">
					{TARGET_TABS.map((tab) => (
						<TabsTrigger key={tab.value} value={tab.value}>
							{tab.label}
						</TabsTrigger>
					))}
				</TabsList>
			</Tabs>

			<div className="flex flex-col gap-2">
				<Label htmlFor="moderation-reason">조치 사유(필수)</Label>
				<Input
					id="moderation-reason"
					onChange={(event) => setReason(event.target.value)}
					placeholder="예: 광고성 게시물"
					value={reason}
				/>
			</div>

			{items.length === 0 ? (
				<EmptyState
					description="선택한 유형에 조치할 게시물이 없어요."
					title="게시물이 없어요"
				/>
			) : (
				<div className="w-full overflow-x-auto">
					<Table>
						<TableHeader>
							<TableRow>
								<TableHead>내용</TableHead>
								<TableHead>작성자</TableHead>
								<TableHead>상태</TableHead>
								<TableHead>등록일</TableHead>
								<TableHead>조치</TableHead>
							</TableRow>
						</TableHeader>
						<TableBody>
							{items.map((item) => (
								<TableRow key={item.id}>
									<TableCell className="max-w-64 whitespace-normal">
										<span className="block font-medium">{item.title}</span>
										<span className="block text-muted-foreground">
											{item.excerpt}
										</span>
									</TableCell>
									<TableCell>{item.authorName}</TableCell>
									<TableCell>
										<Badge variant="secondary">
											{CONTENT_STATUS_LABELS[item.status]}
										</Badge>
									</TableCell>
									<TableCell>{formatDateTime(item.createdAt)}</TableCell>
									<TableCell>
										<div className="flex flex-wrap gap-2">
											{STATUS_ACTIONS.filter(
												(action) => action.status !== item.status
											).map((action) => (
												<Button
													disabled={isPending}
													key={action.status}
													onClick={() => apply(item.id, action.status)}
													size="sm"
													variant={
														action.status === "deleted"
															? "destructive"
															: "secondary"
													}
												>
													{action.label}
												</Button>
											))}
										</div>
									</TableCell>
								</TableRow>
							))}
						</TableBody>
					</Table>
				</div>
			)}

			<div className="flex items-center justify-between gap-2">
				<Button
					disabled={page <= 1}
					onClick={() => setPage((prev) => Math.max(1, prev - 1))}
					variant="outline"
				>
					이전
				</Button>
				<span className="text-muted-foreground text-sm">
					{page} / {Math.max(1, Math.ceil(totalCount / pageSize))}
				</span>
				<Button
					disabled={!hasNextPage}
					onClick={() => setPage((prev) => prev + 1)}
					variant="outline"
				>
					다음
				</Button>
			</div>
		</div>
	);
}
