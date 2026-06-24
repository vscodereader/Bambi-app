"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo } from "react";
import {
	connectBambiChatSocket,
	joinBambiChatRoom,
	leaveBambiChatRoom,
} from "@/lib/bambi-chat-realtime";
import { orpc } from "@/utils/orpc";
import { Avatar, Badge, Card } from "../ds";
import { Message, ShieldIcon } from "../icons";

interface SeekerChatListResponsiveProps {
	onFallback: () => React.ReactNode;
	onOpen: (roomId: string) => void;
}

const formatDateTime = (value: Date | string): string =>
	new Intl.DateTimeFormat("ko-KR", {
		dateStyle: "medium",
		timeStyle: "short",
	}).format(new Date(value));

const getRoomButtonClassName = (unreadCount: number): string =>
	[
		"flex cursor-pointer items-center gap-3 rounded-lg border bg-card p-4 text-left shadow-sm transition-colors hover:border-coral-200",
		unreadCount > 0
			? "border-coral-300 ring-1 ring-coral-200"
			: "border-border",
	].join(" ");

export function SeekerChatListResponsive({
	onFallback,
	onOpen,
}: SeekerChatListResponsiveProps) {
	const queryClient = useQueryClient();
	const chatsQuery = useQuery(orpc.bambi.chats.listMine.queryOptions());
	const rooms = chatsQuery.data ?? [];
	const roomIds = useMemo(() => rooms.map((room) => room.id), [rooms]);

	useEffect(() => {
		if (roomIds.length === 0) {
			return;
		}

		const socket = connectBambiChatSocket();
		const refreshList = (payload: { roomId: string }) => {
			if (roomIds.includes(payload.roomId)) {
				queryClient
					.invalidateQueries({
						queryKey: orpc.bambi.chats.listMine.queryKey(),
					})
					.catch(() => undefined);
			}
		};

		socket.on("chat:message:created", refreshList);
		socket.on("chat:unread:updated", refreshList);
		for (const roomId of roomIds) {
			joinBambiChatRoom(roomId).catch(() => undefined);
		}

		return () => {
			socket.off("chat:message:created", refreshList);
			socket.off("chat:unread:updated", refreshList);
			for (const roomId of roomIds) {
				leaveBambiChatRoom(roomId);
			}
		};
	}, [queryClient, roomIds]);

	if (chatsQuery.isError) {
		return (
			<div className="mx-auto w-full max-w-[760px] px-4 py-5 pb-24 md:px-6">
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
			</div>
		);
	}

	if (chatsQuery.isLoading) {
		return (
			<div className="mx-auto w-full max-w-[760px] px-4 py-10 text-center font-bold text-muted-foreground">
				채팅 목록을 불러오고 있어요.
			</div>
		);
	}

	return (
		<div className="mx-auto w-full max-w-[860px] px-4 py-5 pb-24 md:px-6 md:py-7 lg:pb-8">
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
						<button
							className={getRoomButtonClassName(room.unreadCount)}
							key={room.id}
							onClick={() => onOpen(room.id)}
							type="button"
						>
							<Avatar name={room.jobPostId} size="lg" square />
							<div className="min-w-0 flex-1">
								<div className="flex flex-wrap items-center gap-2">
									<h2 className="m-0 truncate font-extrabold text-base">
										공고 채팅
									</h2>
									<Badge tone={room.isBlocked ? "danger" : "success"}>
										{room.isBlocked ? "차단됨" : "대화 가능"}
									</Badge>
									{room.unreadCount > 0 ? (
										<Badge tone="primary">{room.unreadCount}개 미확인</Badge>
									) : null}
								</div>
								<p className="mt-1 mb-0 truncate text-muted-foreground text-sm">
									공고 {room.jobPostId}
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
						</button>
					))}
				</div>
			)}
		</div>
	);
}
