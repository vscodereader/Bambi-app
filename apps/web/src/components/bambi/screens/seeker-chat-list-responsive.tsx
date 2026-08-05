"use client";

import type { AppRouter } from "@bambi-app/api/routers/index";
import { cn } from "@bambi-app/ui/lib/utils";
import type { InferRouterOutputs } from "@orpc/server";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { type ReactNode, useEffect, useState } from "react";
import { toast } from "sonner";
import { useAdBannerJobs } from "@/lib/bambi/api-jobs";
import { SEEKER_CONTENT_WIDTH } from "@/lib/bambi/layout";
import { connectBambiChatSocket } from "@/lib/bambi-chat-realtime";
import { orpc } from "@/utils/orpc";
import { AdBannerRail, HorizontalAdBannerRail } from "../ad-banner";
import { Avatar, Badge, Card } from "../ds";
import { Message, ShieldIcon } from "../icons";
import { ReportDialog } from "../report-dialog";
import { type RowAction, RowActions } from "../row-actions";

type ChatListRoom =
	InferRouterOutputs<AppRouter>["bambi"]["chats"]["listMine"][number];

interface SeekerChatListResponsiveProps {
	onFallback: () => React.ReactNode;
	onOpen: (roomId: string) => void;
}

const formatDateTime = (value: Date | string): string =>
	new Intl.DateTimeFormat("ko-KR", {
		dateStyle: "medium",
		timeStyle: "short",
	}).format(new Date(value));

const getRoomItemClassName = (
	unreadCount: number,
	isBlocked: boolean
): string =>
	cn(
		"relative flex min-w-0 items-center gap-3 rounded-lg border border-border bg-card p-4 transition-colors",
		// 차단된 방은 열 수 없으니 hover 강조·미확인 링 같은 "눌러보세요" 신호를 지운다.
		isBlocked
			? null
			: cn(
					"hover:border-coral-200",
					unreadCount > 0 && "border-coral-300 ring-1 ring-coral-200"
				)
	);

// 방 상태 배지 하나로 정리한다. 차단이 가장 강한 상태고, 그다음이 "상대방 나감"
// (지난 대화는 읽히지만 발신이 막힌 방)이다. 들어가 봐야 입력창이 잠긴 걸 알게 되면
// 목록이 거짓말을 한 셈이라 여기서 먼저 알린다.
function ChatRoomStateBadge({
	hasCounterpartLeft,
	isBlocked,
}: {
	hasCounterpartLeft: boolean;
	isBlocked: boolean;
}) {
	if (isBlocked) {
		return <Badge tone="danger">차단됨</Badge>;
	}

	if (hasCounterpartLeft) {
		return <Badge tone="neutral">상대방 나감</Badge>;
	}

	return <Badge tone="success">대화 가능</Badge>;
}

