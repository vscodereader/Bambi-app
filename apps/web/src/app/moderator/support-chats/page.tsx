"use client";

// 운영자 실시간 문의 채팅 콘솔 — 공용 큐(모든 운영자가 같은 목록)를 5초 폴링으로 훑고,
// 방을 고르면 대화·문의자 정보를 함께 본다. 답변을 보내면 상대에게 알림이 나가고, 도배
// 방은 잠근다. 말풍선은 문의자 좌측·운영자 우측(위젯과 반대 방향)이다.

import type { AppRouterClient } from "@bambi-app/api/routers/index";
import { Badge } from "@bambi-app/ui/components/badge";
import { Button } from "@bambi-app/ui/components/button";
import {
	Card,
	CardContent,
	CardHeader,
	CardTitle,
} from "@bambi-app/ui/components/card";
import { Input } from "@bambi-app/ui/components/input";
import { Separator } from "@bambi-app/ui/components/separator";
import { Skeleton } from "@bambi-app/ui/components/skeleton";
import {
	ToggleGroup,
	ToggleGroupItem,
} from "@bambi-app/ui/components/toggle-group";
import { cn } from "@bambi-app/ui/lib/utils";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronLeftIcon, LockIcon, SendIcon } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { EmptyState } from "@/components/bambi/empty-state";
import { userRoleLabel } from "@/lib/bambi/moderation-labels";
import { formatDate, formatDateTime } from "@/lib/bambi-format";
import { orpc } from "@/utils/orpc";

const MESSAGE_MAX = 1000;

// 성별 enum 원값 노출 금지 — 로컬 라벨 맵 경유(알 수 없는 값도 안전한 폴백).
const GENDER_LABELS: Record<string, string> = {
	female: "여성",
	male: "남성",
};
const genderLabel = (gender: null | string): string =>
	gender ? (GENDER_LABELS[gender] ?? "미상") : "미상";

