"use client";

// 운영자 통합 게시물 조치 화면. 커뮤니티 글·댓글·고객센터 문의를 한 화면에서 숨김/복구/삭제한다.
// 서버가 유형별 행을 공통 형태({id,targetType,title,excerpt,...})로 내려주므로 표시에는 분기가 없고,
// 조치 mutation의 입력 키(postId/commentId/inquiryId)만 유형별로 갈린다.
//
// 조치는 행 우측 Row Actions(DropdownMenu) → 사유 입력 Dialog → mutation 순서로 나간다.
// 사유 Dialog는 목록 밖에 하나만 두고 대상만 갈아끼운다(행마다 Dialog를 두면 20개가 마운트된다).

import { Badge } from "@bambi-app/ui/components/badge";
import { Button } from "@bambi-app/ui/components/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogTitle,
} from "@bambi-app/ui/components/dialog";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "@bambi-app/ui/components/dropdown-menu";
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
import { Textarea } from "@bambi-app/ui/components/textarea";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
	ChevronDownIcon,
	ChevronUpIcon,
	MoreHorizontalIcon,
} from "lucide-react";
import { Fragment, useState } from "react";
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

const TABLE_COLUMN_COUNT = 6;

// 사유 Dialog가 조치를 확정할 때까지 들고 있는 대상. null이면 Dialog가 닫힌 상태다.
interface PendingAction {
	id: string;
	label: string;
	status: ContentStatus;
	title: string;
}

