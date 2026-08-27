"use client";

// 밤비 — 운영자 쪽지 발송·발송 이력 패널.
// 대상은 역할 축(구직자[법률자문 포함]/구인자) + 특정 사용자 지정을 섞어 쓴다.
// 수신자 검색은 별도 API 없이 moderation.listUsers(전량) 결과를 클라이언트 필터한다.

import type { AppRouter } from "@bambi-app/api/routers/index";
import {
	AlertDialog,
	AlertDialogAction,
	AlertDialogCancel,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogTitle,
} from "@bambi-app/ui/components/alert-dialog";
import { Badge } from "@bambi-app/ui/components/badge";
import { Button } from "@bambi-app/ui/components/button";
import {
	Card,
	CardContent,
	CardHeader,
	CardTitle,
} from "@bambi-app/ui/components/card";
import { Checkbox } from "@bambi-app/ui/components/checkbox";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogTitle,
} from "@bambi-app/ui/components/dialog";
import { Input } from "@bambi-app/ui/components/input";
import { Label } from "@bambi-app/ui/components/label";
import { Skeleton } from "@bambi-app/ui/components/skeleton";
import {
	ToggleGroup,
	ToggleGroupItem,
} from "@bambi-app/ui/components/toggle-group";
import { cn } from "@bambi-app/ui/lib/utils";
import type { InferRouterOutputs } from "@orpc/server";
import {
	useInfiniteQuery,
	useMutation,
	useQuery,
	useQueryClient,
} from "@tanstack/react-query";
import { useSearchParams } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { CommunityPostEditor } from "@/components/bambi/community-editor";
import { PostBodyViewer } from "@/components/bambi/community-post-detail-parts";
import { EmptyState } from "@/components/bambi/empty-state";
import { userRoleLabel } from "@/lib/bambi/moderation-labels";
import { formatDateTime } from "@/lib/bambi-format";
import { orpc } from "@/utils/orpc";

const TITLE_MAX = 100;
// 본문 텍스트(서식 제외) 카운터·발송 게이트 기준. 서버 저장은 Tiptap JSON이라
// 이 상한은 화면 텍스트 UX 기준일 뿐이고, 서버는 JSON 직렬화 상한을 따로 검증한다.
const BODY_MAX = 2000;
const SENT_PAGE_SIZE = 20;
const USERS_QUERY_INPUT = { limit: 1000 } as const;
// 발송 대상이 될 수 없는 역할(운영자·비회원)은 검색 후보·수신자 지정에서 제외한다 —
// 서버도 개별 지정 경로에서 같은 역할을 거른다.
const NON_MESSAGEABLE_ROLES = new Set(["admin", "guest"]);

type SentOrder = "newest" | "oldest";

interface SentCursor {
	createdAt: string;
	messageId: string;
}

// 발송 이력의 대상 요약 라벨. targetRoles는 발송 시 스냅샷된 역할 축 배열이라
// enum 원값을 그대로 렌더하지 않고 이 맵을 거친다(빈 배열 = 개별 지정만).
const TARGET_ROLE_LABELS: Record<string, string> = {
	job_seeker: "구직자 전체",
	employer: "구인자 전체",
};

const describeTargets = (roles: string[]): string =>
	roles.length === 0
		? "개별 지정"
		: roles
				.map((role) => TARGET_ROLE_LABELS[role] ?? "대상 확인 필요")
				.join(" · ");

interface SelectedRecipient {
	id: string;
	name: string;
}

type SentDetail =
	InferRouterOutputs<AppRouter>["bambi"]["directMessages"]["sentDetail"];

