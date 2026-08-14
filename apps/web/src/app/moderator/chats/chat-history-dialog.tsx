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
import { DownloadIcon, FileTextIcon } from "lucide-react";
import { type ReactNode, useEffect, useMemo, useRef, useState } from "react";
import { Avatar } from "@/components/bambi/ds";
import {
	annotateChatMessages,
	formatChatTimeLabel,
} from "@/lib/bambi/chat-message-grouping";
import { orpc } from "@/utils/orpc";

// 채팅 내역 열람 대상(방 id + 표시용 제목).
export interface ViewingChat {
	chatRoomId: string;
	title: string;
}

function AttachmentStrip({ children }: { children: ReactNode }) {
	const stripRef = useRef<HTMLDivElement>(null);
	const dragRef = useRef({ left: 0, moved: false, startX: 0 });

	return (
		<div
			className="flex cursor-grab gap-2 overflow-x-auto overscroll-x-contain pb-1 active:cursor-grabbing md:gap-3"
			onClickCapture={(event) => {
				if (dragRef.current.moved) {
					event.preventDefault();
					event.stopPropagation();
					dragRef.current.moved = false;
				}
			}}
			onPointerCancel={(event) => {
				const strip = stripRef.current;
				if (strip?.hasPointerCapture(event.pointerId)) {
					strip.releasePointerCapture(event.pointerId);
				}
			}}
			onPointerDown={(event) => {
				const strip = stripRef.current;
				if (!strip) {
					return;
				}
				dragRef.current = {
					left: strip.scrollLeft,
					moved: false,
					startX: event.clientX,
				};
			}}
			onPointerMove={(event) => {
				const strip = stripRef.current;
				if (!strip || event.buttons !== 1) {
					return;
				}
				const distance = event.clientX - dragRef.current.startX;
				dragRef.current.moved ||= Math.abs(distance) > 4;
				if (
					dragRef.current.moved &&
					!strip.hasPointerCapture(event.pointerId)
				) {
					strip.setPointerCapture(event.pointerId);
				}
				strip.scrollLeft = dragRef.current.left - distance;
			}}
			onPointerUp={(event) => {
				const strip = stripRef.current;
				if (strip?.hasPointerCapture(event.pointerId)) {
					strip.releasePointerCapture(event.pointerId);
				}
			}}
			ref={stripRef}
		>
			{children}
		</div>
	);
}

