"use client";

// 밤비 — 운영자 전용 "채팅 내역" 열람 다이얼로그.
// 채팅 관리 목록과 면접 일정 목록이 같은 방을 같은 방식으로 열어야 해서 채팅 관리
// 페이지에서 떼어냈다. 열람은 읽기 전용(getChatMessagesForModeration)이라 상대에게
// 읽음으로 보이지 않고, 누가 언제 열었는지만 감사 로그에 남는다.

import { Badge } from "@bambi-app/ui/components/badge";
import { Button } from "@bambi-app/ui/components/button";
import {
	Dialog,
	DialogClose,
	DialogContent,
	DialogDescription,
	DialogTitle,
} from "@bambi-app/ui/components/dialog";
import { Skeleton } from "@bambi-app/ui/components/skeleton";
import { useQuery } from "@tanstack/react-query";
import { formatDateTime } from "@/lib/bambi-format";
import { orpc } from "@/utils/orpc";

// 채팅 내역 열람 대상(방 id + 표시용 제목).
export interface ViewingChat {
	chatRoomId: string;
	title: string;
}

// 다이얼로그가 열릴 때만 마운트돼 메시지를 조회·렌더한다(support InquiryThread와 동일 패턴).
function ChatHistoryContent({ chatRoomId }: { chatRoomId: string }) {
	const historyQuery = useQuery({
		...orpc.bambi.moderation.getChatMessagesForModeration.queryOptions({
			input: { chatRoomId },
		}),
		// 서버가 열람을 감사 로그로 남기므로 창 포커스가 돌아올 때마다 다시 부르면 한 번
		// 본 대화가 여러 건으로 기록된다. 같은 세션에서는 캐시를 그대로 쓴다.
		refetchOnWindowFocus: false,
		staleTime: Number.POSITIVE_INFINITY,
	});

	if (historyQuery.isPending) {
		return <Skeleton className="h-40 w-full" />;
	}

	if (historyQuery.isError || !historyQuery.data) {
		return (
			<p className="m-0 text-muted-foreground text-sm">
				채팅 내역을 불러오지 못했어요.
			</p>
		);
	}

	const { employerName, employerUserId, jobSeekerName, messages } =
		historyQuery.data;

	if (messages.length === 0) {
		return (
			<p className="m-0 text-muted-foreground text-sm">아직 메시지가 없어요.</p>
		);
	}

	return (
		<div className="flex max-h-[60vh] min-w-0 flex-col gap-3 overflow-y-auto">
			{messages.map((message) => {
				const isEmployer = message.senderUserId === employerUserId;
				return (
					<div className="flex min-w-0 flex-col gap-1" key={message.id}>
						<div className="flex flex-wrap items-center gap-2">
							<Badge variant={isEmployer ? "default" : "secondary"}>
								{isEmployer ? employerName : jobSeekerName}
							</Badge>
							{message.kind === "contact_request" ? (
								<Badge variant="outline">연락처 요청</Badge>
							) : null}
							<span className="text-muted-foreground text-xs">
								{formatDateTime(message.createdAt)}
							</span>
						</div>
						<p className="m-0 whitespace-pre-wrap text-foreground text-sm">
							{message.body}
						</p>
						{message.attachments.length > 0 ? (
							<div className="flex flex-wrap gap-1">
								{message.attachments.map((attachment) => (
									<Badge key={attachment.id} variant="outline">
										첨부 · {attachment.fileName}
									</Badge>
								))}
							</div>
						) : null}
					</div>
				);
			})}
		</div>
	);
}

export function ChatHistoryDialog({
	onClose,
	viewing,
}: {
	onClose: () => void;
	viewing: ViewingChat | null;
}) {
	return (
		<Dialog
			onOpenChange={(open) => {
				if (!open) {
					onClose();
				}
			}}
			open={viewing !== null}
		>
			<DialogContent className="max-w-2xl">
				<DialogTitle>채팅 내역</DialogTitle>
				<DialogDescription>
					"{viewing?.title}" 채팅방의 전체 대화를 시간순으로 봅니다. 열람은 읽기
					전용이며 참여자에게는 읽음으로 표시되지 않아요.
				</DialogDescription>
				{viewing ? (
					<ChatHistoryContent chatRoomId={viewing.chatRoomId} />
				) : null}
				<div className="flex justify-end">
					<DialogClose
						render={
							<Button size="sm" type="button" variant="ghost">
								닫기
							</Button>
						}
					/>
				</div>
			</DialogContent>
		</Dialog>
	);
}
