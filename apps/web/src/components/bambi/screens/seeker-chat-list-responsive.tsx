"use client";

import { cn } from "@bambi-app/ui/lib/utils";
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
import { RowActions } from "../row-actions";

interface SeekerChatListResponsiveProps {
	onFallback: () => React.ReactNode;
	onOpen: (roomId: string) => void;
}

const formatDateTime = (value: Date | string): string =>
	new Intl.DateTimeFormat("ko-KR", {
		dateStyle: "medium",
		timeStyle: "short",
	}).format(new Date(value));

const getRoomItemClassName = (unreadCount: number): string =>
	cn(
		"relative flex min-w-0 items-center gap-3 rounded-lg border bg-card p-4 transition-colors hover:border-coral-200",
		unreadCount > 0 ? "border-coral-300 ring-1 ring-coral-200" : "border-border"
	);

// 방 항목의 삭제·신고·차단 케밥 메뉴. 목록 항목은 방 열기 클릭 영역이 카드 전체를
// 덮으므로, 이 메뉴 트리거는 그 열기 버튼과 형제(자식 아님)로 두어 button-in-button을
// 피하고 상위에 겹쳐(z-10) 자기 클릭만 받는다. 이 목록은 구직자 화면이라 상대(차단
// 대상)는 항상 구인자(employerUserId)다.
function ChatRoomActions({
	room,
}: {
	room: { employerUserId: string; id: string };
}) {
	const queryClient = useQueryClient();
	const [isReportOpen, setIsReportOpen] = useState(false);

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

	return (
		<>
			<RowActions
				actions={[
					{
						key: "report",
						label: "신고",
						onSelect: () => setIsReportOpen(true),
					},
					{
						key: "block",
						label: "차단",
						onSelect: () =>
							blockMutation.mutate({
								blockedUserId: room.employerUserId,
								chatRoomId: room.id,
							}),
					},
					{
						key: "delete",
						label: "삭제",
						onSelect: () => deleteMutation.mutate({ chatRoomId: room.id }),
						variant: "destructive",
					},
				]}
				ariaLabel="채팅방 관리"
			/>
			<ReportDialog
				onOpenChange={setIsReportOpen}
				open={isReportOpen}
				targetId={room.id}
				targetType="chat_room"
			/>
		</>
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
					<HorizontalAdBannerRail items={adBanners.leftBanner} />
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
					<AdBannerRail items={adBanners.rightBanner} />
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
						<div
							className={getRoomItemClassName(room.unreadCount)}
							key={room.id}
						>
							<button
								aria-label={`${room.jobTitle ?? "공고 채팅"} 채팅방 열기`}
								className="absolute inset-0 cursor-pointer rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-coral-200"
								onClick={() => onOpen(room.id)}
								type="button"
							/>
							<div className="pointer-events-none flex min-w-0 flex-1 items-center gap-3">
								<Avatar
									className="shrink-0"
									name={room.jobTitle ?? "공고 채팅"}
									size="lg"
									square
								/>
								<div className="min-w-0 flex-1">
									<div className="flex min-w-0 flex-wrap items-center gap-2">
										<h2 className="m-0 truncate font-extrabold text-base">
											{room.jobTitle ?? "공고 채팅"}
										</h2>
										<Badge tone={room.isBlocked ? "danger" : "success"}>
											{room.isBlocked ? "차단됨" : "대화 가능"}
										</Badge>
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
									<p className="m-0 text-muted-foreground text-xs">
										최근 업데이트
									</p>
									<p className="mt-1 mb-0 font-bold text-sm">
										{formatDateTime(room.updatedAt)}
									</p>
								</div>
							</div>
							<div className="relative z-10 shrink-0">
								<ChatRoomActions room={room} />
							</div>
						</div>
					))}
				</div>
			)}
		</SeekerChatListRails>
	);
}