export default function ModeratorContentPage() {
	const queryClient = useQueryClient();
	const [targetType, setTargetType] = useState<TargetType>("community_post");
	const [page, setPage] = useState(1);
	const [expandedId, setExpandedId] = useState<string | null>(null);
	const [pending, setPending] = useState<PendingAction | null>(null);
	const [reason, setReason] = useState("");

	const listQuery = useQuery(
		orpc.bambi.moderation.listModeratableContent.queryOptions({
			input: { page, targetType },
		})
	);

	// 펼친 행에 대해서만 전체 본문을 조회한다(목록 excerpt는 120자라 내용 판단이 어렵다).
	const detailQuery = useQuery({
		...orpc.bambi.moderation.getModeratableContentDetail.queryOptions({
			input: { id: expandedId ?? "", targetType },
		}),
		enabled: expandedId !== null,
	});

	const closeDialog = () => {
		setPending(null);
		setReason("");
	};

	const invalidate = async () => {
		toast.success("조치했어요.");
		closeDialog();
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

	const trimmedReason = reason.trim();
	const canSubmit = trimmedReason.length >= REASON_MIN_LENGTH && !isPending;

	const confirmAction = () => {
		if (!(pending && canSubmit)) {
			return;
		}
		const input = { reason: trimmedReason, status: pending.status };
		if (targetType === "community_post") {
			setPostStatus.mutate({ postId: pending.id, ...input });
		} else if (targetType === "community_comment") {
			setCommentStatus.mutate({ commentId: pending.id, ...input });
		} else {
			setInquiryStatus.mutate({ inquiryId: pending.id, ...input });
		}
	};

	const switchTargetType = (value: string) => {
		setTargetType(value as TargetType);
		setPage(1);
		// 유형이 바뀌면 펼친 행의 id가 다른 테이블 것이 되므로 접는다.
		setExpandedId(null);
	};

	const items = listQuery.data?.items ?? [];
	const totalCount = listQuery.data?.totalCount ?? 0;
	const pageSize = listQuery.data?.pageSize ?? 20;
	const hasNextPage = page * pageSize < totalCount;

	return (
		<div className="mx-auto flex w-full max-w-5xl flex-col gap-4 px-6 py-6">
			<h1 className="m-0 font-extrabold text-2xl">게시물 조치</h1>

			<Tabs onValueChange={switchTargetType} value={targetType}>
				<TabsList className="max-w-full flex-wrap">
					{TARGET_TABS.map((tab) => (
						<TabsTrigger key={tab.value} value={tab.value}>
							{tab.label}
						</TabsTrigger>
					))}
				</TabsList>
			</Tabs>

			{items.length === 0 ? (
				<EmptyState
					description="선택한 유형에 조치할 게시물이 없어요."
					title="게시물이 없어요"
				/>
			) : (
				<Table>
					<TableHeader>
						<TableRow>
							<TableHead className="w-10">
								<span className="sr-only">상세보기</span>
							</TableHead>
							<TableHead>내용</TableHead>
							<TableHead>작성자</TableHead>
							<TableHead>상태</TableHead>
							<TableHead>등록일</TableHead>
							<TableHead className="w-10">
								<span className="sr-only">조치</span>
							</TableHead>
						</TableRow>
					</TableHeader>
					<TableBody>
						{items.map((item) => {
							const isExpanded = expandedId === item.id;
							return (
								<Fragment key={item.id}>
									<TableRow>
										<TableCell>
											<Button
												aria-expanded={isExpanded}
												aria-label={isExpanded ? "상세 접기" : "상세 펼치기"}
												onClick={() =>
													setExpandedId(isExpanded ? null : item.id)
												}
												size="icon-sm"
												variant="ghost"
											>
												{isExpanded ? <ChevronUpIcon /> : <ChevronDownIcon />}
											</Button>
										</TableCell>
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
											<DropdownMenu>
												<DropdownMenuTrigger
													render={
														<Button
															aria-label="조치 메뉴"
															size="icon-sm"
															variant="ghost"
														>
															<MoreHorizontalIcon />
														</Button>
													}
												/>
												<DropdownMenuContent align="end" className="w-32">
													{STATUS_ACTIONS.filter(
														(action) => action.status !== item.status
													).map((action) => (
														<DropdownMenuItem
															key={action.status}
															onClick={() =>
																setPending({
																	id: item.id,
																	label: action.label,
																	status: action.status,
																	title: item.title,
																})
															}
															variant={
																action.status === "deleted"
																	? "destructive"
																	: "default"
															}
														>
															{action.label}
														</DropdownMenuItem>
													))}
												</DropdownMenuContent>
											</DropdownMenu>
										</TableCell>
									</TableRow>
									{isExpanded ? (
										<TableRow>
											<TableCell
												className="whitespace-normal bg-muted/30"
												colSpan={TABLE_COLUMN_COUNT}
											>
												<DetailPanel
													board={detailQuery.data?.board}
													body={detailQuery.data?.body}
													category={detailQuery.data?.category}
													isLoading={detailQuery.isPending}
												/>
											</TableCell>
										</TableRow>
									) : null}
								</Fragment>
							);
						})}
					</TableBody>
				</Table>
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

			<Dialog
				onOpenChange={(open) => {
					if (!open) {
						closeDialog();
					}
				}}
				open={pending !== null}
			>
				<DialogContent>
					<div className="flex flex-col gap-2">
						<DialogTitle>{pending?.label} 조치</DialogTitle>
						<DialogDescription>
							「{pending?.title}」 항목을 {pending?.label} 처리합니다. 사유는
							감사 로그에 남아요.
						</DialogDescription>
					</div>
					<div className="flex flex-col gap-2">
						<Label htmlFor="moderation-reason">조치 사유(필수)</Label>
						<Textarea
							id="moderation-reason"
							onChange={(event) => setReason(event.target.value)}
							placeholder="예: 광고성 게시물"
							value={reason}
						/>
						<p className="m-0 text-muted-foreground text-xs">
							{REASON_MIN_LENGTH}자 이상 입력해 주세요.
						</p>
					</div>
					<div className="grid grid-cols-2 gap-2">
						<Button
							disabled={isPending}
							onClick={closeDialog}
							variant="outline"
						>
							취소
						</Button>
						<Button
							disabled={!canSubmit}
							onClick={confirmAction}
							variant={
								pending?.status === "deleted" ? "destructive" : "default"
							}
						>
							{isPending ? "처리 중" : "확인"}
						</Button>
					</div>
				</DialogContent>
			</Dialog>
		</div>
	);
}

// 펼친 행의 전체 본문 패널. 목록 excerpt와 달리 줄바꿈을 유지해 원문 형태로 보여준다.
function DetailPanel({
	body,
	board,
	category,
	isLoading,
}: {
	body: string | undefined;
	board: string | null | undefined;
	category: string | null | undefined;
	isLoading: boolean;
}) {
	if (isLoading) {
		return (
			<p className="m-0 text-muted-foreground">본문을 불러오는 중이에요.</p>
		);
	}

	const meta = board ?? category;

	return (
		<div className="flex flex-col gap-2">
			{meta ? <Badge variant="outline">{meta}</Badge> : null}
			<p className="m-0 whitespace-pre-wrap text-sm leading-relaxed">
				{body ?? "본문을 불러오지 못했어요."}
			</p>
		</div>
	);
}