// 발송 상세 다이얼로그 본문. 헤드라인 수신자 수는 서버 총계(recipientCount)를 쓰고,
// 목록은 최근 1000명 상한이라 초과 시 안내 한 줄을 덧붙인다.
function SentDetailBody({ detail }: { detail: SentDetail | undefined }) {
	if (!detail) {
		return (
			<div className="flex flex-col gap-2">
				<Skeleton className="h-6 w-40" />
				<Skeleton className="h-20 w-full" />
			</div>
		);
	}
	return (
		<>
			<DialogTitle>{detail.message.title}</DialogTitle>
			<DialogDescription>
				{describeTargets(detail.message.targetRoles)} ·{" "}
				{formatDateTime(detail.message.createdAt)}
			</DialogDescription>
			<PostBodyViewer body={detail.message.body} />
			<div className="flex flex-col gap-2">
				<span className="font-semibold text-foreground text-sm">
					수신자 {detail.message.recipientCount}명
				</span>
				<ul className="flex max-h-64 flex-col gap-1 overflow-y-auto">
					{detail.recipients.map((recipient) => (
						<li
							className="flex items-center justify-between gap-2 text-sm"
							key={recipient.recipientUserId}
						>
							<span className="truncate text-foreground">
								{recipient.recipientName}
							</span>
							{recipient.readAt ? (
								<Badge variant="success">
									{formatDateTime(recipient.readAt)} 읽음
								</Badge>
							) : (
								<Badge variant="secondary">안읽음</Badge>
							)}
						</li>
					))}
				</ul>
				{detail.recipients.length >= 1000 &&
				detail.message.recipientCount > 1000 ? (
					<span className="text-muted-foreground text-xs">
						최근 1000명만 표시됩니다.
					</span>
				) : null}
			</div>
		</>
	);
}