// 방 항목의 삭제·신고·차단 케밥 메뉴. 목록 항목은 방 열기 클릭 영역이 카드 전체를
// 덮으므로, 이 메뉴 트리거는 그 열기 버튼과 형제(자식 아님)로 두어 button-in-button을
// 피하고 상위에 겹쳐(z-10) 자기 클릭만 받는다. 이 라우트에는 역할 게이트가 없어
// 구인자도 들어오므로 차단 대상은 서버가 뷰어 기준으로 계산해 준 counterpartUserId를
// 쓴다(employerUserId 고정이면 구인자가 자기 자신을 차단한다).
//
// 신고는 구직자 전용이라 뷰어가 그 방의 구직자일 때만 노출한다(서버 createReport도
// 같은 기준으로 막는다). 뷰어 판별은 "상대가 구인자면 내가 구직자"로 한다.
//
// 이미 차단된 방에서는 삭제만 남긴다 — 다시 차단하는 항목은 무의미하고, 대화가 막힌
// 방에서 남은 실질 선택지는 목록에서 치우는 것뿐이다.
function ChatRoomActions({
	isBlocked,
	room,
}: {
	isBlocked: boolean;
	room: { counterpartUserId: string; employerUserId: string; id: string };
}) {
	const isJobSeekerViewer = room.counterpartUserId === room.employerUserId;
	const queryClient = useQueryClient();
	const [isReportOpen, setIsReportOpen] = useState(false);

	// 차단 직후 해당 행이 곧바로 블러 처리되려면 방 목록을 다시 받아야 한다 —
	// isBlocked는 서버가 운영자 차단과 사용자 간 차단을 합쳐 내려주는 값이다.
	const invalidateList = () =>
		queryClient.invalidateQueries({
			queryKey: orpc.bambi.chats.listMine.queryKey(),
		});

	const deleteMutation = useMutation(
		orpc.bambi.chats.deleteChatRoom.mutationOptions({
			onError: (error) => {
				toast.error(error.message || "채팅방을 삭제하지 못했어요.");
			},
			onSuccess: async () => {
				toast.success("채팅방을 삭제했어요.");
				await invalidateList();
			},
		})
	);
	const blockMutation = useMutation(
		orpc.bambi.blocks.blockUser.mutationOptions({
			onError: (error) => {
				toast.error(error.message || "상대를 차단하지 못했어요.");
			},
			onSuccess: async () => {
				toast.success("상대를 차단했어요.");
				await invalidateList();
			},
		})
	);

	const deleteAction: RowAction = {
		key: "delete",
		label: "삭제",
		onSelect: () => deleteMutation.mutate({ chatRoomId: room.id }),
		variant: "destructive",
	};

	return (
		<>
			<RowActions
				actions={
					isBlocked
						? [deleteAction]
						: [
								...(isJobSeekerViewer
									? [
											{
												key: "report",
												label: "신고",
												onSelect: () => setIsReportOpen(true),
											} satisfies RowAction,
										]
									: []),
								{
									key: "block",
									label: "차단",
									onSelect: () =>
										blockMutation.mutate({
											blockedUserId: room.counterpartUserId,
											chatRoomId: room.id,
										}),
								},
								deleteAction,
							]
				}
				ariaLabel="채팅방 관리"
			/>
			{isJobSeekerViewer ? (
				<ReportDialog
					// 신고가 접수된 방은 검토가 끝날 때까지 서버가 목록에서 빼 준다
					// ("해당 채팅은 잠시 숨겨둘게요" 약속). 창을 닫을 때 목록을 다시
					// 받아 그 자리에서 사라지게 한다.
					onOpenChange={(next) => {
						setIsReportOpen(next);
						if (!next) {
							invalidateList().catch(() => undefined);
						}
					}}
					open={isReportOpen}
					targetId={room.id}
					targetType="chat_room"
				/>
			) : null}
		</>
	);
}