export default function ModeratorSupportChatsPage() {
	const [page, setPage] = useState(1);
	const [status, setStatus] = useState<"closed" | "open">("open");
	const [selectedRoomId, setSelectedRoomId] = useState<null | string>(null);

	// 상태 탭 전환 시 페이지·선택을 초기화한다 — 탭마다 목록이 완전히 다르다.
	const switchStatus = (next: "closed" | "open") => {
		setStatus(next);
		setPage(1);
		setSelectedRoomId(null);
	};

	const listQuery = useQuery({
		...orpc.bambi.supportChat.admin.listRooms.queryOptions({
			input: { page, status },
		}),
		refetchInterval: 5000,
	});

	const list = listQuery.data;
	const totalCount = list?.totalCount ?? 0;
	const pageSize = list?.pageSize ?? 30;
	const hasNext = page * pageSize < totalCount;

	return (
		<div className="mx-auto flex h-[calc(100dvh-8rem)] w-full flex-col gap-4 px-5 py-6 md:px-6">
			<h1 className="m-0 font-extrabold text-2xl">문의 채팅</h1>
			<div className="flex min-h-0 flex-1 gap-4">
				{/* 목록 — 방 선택 시 모바일에선 숨기고 데스크톱에선 유지한다. */}
				<div
					className={cn(
						"flex min-h-0 w-full flex-col gap-2 md:w-80 md:shrink-0",
						selectedRoomId && "hidden md:flex"
					)}
				>
					<ToggleGroup
						aria-label="대화 상태"
						className="w-full"
						onValueChange={(value) => {
							const next = value.at(-1);
							if (next) {
								switchStatus(next as "closed" | "open");
							}
						}}
						value={[status]}
					>
						<ToggleGroupItem className="flex-1" value="open">
							진행 중
						</ToggleGroupItem>
						<ToggleGroupItem className="flex-1" value="closed">
							종료
						</ToggleGroupItem>
					</ToggleGroup>
					<div className="min-h-0 flex-1 overflow-y-auto">
						{listQuery.isPending ? (
							<div className="flex flex-col gap-2">
								<Skeleton className="h-16 w-full" />
								<Skeleton className="h-16 w-full" />
								<Skeleton className="h-16 w-full" />
							</div>
						) : null}
						{!listQuery.isPending && (list?.items.length ?? 0) === 0 ? (
							<EmptyState
								description="새 문의 채팅이 들어오면 이곳에 바로 나타나요."
								title="접수된 문의가 없어요"
							/>
						) : null}
						<div className="flex flex-col gap-2">
							{list?.items.map((room) => (
								<button
									className={cn(
										"flex w-full flex-col gap-1 rounded-xl border p-3 text-left transition-colors hover:bg-muted",
										selectedRoomId === room.id && "border-primary bg-muted"
									)}
									key={room.id}
									onClick={() => setSelectedRoomId(room.id)}
									type="button"
								>
									<div className="flex items-center gap-2">
										<Badge variant={room.isMember ? "secondary" : "outline"}>
											{room.isMember ? "회원" : "비회원"}
										</Badge>
										<span className="min-w-0 flex-1 truncate font-semibold text-sm">
											{room.displayName}
										</span>
										{room.isBlocked ? (
											<LockIcon
												aria-label="잠긴 방"
												className="size-4 shrink-0 text-muted-foreground"
											/>
										) : null}
										{room.status === "closed" ? (
											<Badge variant="outline">종료</Badge>
										) : null}
										{room.unreadCount > 0 ? (
											<Badge>{room.unreadCount}</Badge>
										) : null}
									</div>
									<p className="m-0 truncate text-muted-foreground text-xs">
										{room.lastMessagePreview || "메시지 없음"}
									</p>
									<div className="flex items-center gap-2 text-muted-foreground text-xs">
										<span>{formatDateTime(room.lastMessageAt)}</span>
										{room.ownerRoomCount > 1 ? (
											<span>대화 {room.ownerRoomCount}개</span>
										) : null}
									</div>
								</button>
							))}
						</div>
					</div>
					{totalCount > pageSize ? (
						<div className="flex items-center justify-between gap-2">
							<Button
								disabled={page <= 1}
								onClick={() => setPage((previous) => Math.max(1, previous - 1))}
								size="sm"
								variant="outline"
							>
								이전
							</Button>
							<span className="text-muted-foreground text-xs">
								{page} / {Math.max(1, Math.ceil(totalCount / pageSize))}
							</span>
							<Button
								disabled={!hasNext}
								onClick={() => setPage((previous) => previous + 1)}
								size="sm"
								variant="outline"
							>
								다음
							</Button>
						</div>
					) : null}
				</div>

				{/* 상세 — 방 미선택 시 데스크톱에선 안내, 모바일에선 목록만 보인다. */}
				{selectedRoomId ? (
					<RoomDetail
						key={selectedRoomId}
						onBack={() => setSelectedRoomId(null)}
						roomId={selectedRoomId}
					/>
				) : (
					<div className="hidden min-w-0 flex-1 items-center justify-center md:flex">
						<EmptyState
							description="왼쪽 목록에서 문의 방을 선택하면 대화가 열려요."
							title="선택된 방이 없어요"
						/>
					</div>
				)}
			</div>
		</div>
	);
}

