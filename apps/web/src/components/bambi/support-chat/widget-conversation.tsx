"use client";

import { Button } from "@bambi-app/ui/components/button";
import { Input } from "@bambi-app/ui/components/input";
import { cn } from "@bambi-app/ui/lib/utils";
import { useQuery } from "@tanstack/react-query";
import { ChevronLeft, SendHorizontal, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { orpc } from "@/utils/orpc";

// 서버 sendMessage 입력 한도(SUPPORT_CHAT_BODY_MAX)와 맞춘다.
const BODY_MAX = 1000;

// 실제 senderType은 유니온이지만 여기선 "inquirer" 여부만 본다 — 최소 형태로 받는다.
interface SupportChatMessage {
	body: string;
	id: string;
	senderType: string;
}

// 컴포저/차단/종료 안내를 분기하는 하단 영역. 대화 뷰 본체의 인지 복잡도를 낮추려 분리.
function ConversationFooter({
	draft,
	isBlocked,
	isClosed,
	isSending,
	onDraftChange,
	onStartNew,
	onSubmit,
}: {
	draft: string;
	isBlocked: boolean;
	isClosed: boolean;
	isSending: boolean;
	onDraftChange: (value: string) => void;
	onStartNew: () => void;
	onSubmit: () => void;
}) {
	if (isClosed) {
		return (
			<div className="flex flex-col items-center gap-2 border-t p-3 text-sm">
				<p className="m-0 text-muted-foreground">종료된 대화예요.</p>
				<Button onClick={onStartNew} size="sm" variant="outline">
					새 대화 시작
				</Button>
			</div>
		);
	}
	if (isBlocked) {
		return (
			<p className="border-t p-3 text-muted-foreground text-sm">
				문의 발신이 제한된 상태예요.
			</p>
		);
	}
	return (
		<div className="flex items-center gap-2 border-t p-3">
			<Input
				maxLength={BODY_MAX}
				onChange={(event) => onDraftChange(event.target.value)}
				onKeyDown={(event) => {
					// 한글 IME 조합 확정 Enter는 발신이 아니다.
					if (event.key === "Enter" && !event.nativeEvent.isComposing) {
						event.preventDefault();
						onSubmit();
					}
				}}
				placeholder="메시지를 입력하세요"
				value={draft}
			/>
			<Button
				aria-label="전송"
				disabled={draft.trim() === "" || isSending}
				onClick={onSubmit}
				size="icon"
			>
				<SendHorizontal />
			</Button>
		</div>
	);
}

// 대화 뷰: 뒤로가기 헤더 + 말풍선 + 컴포저. roomId=null이면 새 대화(조회 없이 안내만),
// 첫 발신 성공 시 셸이 반환 roomId로 뷰를 고정한다.
export function WidgetConversation({
	isSending,
	onBack,
	onClose,
	onMarkRead,
	onSend,
	onStartNew,
	roomId,
	unreadCount,
}: {
	isSending: boolean;
	onBack: () => void;
	onClose: () => void;
	onMarkRead: (roomId: string) => void;
	onSend: (roomId: null | string, body: string) => Promise<boolean>;
	onStartNew: () => void;
	roomId: null | string;
	unreadCount: number;
}) {
	const [draft, setDraft] = useState("");
	const scrollRef = useRef<HTMLDivElement>(null);

	const roomQuery = useQuery({
		...orpc.bambi.supportChat.getRoomMessages.queryOptions({
			input: { roomId: roomId ?? "" },
		}),
		enabled: roomId !== null,
		refetchInterval: 3000,
	});
	const messages: SupportChatMessage[] = roomQuery.data?.messages ?? [];
	const isBlocked = roomQuery.data?.room.isBlocked ?? false;
	const isClosed = roomQuery.data?.room.status === "closed";

	// 안 읽은 운영자 메시지가 있으면 읽음 처리 — 읽으면 셸의 rooms 갱신으로 unreadCount가
	// 0으로 떨어져 재실행되지 않는다(markRead는 멱등).
	useEffect(() => {
		if (roomId && unreadCount > 0) {
			onMarkRead(roomId);
		}
	}, [roomId, unreadCount, onMarkRead]);

	// 메시지가 늘거나 방이 바뀌면 맨 아래로.
	useEffect(() => {
		const el = scrollRef.current;
		if (el) {
			el.scrollTop = el.scrollHeight;
		}
	}, [messages.length]);

	const onSubmit = () => {
		if (draft.trim() === "" || isSending) {
			return;
		}
		onSend(roomId, draft)
			.then((ok) => {
				if (ok) {
					setDraft("");
				}
			})
			.catch(() => undefined);
	};

	return (
		<div className="flex flex-1 flex-col overflow-hidden">
			<div className="flex items-center justify-between gap-2 border-b p-3">
				<Button
					aria-label="뒤로"
					onClick={onBack}
					size="icon-sm"
					variant="ghost"
				>
					<ChevronLeft />
				</Button>
				<span className="font-medium text-sm">운영자 문의</span>
				<Button
					aria-label="문의 닫기"
					onClick={onClose}
					size="icon-sm"
					variant="ghost"
				>
					<X />
				</Button>
			</div>
			<div
				className="flex flex-1 flex-col gap-2 overflow-y-auto p-3"
				ref={scrollRef}
			>
				{messages.length === 0 ? (
					<p className="text-muted-foreground text-sm">
						운영자에게 궁금한 점을 남겨 주세요.
					</p>
				) : (
					messages.map((message) => (
						<div
							className={cn(
								"flex",
								message.senderType === "inquirer"
									? "justify-end"
									: "justify-start"
							)}
							key={message.id}
						>
							<div
								className={cn(
									"max-w-[80%] whitespace-pre-wrap break-words rounded-lg px-3 py-2 text-sm",
									message.senderType === "inquirer"
										? "bg-primary text-primary-foreground"
										: "bg-muted text-foreground"
								)}
							>
								{message.body}
							</div>
						</div>
					))
				)}
			</div>
			<ConversationFooter
				draft={draft}
				isBlocked={isBlocked}
				isClosed={isClosed}
				isSending={isSending}
				onDraftChange={setDraft}
				onStartNew={onStartNew}
				onSubmit={onSubmit}
			/>
		</div>
	);
}