// 목록의 방 한 칸. 데스크톱·모바일이 같은 마크업을 쓰고(폭에 따라 "최근 업데이트"
// 칼럼만 md:block으로 붙는다) 차단 처리도 그래서 한 곳에만 있으면 된다.
function ChatRoomItem({
	isBlocked,
	onOpen,
	room,
}: {
	isBlocked: boolean;
	onOpen: (roomId: string) => void;
	room: ChatListRoom;
}) {
	const jobTitle = room.jobTitle ?? "공고 채팅";

	return (
		<div className={getRoomItemClassName(room.unreadCount, isBlocked)}>
			{/* 차단된 방은 열기 버튼 자체를 렌더하지 않는다. 눌러 들어가 봐야 서버가 막아
			"채팅방을 불러올 수 없어요" 오류만 보게 되므로, 포인터 커서와 키보드 포커스도
			함께 사라지는 편이 정직하다. */}
			{isBlocked ? null : (
				<button
					aria-label={`${jobTitle} 채팅방 열기`}
					className="absolute inset-0 cursor-pointer rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-coral-200"
					onClick={() => onOpen(room.id)}
					type="button"
				/>
			)}
			<div
				aria-hidden={isBlocked || undefined}
				className={cn(
					"pointer-events-none flex min-w-0 flex-1 items-center gap-3",
					// 차단된 방의 상대·마지막 메시지는 가린다. 스크린리더에는 아래 오버레이
					// 문구만 읽히도록 aria-hidden으로 함께 덮는다.
					isBlocked && "select-none blur-sm"
				)}
			>
				<Avatar className="shrink-0" name={jobTitle} size="lg" square />
				<div className="min-w-0 flex-1">
					<div className="flex min-w-0 flex-wrap items-center gap-2">
						<h2 className="m-0 truncate font-extrabold text-base">
							{jobTitle}
						</h2>
						<ChatRoomStateBadge
							hasCounterpartLeft={room.hasCounterpartLeft}
							isBlocked={isBlocked}
						/>
						{room.unreadCount > 0 ? (
							<Badge tone="primary">{room.unreadCount}개 미확인</Badge>
						) : null}
					</div>
					{room.counterpartName ? (
						<p className="mt-1 mb-0 truncate font-bold text-foreground text-sm">
							{room.counterpartName}
						</p>
					) : null}
					<p className="mt-1 mb-0 truncate text-muted-foreground text-sm">
						{room.lastMessageBody ?? "아직 주고받은 메시지가 없어요"}
					</p>
				</div>
				<div className="hidden text-right md:block">
					<p className="m-0 text-muted-foreground text-xs">최근 업데이트</p>
					<p className="mt-1 mb-0 font-bold text-sm">
						{formatDateTime(room.updatedAt)}
					</p>
				</div>
			</div>
			{/* 블러 위에 선명하게 얹는 안내. 블러된 내용 뒤에 두어 별도 z-index 없이 위에
			그려지고, pointer-events-none이라 케밥 메뉴 클릭을 가로채지 않는다. */}
			{isBlocked ? (
				<p className="pointer-events-none absolute inset-0 m-0 flex flex-col items-center justify-center gap-1 px-4 text-center font-extrabold text-foreground text-sm">
					차단된 채팅입니다.
				</p>
			) : null}
			<div className="relative z-10 shrink-0">
				<ChatRoomActions isBlocked={isBlocked} room={room} />
			</div>
		</div>
	);
}

// 채팅 목록 3컬럼 셸 — 초광폭(≥1720px)에서만 좌(가로형 7:3)·우(세로형 4:9) 사이드 광고
// rail을 노출하고, 중앙은 앱 공통 고정폭이라 헤더·푸터와 같은 중앙선에 선다.
//
// 좌우 aside는 판매된 배너가 없어도 폭을 그대로 차지한다. 한쪽만 렌더하면 justify-center가
// 남은 두 칸 기준으로 정렬해 콘텐츠가 (rail 259px + gap)/2 = 약 139px 밀리고, 같은 고정폭인
// 헤더·푸터와 눈에 띄게 어긋난다. 그래서 바깥 자리는 항상 대칭으로 남기고, rail은 빈 슬롯을
// "광고 모집중" 자리표시로 채워 조건 없이 렌더한다 — 수다방·마켓플레이스·공고 상세도 같은 형태다.
//
// 세로 여백은 로딩·오류·목록 상태마다 달라(모바일 하단 탭 자리 pb-24 등) className으로 받아
// 중앙 칸에 얹는다. 가로 여백·고정폭은 셸만 갖게 해 분기별 컨테이너와 이중 적용되지 않게 한다.
function SeekerChatListRails({
	children,
	className,
}: {
	children: ReactNode;
	className?: string;
}) {
	const adBanners = useAdBannerJobs();

	return (
		<div className="mx-auto flex w-full justify-center gap-5">
			<aside className="hidden w-[259px] shrink-0 min-[1720px]:block">
				<div className="sticky top-20">
					<HorizontalAdBannerRail
						isLoading={adBanners.isLoading}
						items={adBanners.leftBanner}
						promotionSurface="chats_left"
					/>
				</div>
			</aside>
			<div
				className={cn(
					"flex w-full min-w-0 flex-col px-5 md:px-6",
					SEEKER_CONTENT_WIDTH,
					className
				)}
			>
				{children}
			</div>
			<aside className="hidden w-[259px] shrink-0 min-[1720px]:block">
				<div className="sticky top-20">
					<AdBannerRail
						isLoading={adBanners.isLoading}
						items={adBanners.rightBanner}
						promotionSurface="chats_right"
					/>
				</div>
			</aside>
		</div>
	);
}