function RoomDetail({
	onBack,
	roomId,
}: {
	onBack: () => void;
	roomId: string;
}) {
	const queryClient = useQueryClient();
	const [reply, setReply] = useState("");
	const [showInfo, setShowInfo] = useState(false);
	const bottomRef = useRef<HTMLDivElement>(null);

	const roomQuery = useQuery({
		...orpc.bambi.supportChat.admin.getRoom.queryOptions({
			input: { roomId },
		}),
		refetchInterval: 5000,
	});

	const invalidate = () =>
		queryClient.invalidateQueries({
			queryKey: orpc.bambi.supportChat.admin.key(),
		});

	const markRead = useMutation(
		orpc.bambi.supportChat.admin.markRead.mutationOptions({
			onSuccess: () => invalidate(),
		})
	).mutate;

	const sendMutation = useMutation(
		orpc.bambi.supportChat.admin.sendMessage.mutationOptions({
			onError: (error) => toast.error(error.message),
			onSuccess: async () => {
				setReply("");
				await invalidate();
			},
		})
	);

	const setBlocked = useMutation(
		orpc.bambi.supportChat.admin.setBlocked.mutationOptions({
			onError: (error) => toast.error(error.message),
			onSuccess: async () => {
				toast.success("문의자 발신 잠금을 바꿨어요.");
				await invalidate();
			},
		})
	);

	const setClosed = useMutation(
		orpc.bambi.supportChat.admin.setClosed.mutationOptions({
			onError: (error) => toast.error(error.message),
			onSuccess: async () => {
				toast.success("대화 상태를 바꿨어요.");
				await invalidate();
			},
		})
	);

	const data = roomQuery.data;
	const unreadCount = data?.unreadCount ?? 0;
	const messages = data?.messages;

	// 방 선택·새 문의자 메시지(미읽음 > 0) 감지 시 읽음 처리. markRead는 워터마크만
	// 올리는 멱등 연산이라 성공→invalidate→미읽음 0으로 다시 안 돌아온다.
	useEffect(() => {
		if (unreadCount > 0) {
			markRead({ roomId });
		}
	}, [roomId, unreadCount, markRead]);

	// 메시지가 늘면 맨 아래로(길이를 읽어 재실행 트리거로 삼는다).
	const messageCount = messages?.length ?? 0;
	useEffect(() => {
		if (messageCount > 0) {
			bottomRef.current?.scrollIntoView({ block: "end" });
		}
	}, [messageCount]);

	const send = () => {
		const body = reply.trim();
		if (body.length === 0 || sendMutation.isPending) {
			return;
		}
		sendMutation.mutate({ body, roomId });
	};

	const isBlocked = data?.room.isBlocked ?? false;

	return (
		<div className="flex min-w-0 flex-1 gap-4">
			<Card className="flex min-h-0 min-w-0 flex-1 flex-col gap-0 py-0">
				<CardHeader className="flex flex-row items-center gap-2 border-b py-3">
					<Button
						className="md:hidden"
						onClick={onBack}
						size="icon"
						variant="ghost"
					>
						<ChevronLeftIcon className="size-4" />
					</Button>
					<CardTitle className="min-w-0 flex-1 truncate">문의 대화</CardTitle>
					<Button
						disabled={setClosed.isPending || !data}
						onClick={() =>
							setClosed.mutate({
								closed: data?.room.status !== "closed",
								roomId,
							})
						}
						size="sm"
						variant="outline"
					>
						{data?.room.status === "closed" ? "대화 재개" : "대화 종료"}
					</Button>
					<Button
						className="lg:hidden"
						onClick={() => setShowInfo((previous) => !previous)}
						size="sm"
						variant="outline"
					>
						문의자 정보
					</Button>
				</CardHeader>
				<CardContent className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto py-4">
					{roomQuery.isPending ? (
						<>
							<Skeleton className="h-12 w-2/3" />
							<Skeleton className="h-12 w-2/3 self-end" />
						</>
					) : null}
					{/* lg 미만에서 접이식 정보 패널(데스크톱은 우측 열로 상시 노출). */}
					{showInfo && data ? (
						<div className="lg:hidden">
							<InquirerInfo
								inquirer={data.inquirer}
								isBlocked={isBlocked}
								onToggleBlock={() =>
									setBlocked.mutate({ isBlocked: !isBlocked, roomId })
								}
								toggleDisabled={setBlocked.isPending}
							/>
							<Separator className="mt-3" />
						</div>
					) : null}
					{messages?.map((message) => {
						const mine = message.senderType === "admin";
						return (
							<div
								className={cn(
									"flex max-w-[80%] flex-col gap-1",
									mine ? "items-end self-end" : "items-start self-start"
								)}
								key={message.id}
							>
								<div
									className={cn(
										"whitespace-pre-wrap rounded-2xl px-3 py-2 text-sm",
										mine
											? "bg-primary text-primary-foreground"
											: "bg-muted text-foreground"
									)}
								>
									{message.body}
								</div>
								<span className="text-muted-foreground text-xs">
									{formatDateTime(message.createdAt)}
								</span>
							</div>
						);
					})}
					<div ref={bottomRef} />
				</CardContent>
				<div className="flex flex-col gap-2 border-t p-3">
					{/* 종료 대화도 입력은 막지 않는다 — 답변 발신이 곧 재개다. */}
					{data?.room.status === "closed" ? (
						<p className="m-0 text-center text-muted-foreground text-sm">
							종료된 대화예요. 답변을 보내면 다시 열려요.
						</p>
					) : null}
					{/* 잠금은 문의자 발신만 막는다 — 운영자 입력은 그대로 두고 안내만 위에 쌓는다. */}
					{isBlocked ? (
						<p className="m-0 text-center text-muted-foreground text-sm">
							이 문의자의 발신을 잠갔어요. 해제하면 다시 보낼 수 있어요.
						</p>
					) : null}
					<div className="flex items-center gap-2">
						<Input
							maxLength={MESSAGE_MAX}
							onChange={(event) => setReply(event.target.value)}
							onKeyDown={(event) => {
								// 한글 IME 조합 확정 Enter는 발신이 아니다.
								if (
									event.key === "Enter" &&
									!event.shiftKey &&
									!event.nativeEvent.isComposing
								) {
									event.preventDefault();
									send();
								}
							}}
							placeholder="답변을 입력하세요"
							value={reply}
						/>
						<Button
							disabled={reply.trim().length === 0 || sendMutation.isPending}
							onClick={send}
							size="icon"
						>
							<SendIcon className="size-4" />
						</Button>
					</div>
				</div>
			</Card>

			{/* 정보 패널 — 데스크톱(lg+) 우측 상시 열, 그 미만은 위 접이식으로 대체. */}
			<div className="hidden w-64 shrink-0 overflow-y-auto lg:block">
				{data ? (
					<InquirerInfo
						inquirer={data.inquirer}
						isBlocked={isBlocked}
						onToggleBlock={() =>
							setBlocked.mutate({ isBlocked: !isBlocked, roomId })
						}
						toggleDisabled={setBlocked.isPending}
					/>
				) : null}
			</div>
		</div>
	);
}