export function ModeratorMessagesPanel() {
	const queryClient = useQueryClient();
	const searchParams = useSearchParams();
	const presetUserId = searchParams.get("to");

	const [roleJobSeeker, setRoleJobSeeker] = useState(false);
	const [roleEmployer, setRoleEmployer] = useState(false);
	const [recipientSearch, setRecipientSearch] = useState("");
	const [selected, setSelected] = useState<SelectedRecipient[]>([]);
	const [title, setTitle] = useState("");
	// body는 Tiptap 문서 JSON 문자열(제출용), bodyText는 그 순수 텍스트(비어있음·카운터 판정용).
	const [body, setBody] = useState("");
	const [bodyText, setBodyText] = useState("");
	// 발송 성공 후 에디터를 초기화하기 위한 리마운트 키 — CommunityPostEditor는 value를
	// 마운트 시 1회만 읽는 비제어 규약이라 내용을 비우려면 새로 마운트해야 한다.
	const [editorKey, setEditorKey] = useState(0);
	const [isConfirmOpen, setIsConfirmOpen] = useState(false);
	const [detailMessageId, setDetailMessageId] = useState<null | string>(null);
	const [sentOrder, setSentOrder] = useState<SentOrder>("newest");

	const usersQuery = useQuery(
		orpc.bambi.moderation.listUsers.queryOptions({ input: USERS_QUERY_INPUT })
	);
	const sentQuery = useInfiniteQuery(
		orpc.bambi.directMessages.listSent.infiniteOptions({
			getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
			initialPageParam: null as SentCursor | null,
			// order를 input에 넣으면 쿼리키가 정렬별로 갈라져 전환 시 커서·캐시가 자동 분리된다.
			input: (cursor: SentCursor | null) => ({
				cursor: cursor ?? undefined,
				limit: SENT_PAGE_SIZE,
				order: sentOrder,
			}),
		})
	);
	const detailQuery = useQuery(
		orpc.bambi.directMessages.sentDetail.queryOptions({
			input: { messageId: detailMessageId ?? "" },
			enabled: detailMessageId !== null,
		})
	);
	const sendMutation = useMutation(
		orpc.bambi.directMessages.send.mutationOptions()
	);

	const users = usersQuery.data ?? [];

	// URL ?to=<userId>로 넘어온 사용자를 마운트 시 한 번만 선택 목록에 프리셋한다.
	const appliedPreset = useRef(false);
	useEffect(() => {
		if (appliedPreset.current || !presetUserId || users.length === 0) {
			return;
		}
		// URL 조작으로 발송 불가 대상(운영자·비회원·탈퇴)을 프리셋하는 경로도 후보
		// 검색과 같은 필터로 막는다 — 서버가 최종 거부하지만 조용한 실패 UX를 만들지 않게.
		const target = users.find(
			(candidate) =>
				candidate.userId === presetUserId &&
				candidate.deletedAt === null &&
				!NON_MESSAGEABLE_ROLES.has(candidate.role)
		);
		if (target) {
			appliedPreset.current = true;
			setSelected((prev) =>
				prev.some((item) => item.id === target.userId)
					? prev
					: [...prev, { id: target.userId, name: target.name }]
			);
		}
	}, [presetUserId, users]);

	const selectedIds = useMemo(
		() => new Set(selected.map((item) => item.id)),
		[selected]
	);

	const candidates = useMemo(() => {
		const keyword = recipientSearch.trim().toLowerCase();
		if (keyword.length === 0) {
			return [];
		}
		return users.filter(
			(candidate) =>
				candidate.deletedAt === null &&
				!NON_MESSAGEABLE_ROLES.has(candidate.role) &&
				!selectedIds.has(candidate.userId) &&
				[candidate.name, candidate.loginId ?? ""].some((field) =>
					field.toLowerCase().includes(keyword)
				)
		);
	}, [recipientSearch, users, selectedIds]);

	const roles = useMemo(() => {
		const next: ("employer" | "job_seeker")[] = [];
		if (roleJobSeeker) {
			next.push("job_seeker");
		}
		if (roleEmployer) {
			next.push("employer");
		}
		return next;
	}, [roleJobSeeker, roleEmployer]);

	const hasTarget = roles.length > 0 || selected.length > 0;
	const bodyLength = bodyText.trim().length;
	const canSend =
		hasTarget &&
		title.trim().length > 0 &&
		bodyLength > 0 &&
		bodyLength <= BODY_MAX;

	const addRecipient = (recipient: SelectedRecipient) => {
		setSelected((prev) =>
			prev.some((item) => item.id === recipient.id)
				? prev
				: [...prev, recipient]
		);
		setRecipientSearch("");
	};

	const removeRecipient = (id: string) => {
		setSelected((prev) => prev.filter((item) => item.id !== id));
	};

	const resetForm = () => {
		setRoleJobSeeker(false);
		setRoleEmployer(false);
		setSelected([]);
		setTitle("");
		setBody("");
		setBodyText("");
		setEditorKey((key) => key + 1);
		setRecipientSearch("");
	};

	const confirmMessage =
		roles.length > 0
			? `선택한 역할 전체${selected.length > 0 ? ` + ${selected.length}명` : ""}에게 발송할까요?`
			: `${selected.length}명에게 발송할까요?`;

	const handleSend = () => {
		sendMutation.mutate(
			{
				body,
				recipientUserIds: selected.map((item) => item.id),
				roles,
				title: title.trim(),
			},
			{
				onError: (error) =>
					toast.error(
						error.message || "쪽지를 발송하지 못했어요. 다시 시도해 주세요."
					),
				onSuccess: async (result) => {
					setIsConfirmOpen(false);
					resetForm();
					// listSent.key()는 order 없는 부분 키 — 최신순·오래된순 두 캐시 모두 무효화한다.
					await queryClient.invalidateQueries({
						queryKey: orpc.bambi.directMessages.listSent.key(),
					});
					toast.success(`쪽지 ${result.recipientCount}명에게 발송 완료`);
				},
			}
		);
	};

	const sentItems = sentQuery.data?.pages.flatMap((page) => page.items) ?? [];

	return (
		<div className="mx-auto flex w-full flex-col gap-4 px-5 py-6 md:px-6">
			<div className="flex flex-col gap-1">
				<h1 className="m-0 font-extrabold text-2xl">쪽지</h1>
				<p className="m-0 text-muted-foreground text-sm">
					구직자·구인자 역할 단위로, 또는 특정 사용자에게 쪽지를 보냅니다.
					수신자는 쪽지함에서 확인하고 도착 시 알림을 받습니다. 답장은 없습니다.
				</p>
			</div>

			<div className="grid gap-4 md:grid-cols-2">
				<Card>
					<CardHeader>
						<CardTitle className="text-base">새 쪽지 작성</CardTitle>
					</CardHeader>
					<CardContent className="flex flex-col gap-4">
						<div className="flex flex-col gap-2">
							<span className="font-medium text-sm">대상 역할</span>
							<div className="flex items-center gap-2">
								<Checkbox
									checked={roleJobSeeker}
									id="role-job-seeker"
									onCheckedChange={(checked) =>
										setRoleJobSeeker(checked === true)
									}
								/>
								<Label htmlFor="role-job-seeker">
									구직자(법률자문 포함) 전체
								</Label>
							</div>
							<div className="flex items-center gap-2">
								<Checkbox
									checked={roleEmployer}
									id="role-employer"
									onCheckedChange={(checked) =>
										setRoleEmployer(checked === true)
									}
								/>
								<Label htmlFor="role-employer">구인자 전체</Label>
							</div>
						</div>

						<div className="flex flex-col gap-2">
							<Label htmlFor="recipient-search">특정 사용자</Label>
							<Input
								autoComplete="off"
								id="recipient-search"
								onChange={(event) => setRecipientSearch(event.target.value)}
								placeholder="이름·로그인 아이디로 검색"
								value={recipientSearch}
							/>
							{candidates.length > 0 ? (
								// 8행 높이(max-h-72)까지만 보이고 그 이상은 스크롤 — 매칭 전량 노출.
								<ul className="flex max-h-72 flex-col gap-1 overflow-y-auto rounded-lg border border-border bg-card p-1">
									{candidates.map((candidate) => (
										<li key={candidate.userId}>
											<button
												className="flex w-full items-center justify-between gap-2 rounded-md px-2.5 py-1.5 text-left text-sm hover:bg-muted"
												onClick={() =>
													addRecipient({
														id: candidate.userId,
														name: candidate.name,
													})
												}
												type="button"
											>
												<span className="truncate font-medium text-foreground">
													{candidate.name}
												</span>
												<span className="shrink-0 text-muted-foreground text-xs">
													{userRoleLabel(candidate.role)}
													{candidate.loginId ? ` · ${candidate.loginId}` : ""}
												</span>
											</button>
										</li>
									))}
								</ul>
							) : null}
							{selected.length > 0 ? (
								<div className="flex flex-wrap gap-1.5">
									{selected.map((item) => (
										<Badge
											className="cursor-pointer"
											key={item.id}
											onClick={() => removeRecipient(item.id)}
											variant="secondary"
										>
											{item.name} ✕
										</Badge>
									))}
								</div>
							) : null}
						</div>

						<div className="flex flex-col gap-2">
							<Label htmlFor="message-title">제목</Label>
							<Input
								id="message-title"
								maxLength={TITLE_MAX}
								onChange={(event) => setTitle(event.target.value)}
								placeholder="쪽지 제목"
								value={title}
							/>
						</div>

						<div className="flex flex-col gap-2">
							<span className="font-medium text-sm">내용</span>
							{/* 수다방 본문 에디터 재사용 — 굵게·기울임·목록·링크 서식과 이미지 URL 삽입.
							    이미지 파일 업로드는 커뮤니티 이미지 업로드 보류 정책과 동일하게 끈다. */}
							<CommunityPostEditor
								allowUpload={false}
								key={editorKey}
								onChange={({ json, text }) => {
									setBody(json);
									setBodyText(text);
								}}
								value=""
							/>
							<span
								className={cn(
									"text-xs",
									bodyLength > BODY_MAX
										? "text-destructive"
										: "text-muted-foreground"
								)}
							>
								{bodyLength} / {BODY_MAX}
							</span>
						</div>

						<Button
							className="self-end"
							disabled={!canSend || sendMutation.isPending}
							onClick={() => setIsConfirmOpen(true)}
							type="button"
						>
							발송
						</Button>
					</CardContent>
				</Card>

				<Card>
					<CardHeader className="flex flex-row items-center justify-between gap-2">
						<CardTitle className="text-base">발송 이력</CardTitle>
						<ToggleGroup
							aria-label="발송 이력 정렬"
							onValueChange={(value) => {
								const next = value.at(-1);
								if (next === "newest" || next === "oldest") {
									setSentOrder(next);
								}
							}}
							value={[sentOrder]}
						>
							<ToggleGroupItem value="newest">최신순</ToggleGroupItem>
							<ToggleGroupItem value="oldest">오래된순</ToggleGroupItem>
						</ToggleGroup>
					</CardHeader>
					<CardContent className="flex flex-col gap-3">
						{sentQuery.isPending ? (
							<div className="flex flex-col gap-2">
								<Skeleton className="h-14 w-full" />
								<Skeleton className="h-14 w-full" />
								<Skeleton className="h-14 w-full" />
							</div>
						) : null}

						{sentQuery.isError ? (
							<EmptyState
								description="목록을 불러오지 못했어요. 잠시 후 다시 시도해 주세요."
								title="불러오기 실패"
							/>
						) : null}

						{sentQuery.isSuccess && sentItems.length === 0 ? (
							<EmptyState
								description="아직 보낸 쪽지가 없어요."
								title="발송 이력이 없어요"
							/>
						) : null}

						{sentItems.map((item) => (
							<button
								className="flex flex-col gap-1 rounded-lg border border-border bg-card px-4 py-3 text-left transition-colors hover:bg-muted"
								key={item.messageId}
								onClick={() => setDetailMessageId(item.messageId)}
								type="button"
							>
								<span className="truncate font-semibold text-foreground text-sm">
									{item.title}
								</span>
								<div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-muted-foreground text-xs">
									<span>{describeTargets(item.targetRoles)}</span>
									<span>
										읽음 {item.readCount}/{item.recipientCount}
									</span>
									<span>{formatDateTime(item.createdAt)}</span>
									{item.senderName ? <span>{item.senderName}</span> : null}
								</div>
							</button>
						))}

						{sentQuery.hasNextPage ? (
							<Button
								className="self-center"
								disabled={sentQuery.isFetchingNextPage}
								onClick={() => {
									sentQuery.fetchNextPage().catch(() => undefined);
								}}
								type="button"
								variant="outline"
							>
								{sentQuery.isFetchingNextPage ? "불러오는 중…" : "더 보기"}
							</Button>
						) : null}
					</CardContent>
				</Card>
			</div>

			<AlertDialog onOpenChange={setIsConfirmOpen} open={isConfirmOpen}>
				<AlertDialogContent>
					<AlertDialogHeader>
						<AlertDialogTitle>쪽지 발송</AlertDialogTitle>
						<AlertDialogDescription>{confirmMessage}</AlertDialogDescription>
					</AlertDialogHeader>
					<AlertDialogFooter>
						<AlertDialogCancel disabled={sendMutation.isPending}>
							취소
						</AlertDialogCancel>
						<AlertDialogAction
							disabled={sendMutation.isPending}
							onClick={handleSend}
						>
							발송
						</AlertDialogAction>
					</AlertDialogFooter>
				</AlertDialogContent>
			</AlertDialog>

			<Dialog
				onOpenChange={(open) => {
					if (!open) {
						setDetailMessageId(null);
					}
				}}
				open={detailMessageId !== null}
			>
				<DialogContent className="sm:w-full sm:max-w-xl">
					<SentDetailBody detail={detailQuery.data} />
				</DialogContent>
			</Dialog>
		</div>
	);
}