export function SeekerChatListResponsive({
	onFallback,
	onOpen,
}: SeekerChatListResponsiveProps) {
	const queryClient = useQueryClient();
	const chatsQuery = useQuery(orpc.bambi.chats.listMine.queryOptions());
	const rooms = chatsQuery.data ?? [];

	useEffect(() => {
		const socket = connectBambiChatSocket();
		// 유저 채널(user:${userId})로 오는 목록 갱신 신호를 받아, 특정 방에
		// 입장하지 않아도 새 방 생성·새 메시지를 실시간으로 반영한다.
		const refreshList = () => {
			queryClient
				.invalidateQueries({
					queryKey: orpc.bambi.chats.listMine.queryKey(),
				})
				.catch(() => undefined);
		};

		socket.on("chat:list:updated", refreshList);

		return () => {
			socket.off("chat:list:updated", refreshList);
		};
	}, [queryClient]);

	if (chatsQuery.isError) {
		return (
			<SeekerChatListRails className="py-5 pb-24">
				<div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-amber-800 text-sm">
					실제 채팅 목록을 불러오지 못해 샘플 대화를 표시하고 있어요.
					<button
						className="ml-2 cursor-pointer border-none bg-transparent p-0 font-extrabold text-amber-900 underline"
						onClick={() => chatsQuery.refetch()}
						type="button"
					>
						다시 연결
					</button>
				</div>
				{onFallback()}
			</SeekerChatListRails>
		);
	}

	if (chatsQuery.isLoading) {
		return (
			<SeekerChatListRails className="py-10 text-center font-bold text-muted-foreground">
				채팅 목록을 불러오고 있어요.
			</SeekerChatListRails>
		);
	}

	return (
		<SeekerChatListRails className="py-5 pb-24 md:py-7 lg:pb-8">
			<div className="mb-5">
				<Badge tone="success">
					<span className="inline-flex size-3.5">
						<ShieldIcon />
					</span>
					플랫폼 채팅
				</Badge>
				<h1 className="mt-3 mb-2 font-extrabold text-2xl">내 채팅</h1>
				<p className="m-0 text-muted-foreground text-sm leading-relaxed">
					공고 기반으로 생성된 대화방과 면접 일정을 확인해요.
				</p>
			</div>
			{rooms.length === 0 ? (
				<Card className="rounded-lg text-center" pad="lg" tone="outline">
					<span className="mx-auto inline-flex size-10 items-center justify-center rounded-lg bg-coral-50 text-coral-700">
						<span className="inline-flex size-5">
							<Message />
						</span>
					</span>
					<h2 className="mt-3 mb-2 font-extrabold text-lg">
						진행 중인 채팅이 없어요
					</h2>
					<p className="m-0 text-muted-foreground text-sm">
						관심 있는 공고에서 채팅을 시작하면 여기에 표시됩니다.
					</p>
				</Card>
			) : (
				<div className="grid gap-3">
					{rooms.map((room) => (
						<ChatRoomItem
							isBlocked={room.isBlocked}
							key={room.id}
							onOpen={onOpen}
							room={room}
						/>
					))}
				</div>
			)}
		</SeekerChatListRails>
	);
}