type InquirerData = Awaited<
	ReturnType<AppRouterClient["bambi"]["supportChat"]["admin"]["getRoom"]>
>["inquirer"];

function InquirerInfo({
	inquirer,
	isBlocked,
	onToggleBlock,
	toggleDisabled,
}: {
	inquirer: InquirerData;
	isBlocked: boolean;
	onToggleBlock: () => void;
	toggleDisabled: boolean;
}) {
	return (
		<Card>
			<CardHeader>
				<CardTitle className="text-base">문의자 정보</CardTitle>
			</CardHeader>
			<CardContent className="flex flex-col gap-3 text-sm">
				{inquirer.kind === "member" ? (
					<>
						<InfoRow label="이름" value={inquirer.name} />
						<InfoRow label="역할" value={userRoleLabel(inquirer.role)} />
						<InfoRow label="성별" value={genderLabel(inquirer.gender)} />
						<InfoRow label="가입일" value={formatDate(inquirer.joinedAt)} />
						{inquirer.organizationName ? (
							<InfoRow label="소속 업소" value={inquirer.organizationName} />
						) : null}
					</>
				) : (
					<>
						<InfoRow label="구분" value="비회원" />
						<InfoRow
							label="최초 문의"
							value={formatDate(inquirer.firstContactAt)}
						/>
					</>
				)}
				<Separator />
				<Button
					disabled={toggleDisabled}
					onClick={onToggleBlock}
					variant="outline"
				>
					{isBlocked ? "잠금 해제" : "문의자 발신 잠금"}
				</Button>
			</CardContent>
		</Card>
	);
}

function InfoRow({ label, value }: { label: string; value: string }) {
	return (
		<div className="flex items-start justify-between gap-2">
			<span className="shrink-0 text-muted-foreground">{label}</span>
			<span className="min-w-0 text-right font-medium">{value}</span>
		</div>
	);
}
