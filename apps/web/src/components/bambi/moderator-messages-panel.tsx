"use client";

// 밤비 — 운영자 쪽지 발송·발송 이력 패널.
// 대상은 역할 축(구직자[법률자문 포함]/구인자) + 특정 사용자 지정을 섞어 쓴다.
// 수신자 검색은 별도 API 없이 moderation.listUsers(전량) 결과를 클라이언트 필터한다.

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
import { Textarea } from "@bambi-app/ui/components/textarea";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useSearchParams } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { EmptyState } from "@/components/bambi/empty-state";
import { userRoleLabel } from "@/lib/bambi/moderation-labels";
import { formatDateTime } from "@/lib/bambi-format";
import { orpc } from "@/utils/orpc";

const TITLE_MAX = 100;
const BODY_MAX = 2000;
const CANDIDATE_LIMIT = 8;
const USERS_QUERY_INPUT = { limit: 1000 } as const;

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

export function ModeratorMessagesPanel() {
	const queryClient = useQueryClient();
	const searchParams = useSearchParams();
	const presetUserId = searchParams.get("to");

	const [roleJobSeeker, setRoleJobSeeker] = useState(false);
	const [roleEmployer, setRoleEmployer] = useState(false);
	const [recipientSearch, setRecipientSearch] = useState("");
	const [selected, setSelected] = useState<SelectedRecipient[]>([]);
	const [title, setTitle] = useState("");
	const [body, setBody] = useState("");
	const [isConfirmOpen, setIsConfirmOpen] = useState(false);
	const [detailMessageId, setDetailMessageId] = useState<null | string>(null);

	const usersQuery = useQuery(
		orpc.bambi.moderation.listUsers.queryOptions({ input: USERS_QUERY_INPUT })
	);
	const sentQuery = useQuery(
		orpc.bambi.directMessages.listSent.queryOptions({ input: {} })
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
		const target = users.find((candidate) => candidate.userId === presetUserId);
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
		return users
			.filter(
				(candidate) =>
					candidate.deletedAt === null &&
					!selectedIds.has(candidate.userId) &&
					[candidate.name, candidate.loginId ?? ""].some((field) =>
						field.toLowerCase().includes(keyword)
					)
			)
			.slice(0, CANDIDATE_LIMIT);
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
	const canSend =
		hasTarget && title.trim().length > 0 && body.trim().length > 0;

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
		setRecipientSearch("");
	};

	const confirmMessage =
		roles.length > 0
			? `선택한 역할 전체${selected.length > 0 ? ` + ${selected.length}명` : ""}에게 발송할까요?`
			: `${selected.length}명에게 발송할까요?`;

	const handleSend = () => {
		sendMutation.mutate(
			{
				body: body.trim(),
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
					await queryClient.invalidateQueries({
						queryKey: orpc.bambi.directMessages.listSent.key(),
					});
					toast.success(`쪽지 ${result.recipientCount}명에게 발송 완료`);
				},
			}
		);
	};

	const sentItems = sentQuery.data?.items ?? [];

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
								<ul className="flex flex-col gap-1 rounded-lg border border-border bg-card p-1">
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
							<Label htmlFor="message-body">내용</Label>
							<Textarea
								id="message-body"
								maxLength={BODY_MAX}
								onChange={(event) => setBody(event.target.value)}
								placeholder="쪽지 내용을 입력하세요."
								rows={6}
								value={body}
							/>
							<span className="text-muted-foreground text-xs">
								{body.length} / {BODY_MAX}
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
					<CardHeader>
						<CardTitle className="text-base">발송 이력</CardTitle>
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
				<DialogContent className="w-[560px]">
					{detailQuery.data ? (
						<>
							<DialogTitle>{detailQuery.data.message.title}</DialogTitle>
							<DialogDescription>
								{describeTargets(detailQuery.data.message.targetRoles)} ·{" "}
								{formatDateTime(detailQuery.data.message.createdAt)}
							</DialogDescription>
							<p className="m-0 whitespace-pre-wrap text-foreground text-sm leading-relaxed">
								{detailQuery.data.message.body}
							</p>
							<div className="flex flex-col gap-2">
								<span className="font-semibold text-foreground text-sm">
									수신자 {detailQuery.data.recipients.length}명
								</span>
								<ul className="flex max-h-64 flex-col gap-1 overflow-y-auto">
									{detailQuery.data.recipients.map((recipient) => (
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
							</div>
						</>
					) : (
						<div className="flex flex-col gap-2">
							<Skeleton className="h-6 w-40" />
							<Skeleton className="h-20 w-full" />
						</div>
					)}
				</DialogContent>
			</Dialog>
		</div>
	);
}