// 다이얼로그가 열릴 때만 마운트돼 메시지를 조회·렌더한다(support InquiryThread와 동일 패턴).
export function ChatHistoryContent({
	chatRoomId,
	constrained = true,
}: {
	chatRoomId: string;
	constrained?: boolean;
}) {
	const historyQuery = useQuery({
		...orpc.bambi.moderation.getChatMessagesForModeration.queryOptions({
			input: { chatRoomId },
		}),
		// 서버가 열람을 감사 로그로 남기므로 창 포커스가 돌아올 때마다 다시 부르면 한 번
		// 본 대화가 여러 건으로 기록된다. 같은 세션에서는 캐시를 그대로 쓴다.
		refetchOnWindowFocus: false,
		staleTime: Number.POSITIVE_INFINITY,
	});

	const messages = historyQuery.data?.messages ?? [];
	const employerName = historyQuery.data?.employerName ?? "구인자";
	const employerImage = historyQuery.data?.employerImage ?? null;
	const employerUserId = historyQuery.data?.employerUserId ?? "";
	const jobSeekerName = historyQuery.data?.jobSeekerName ?? "구직자";
	const jobSeekerImage = historyQuery.data?.jobSeekerImage ?? null;
	const annotatedMessages = useMemo(
		() => annotateChatMessages(messages),
		[messages]
	);
	const attachmentRefs = useRef(new Map<string, HTMLElement>());
	const highlightTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
	const [highlightedAttachmentIds, setHighlightedAttachmentIds] = useState<
		Set<string>
	>(new Set());
	const previewAttachments = messages.flatMap((message) =>
		message.attachments.filter(
			(attachment) =>
				attachment.category === "pdf" ||
				(attachment.category === "image" && attachment.mimeType !== "image/gif")
		)
	);
	useEffect(
		() => () => {
			if (highlightTimerRef.current) {
				clearTimeout(highlightTimerRef.current);
			}
		},
		[]
	);
	const highlightMessageAttachments = (attachmentIds: string[]) => {
		if (attachmentIds.length === 0) {
			return;
		}
		if (highlightTimerRef.current) {
			clearTimeout(highlightTimerRef.current);
		}
		setHighlightedAttachmentIds(new Set(attachmentIds));
		requestAnimationFrame(() => {
			const target = attachmentRefs.current.get(attachmentIds[0] ?? "");
			const strip = target?.parentElement;
			if (target && strip) {
				strip.scrollTo({
					behavior: "smooth",
					left:
						target.offsetLeft - (strip.clientWidth - target.clientWidth) / 2,
				});
			}
		});
		highlightTimerRef.current = setTimeout(() => {
			setHighlightedAttachmentIds(new Set());
			highlightTimerRef.current = null;
		}, 2000);
	};

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

	if (messages.length === 0) {
		return (
			<p className="m-0 text-muted-foreground text-sm">아직 메시지가 없어요.</p>
		);
	}

	return (
		<div
			className={`flex min-h-0 min-w-0 flex-col gap-3 overflow-hidden ${constrained ? "max-h-[60vh]" : "h-[min(70vh,720px)]"}`}
		>
			<div className="flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto overscroll-y-contain pr-1">
				{annotatedMessages.map(
					// 메시지 종류·그룹 경계·발신 방향·첨부 유무가 한 행에서 함께 결정된다.
					// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: splitting this renderer would duplicate the paired group-boundary layout.
					({ dateLabel, isGroupEnd, isGroupStart, message }) => {
						const isEmployer = message.senderUserId === employerUserId;
						const messagePreviewIds = message.attachments
							.filter(
								(attachment) =>
									attachment.category === "pdf" ||
									(attachment.category === "image" &&
										attachment.mimeType !== "image/gif")
							)
							.map((attachment) => attachment.id);
						return (
							<div className="contents" key={message.id}>
								{dateLabel ? (
									<div className="my-1 self-center rounded-full bg-secondary px-3 py-1 text-muted-foreground text-xs">
										{dateLabel}
									</div>
								) : null}
								<div
									className={`flex min-w-0 max-w-[85%] flex-col gap-1 ${isGroupStart ? "mt-2" : ""} ${isEmployer ? "items-start self-start" : "items-end self-end"}`}
								>
									<div
										className={`flex flex-wrap items-center gap-2 ${isEmployer ? "justify-start" : "justify-end"}`}
									>
										{isGroupStart ? (
											<span className="flex items-center gap-1.5">
												<Avatar
													fallbackIcon="user"
													name={isEmployer ? employerName : jobSeekerName}
													size="xs"
													src={
														(isEmployer ? employerImage : jobSeekerImage) ??
														undefined
													}
												/>
												<Badge variant={isEmployer ? "default" : "secondary"}>
													{isEmployer ? employerName : jobSeekerName}
												</Badge>
											</span>
										) : null}
										{message.kind === "contact_request" ? (
											<Badge variant="outline">연락처 요청</Badge>
										) : null}
										{isGroupEnd ? (
											<span className="text-muted-foreground text-xs">
												{formatChatTimeLabel(message.createdAt)}
											</span>
										) : null}
									</div>
									<button
										className={`m-0 w-fit whitespace-pre-wrap rounded-xl px-3 py-2 text-sm ${isEmployer ? "bg-secondary text-foreground" : "bg-primary text-primary-foreground"}`}
										disabled={
											message.body !== "첨부 파일을 보냈습니다." ||
											messagePreviewIds.length === 0
										}
										onClick={() =>
											highlightMessageAttachments(messagePreviewIds)
										}
										type="button"
									>
										{message.body}
									</button>
									{message.attachments.some(
										(attachment) => attachment.mimeType === "image/gif"
									) ? (
										<div className="flex flex-wrap gap-1">
											{message.attachments
												.filter(
													(attachment) => attachment.mimeType === "image/gif"
												)
												.map((attachment) => (
													<Badge key={attachment.id} variant="outline">
														첨부 · {attachment.fileName}
													</Badge>
												))}
										</div>
									) : null}
								</div>
							</div>
						);
					}
				)}
			</div>
			{previewAttachments.length > 0 ? (
				<div className="flex-none rounded-xl border bg-background p-2 md:p-3">
					<p className="mt-0 mb-1.5 font-semibold text-xs md:mb-2 md:text-sm">
						첨부파일
					</p>
					<AttachmentStrip>
						{previewAttachments.map((attachment) =>
							attachment.category === "image" ? (
								<a
									className={`block size-16 flex-none overflow-hidden rounded-lg border bg-background transition-[border-color,box-shadow] md:size-20 ${highlightedAttachmentIds.has(attachment.id) ? "border-primary ring-2 ring-primary/40" : ""}`}
									href={attachment.objectUrl}
									key={attachment.id}
									ref={(node) => {
										if (node) {
											attachmentRefs.current.set(attachment.id, node);
										} else {
											attachmentRefs.current.delete(attachment.id);
										}
									}}
									rel="noopener"
									target="_blank"
									title={attachment.fileName}
								>
									{/* biome-ignore lint/performance/noImgElement: signed chat URLs need direct thumbnail rendering. */}
									<img
										alt={attachment.fileName}
										className="size-full object-contain"
										height={80}
										src={attachment.objectUrl}
										width={80}
									/>
								</a>
							) : (
								<div
									className={`flex h-16 w-44 flex-none items-center gap-2 rounded-lg border bg-background p-2 transition-[border-color,box-shadow] md:h-20 md:w-52 ${highlightedAttachmentIds.has(attachment.id) ? "border-primary ring-2 ring-primary/40" : ""}`}
									key={attachment.id}
									ref={(node) => {
										if (node) {
											attachmentRefs.current.set(attachment.id, node);
										} else {
											attachmentRefs.current.delete(attachment.id);
										}
									}}
								>
									<FileTextIcon className="size-6 flex-none text-primary md:size-7" />
									<a
										className="min-w-0 flex-1 truncate text-sm hover:underline"
										href={attachment.objectUrl}
										rel="noopener"
										target="_blank"
										title={attachment.fileName}
									>
										{attachment.fileName}
									</a>
									<a
										aria-label={`${attachment.fileName} 다운로드`}
										className="inline-flex size-8 flex-none items-center justify-center rounded-full text-muted-foreground hover:bg-secondary"
										download={attachment.fileName}
										href={attachment.objectUrl}
									>
										<DownloadIcon className="size-4" />
									</a>
								</div>
							)
						)}
					</AttachmentStrip>
				</div>
			) : null}
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
