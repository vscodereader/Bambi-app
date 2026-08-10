"use client";

import { generateChatMessageId } from "@bambi-app/api/services/bambi-chat-message-id";
import { Button as UiButton } from "@bambi-app/ui/components/button";
import { Input } from "@bambi-app/ui/components/input";
import {
	Message,
	MessageContent,
	MessageGroup,
} from "@bambi-app/ui/components/message";
import {
	Sheet,
	SheetContent,
	SheetTitle,
} from "@bambi-app/ui/components/sheet";
import { cn } from "@bambi-app/ui/lib/utils";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { Route } from "next";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
	Fragment,
	type ReactNode,
	useCallback,
	useEffect,
	useId,
	useLayoutEffect,
	useMemo,
	useRef,
	useState,
} from "react";
import { toast } from "sonner";
import { getChatBlockMessage } from "@/lib/bambi/chat-block";
import {
	annotateChatMessages,
	formatChatTimeLabel,
} from "@/lib/bambi/chat-message-grouping";
import { mergeChatMessagesById } from "@/lib/bambi/chat-room-messages";
import {
	detectImageSignature,
	isPdfSignature,
	isSignatureMismatch,
} from "@/lib/bambi/image-signature";
import { SEEKER_CONTENT_WIDTH } from "@/lib/bambi/layout";
import { useChatMessageScroll } from "@/lib/bambi/use-chat-message-scroll";
import { useChatRoomAutoRead } from "@/lib/bambi/use-chat-room-auto-read";
import { useMobileKeyboardState } from "@/lib/bambi/use-mobile-keyboard-state";
import { useOlderChatMessages } from "@/lib/bambi/use-older-chat-messages";
import {
	connectBambiChatSocket,
	emitBambiChatTypingStarted,
	emitBambiChatTypingStopped,
	joinBambiChatRoom,
	scheduleBambiChatRoomLeave,
} from "@/lib/bambi-chat-realtime";
import { formatPhone } from "@/lib/bambi-format";
import { uploadFileToSignedUrl } from "@/lib/bambi-job-form";
import {
	interviewStatusLabels,
	jobStatusLabels,
	NEGOTIABLE_PAY_TEXT,
} from "@/lib/bambi-options";
import { orpc } from "@/utils/orpc";
import {
	ChatAttachmentPreview,
	type ChatAttachmentPreviewItem,
} from "../chat-attachment-preview";
import { Avatar, Badge, Button, Card } from "../ds";
import { FieldLabel } from "../form-message";
import {
	ArrowNarrowLeft,
	ClockIcon,
	DollarCircle,
	MenuIcon,
	Message as MessageIcon,
	PaperclipIcon,
	PlusIcon,
	ShieldIcon,
	XIcon,
} from "../icons";
import { ReportDialog } from "../report-dialog";

interface SeekerChatRoomResponsiveProps {
	onBack: () => void;
	roomId: string;
}

const formatDateTime = (value: Date | string): string =>
	new Intl.DateTimeFormat("ko-KR", {
		dateStyle: "medium",
		timeStyle: "short",
	}).format(new Date(value));

const formatPay = (amount?: null | number, unit?: string): string => {
	if (!unit) {
		return "채팅으로 확인";
	}
	// 급여 단위가 "협의"인 공고는 금액이 없다.
	if (!amount) {
		return NEGOTIABLE_PAY_TEXT;
	}
	return `${unit} ${amount.toLocaleString("ko-KR")}원`;
};

const getRealtimeErrorMessage = (error: unknown): string =>
	error instanceof Error ? error.message : "실시간 채팅 연결을 확인해 주세요.";

// 서버 기본 페이지 크기와 같은 값. "이전 메시지 더 보기"는 이 크기의 커서 페이지를 하나씩
// 앞으로 붙인다(예전처럼 limit을 키우지 않는다 — 상한도, 전량 재전송도 없다).
const CHAT_MESSAGE_PAGE_SIZE = 50;

const ACCEPTED_ATTACHMENT_MIME_TYPES = [
	"image/jpeg",
	"image/png",
	"image/webp",
	"application/pdf",
] as const;
// 서버 정책(bambi-media-policy.ts)과 같은 값이어야 한다. 8MB로 두던 이미지 상한이 서버보다
// 좁아 서버가 받아 줄 파일을 화면이 먼저 막았다.
const ATTACHMENT_MAX_BYTES = 10 * 1024 * 1024;

type AttachmentDraftStatus = "error" | "selected" | "uploading";

interface AttachmentDraft {
	errorMessage?: string;
	file: File;
	status: AttachmentDraftStatus;
}

const formatAttachmentSize = (byteSize: number): string => {
	if (byteSize >= 1024 * 1024) {
		return `${(byteSize / (1024 * 1024)).toFixed(1)} MB`;
	}

	return `${Math.max(1, Math.round(byteSize / 1024)).toLocaleString("ko-KR")} KB`;
};

const getAttachmentValidationError = (file: File): null | string => {
	if (!ACCEPTED_ATTACHMENT_MIME_TYPES.includes(file.type as never)) {
		return "JPG, PNG, WebP 이미지 또는 PDF만 첨부할 수 있어요.";
	}

	if (file.size > ATTACHMENT_MAX_BYTES) {
		return file.type === "application/pdf"
			? "PDF는 10 MB 이하만 첨부할 수 있어요."
			: "이미지는 10 MB 이하만 첨부할 수 있어요.";
	}

	return null;
};

const getAttachmentStatusLabel = (status: AttachmentDraftStatus): string => {
	switch (status) {
		case "uploading":
			return "업로드 중";
		case "error":
			return "확인 필요";
		default:
			return "첨부 준비";
	}
};

/**
 * 채팅 목록 캐시에서 이 방의 안 읽음만 0으로 눌러 둔다. 읽음 요청이 왕복하는 사이에
 * 목록이 다시 그려지면 방금 읽은 방에 핀이 깜빡이기 때문이다. 핀 숫자의 정본은 서버
 * 집계라, 요청이 성공하면 다시 무효화해 정본으로 맞춘다.
 */
const zeroUnreadCountForRoom = <RoomType extends { id: string }>(
	rooms: RoomType[] | undefined,
	roomId: string
): RoomType[] | undefined =>
	rooms?.map((room) =>
		room.id === roomId ? { ...room, unreadCount: 0 } : room
	);

const getMutationErrorMessage = (error: Error): string => {
	if ("code" in error && error.code === "UNAUTHORIZED") {
		return "로그인 후 다시 시도해 주세요.";
	}

	// 상대가 나간 방·차단·신고 검토 중처럼 서버가 사유를 실어 보낸 FORBIDDEN은
	// 그 사유를 그대로 보여준다("권한이 없거나 차단된 채팅방입니다."로 뭉뚱그리면
	// 왜 안 보내지는지 알 길이 없다).
	const blockMessage = getChatBlockMessage(error);

	if (blockMessage) {
		return blockMessage;
	}

	if ("code" in error && error.code === "FORBIDDEN") {
		return "권한이 없거나 차단된 채팅방입니다.";
	}

	return "요청을 처리하지 못했어요. 잠시 후 다시 시도해 주세요.";
};

type RealtimeStatus = "connected" | "connecting" | "offline";

type ContactRequestStatus = "declined" | "pending" | "revealed";
type ContactRevealDecision = "decline" | "reveal";

interface ContactRequestMetadata {
	requesterUserId: string;
	status: ContactRequestStatus;
	targetUserId: string;
}

const CONTACT_REQUEST_STATUSES: readonly string[] = [
	"declined",
	"pending",
	"revealed",
];

// contact_request 메시지의 jsonb metadata는 unknown이라 좁혀서 읽는다. 형태가
// 어긋나면 null(특수 렌더를 건너뛴다).
const readContactRequestMetadata = (
	value: unknown
): ContactRequestMetadata | null => {
	if (typeof value !== "object" || value === null) {
		return null;
	}

	const { requesterUserId, status, targetUserId } = value as Record<
		string,
		unknown
	>;

	if (
		typeof requesterUserId === "string" &&
		typeof targetUserId === "string" &&
		typeof status === "string" &&
		CONTACT_REQUEST_STATUSES.includes(status)
	) {
		return {
			requesterUserId,
			status: status as ContactRequestStatus,
			targetUserId,
		};
	}

	return null;
};

// contact_request 인라인 시스템 메시지 문구. 역할(구인자/구직자)과 status 전이로 분기.
const getContactRequestNotice = ({
	counterpartName,
	revealedPhone,
	status,
	viewerIsEmployer,
}: {
	counterpartName: string;
	revealedPhone: null | string;
	status: ContactRequestStatus;
	viewerIsEmployer: boolean;
}): string => {
	if (status === "pending") {
		return viewerIsEmployer
			? "연락처 공개를 요청했습니다. (응답 대기 중)"
			: `${counterpartName}님께서 연락처 공개 요청이 왔습니다. 공개하시겠습니까?`;
	}

	if (status === "revealed") {
		return viewerIsEmployer
			? `${counterpartName}님께서 연락처를 공개했습니다: ${revealedPhone ? formatPhone(revealedPhone) : "확인 필요"}`
			: "연락처를 공개했습니다.";
	}

	return viewerIsEmployer
		? `${counterpartName}님께서 연락처 공개를 거절하셨습니다.`
		: "연락처 공개를 거절했습니다.";
};

const getRealtimeStatusLabel = (status: RealtimeStatus): string => {
	switch (status) {
		case "connected":
			return "실시간 연결";
		case "offline":
			return "오프라인";
		default:
			return "연결 중";
	}
};

interface ChatMessageItem {
	attachments?: ChatAttachmentPreviewItem[];
	body: string;
	createdAt: Date | string;
	id: string;
	kind: string;
	metadata: unknown;
	revealedPhone: null | string;
	senderUserId: string;
}

// 일반 말풍선. 내(coral-500)/상대(secondary)로 좌우 정렬. shadcn Message 래핑.
// 모바일(<md)은 카카오톡식이다 — 상대 아바타·이름은 그룹 첫 메시지에만 붙고(이어지는
// 메시지는 아바타 폭만큼 들여쓴다), 시간은 그룹 마지막 메시지의 말풍선 밖에 붙인다.
// 데스크톱은 현행 그대로라 모바일 전용 조각은 md:hidden, 말풍선 안 시간은 max-md:hidden이다.
function ChatMessageBubble({
	counterpartName,
	currentUserId,
	isGroupEnd,
	isGroupStart,
	message,
}: {
	counterpartName: null | string;
	currentUserId: string;
	isGroupEnd: boolean;
	isGroupStart: boolean;
	message: ChatMessageItem;
}) {
	const mine = message.senderUserId === currentUserId;
	const attachments = message.attachments ?? [];
	const senderName = counterpartName ?? "상대방";

	return (
		<Message align={mine ? "end" : "start"}>
			{mine ? null : (
				<span className="flex-none self-start md:hidden">
					{isGroupStart ? (
						<Avatar name={senderName} size="xs" />
					) : (
						<span className="block size-7" />
					)}
				</span>
			)}
			<div
				className={cn(
					"flex min-w-0 max-w-[60%] flex-col gap-1 md:max-w-[78%]",
					attachments.length > 0 && "max-md:max-w-[58%]",
					mine && "items-end"
				)}
			>
				{mine || !isGroupStart ? null : (
					<span className="truncate font-semibold text-muted-foreground text-xs md:hidden">
						{senderName}
					</span>
				)}
				<div
					className={cn(
						"flex min-w-0 max-w-full items-end gap-1.5",
						mine && "flex-row-reverse"
					)}
				>
					<MessageContent
						className={cn(
							"w-fit min-w-0 max-w-full overflow-hidden rounded-lg px-4 py-2",
							attachments.length > 0 &&
								"max-md:w-full max-md:min-w-0 max-md:overflow-hidden",
							mine
								? "bg-coral-500 text-white"
								: "bg-secondary text-foreground max-md:bg-background"
						)}
					>
						{attachments.length === 0 ? (
							<p className="m-0 min-w-0 max-w-full whitespace-pre-wrap text-sm leading-relaxed [overflow-wrap:anywhere]">
								{message.body}
							</p>
						) : (
							<>
								{message.body.trim() ? (
									<p className="m-0 min-w-0 max-w-full whitespace-pre-wrap text-sm leading-relaxed [overflow-wrap:anywhere] md:hidden">
										{message.body}
									</p>
								) : null}
								<div className="grid min-w-0 max-w-full gap-2 max-md:w-full">
									{attachments.map((attachment) => (
										<ChatAttachmentPreview
											attachment={attachment}
											key={attachment.id}
											mine={mine}
										/>
									))}
								</div>
								<p className="mt-1 mb-0 text-right text-[11px] opacity-70 md:hidden">
									{formatChatTimeLabel(message.createdAt)}
								</p>
							</>
						)}
						<p className="mt-1 mb-0 text-[11px] opacity-70 max-md:hidden">
							{formatDateTime(message.createdAt)}
						</p>
					</MessageContent>
					{attachments.length === 0 ? (
						<span
							aria-hidden={!isGroupEnd}
							className={cn(
								"flex-none text-[11px] text-muted-foreground md:hidden",
								!isGroupEnd && "invisible"
							)}
						>
							{formatChatTimeLabel(message.createdAt)}
						</span>
					) : null}
				</div>
			</div>
		</Message>
	);
}

// 날짜가 바뀌는 지점의 가운데 pill. 데스크톱 말풍선은 안에 날짜까지 찍으므로 모바일에만 둔다.
function ChatDateChip({ label }: { label: string }) {
	return (
		<div className="flex justify-center py-1 md:hidden">
			<span className="rounded-full bg-ink-900/10 px-3 py-1 font-semibold text-[11px] text-ink-800">
				{label}
			</span>
		</div>
	);
}

// contact_request 특수 렌더. 중앙 정렬 시스템 카드 + 대상 구직자의 pending 응답 버튼.
function ContactRequestMessage({
	counterpartName,
	currentUserId,
	isResponding,
	message,
	onRespond,
	viewerIsEmployer,
}: {
	counterpartName: null | string;
	currentUserId: string;
	isResponding: boolean;
	message: ChatMessageItem;
	onRespond: (messageId: string, decision: ContactRevealDecision) => void;
	viewerIsEmployer: boolean;
}) {
	const metadata = readContactRequestMetadata(message.metadata);

	if (!metadata) {
		return null;
	}

	const notice = getContactRequestNotice({
		counterpartName: counterpartName ?? "상대방",
		revealedPhone: message.revealedPhone,
		status: metadata.status,
		viewerIsEmployer,
	});
	const canRespond =
		metadata.status === "pending" && metadata.targetUserId === currentUserId;

	return (
		<div className="mx-auto flex w-full max-w-[80%] flex-col gap-3 rounded-lg border border-coral-100 bg-coral-50 px-4 py-3 text-center">
			<p className="m-0 font-semibold text-coral-800 text-sm leading-relaxed">
				{notice}
			</p>
			{canRespond ? (
				<div className="flex justify-center gap-2">
					<Button
						disabled={isResponding}
						onClick={() => onRespond(message.id, "reveal")}
						size="sm"
						variant="primary"
					>
						공개
					</Button>
					<Button
						disabled={isResponding}
						onClick={() => onRespond(message.id, "decline")}
						size="sm"
						variant="secondary"
					>
						거절
					</Button>
				</div>
			) : null}
			<p className="m-0 text-[11px] text-coral-700/70">
				{formatDateTime(message.createdAt)}
			</p>
		</div>
	);
}

interface ChatMessageListProps {
	canLoadOlder: boolean;
	counterpartName: null | string;
	currentUserId: string;
	isLoadingOlder: boolean;
	isResponding: boolean;
	messages: ChatMessageItem[];
	onLoadOlder: () => void;
	onRespond: (messageId: string, decision: ContactRevealDecision) => void;
	typingUserIds: string[];
	viewerIsEmployer: boolean;
}

function ChatMessageList({
	canLoadOlder,
	counterpartName,
	currentUserId,
	isLoadingOlder,
	isResponding,
	messages,
	onLoadOlder,
	onRespond,
	typingUserIds,
	viewerIsEmployer,
}: ChatMessageListProps) {
	if (messages.length === 0) {
		return (
			<div className="m-auto text-center text-muted-foreground text-sm">
				아직 메시지가 없어요. 안전하게 첫 메시지를 보내보세요.
			</div>
		);
	}

	return (
		<MessageGroup>
			{canLoadOlder ? (
				<div className="flex justify-center">
					<UiButton
						disabled={isLoadingOlder}
						onClick={onLoadOlder}
						size="sm"
						variant="outline"
					>
						{isLoadingOlder ? "불러오는 중" : "이전 메시지 더 보기"}
					</UiButton>
				</div>
			) : null}
			{annotateChatMessages(messages).map(
				({ dateLabel, isGroupEnd, isGroupStart, message: chatMessage }) => (
					<Fragment key={chatMessage.id}>
						{dateLabel ? <ChatDateChip label={dateLabel} /> : null}
						{chatMessage.kind === "contact_request" ? (
							<ContactRequestMessage
								counterpartName={counterpartName}
								currentUserId={currentUserId}
								isResponding={isResponding}
								message={chatMessage}
								onRespond={onRespond}
								viewerIsEmployer={viewerIsEmployer}
							/>
						) : (
							<ChatMessageBubble
								counterpartName={counterpartName}
								currentUserId={currentUserId}
								isGroupEnd={isGroupEnd}
								isGroupStart={isGroupStart}
								message={chatMessage}
							/>
						)}
					</Fragment>
				)
			)}
			{typingUserIds.length > 0 ? (
				<Message align="start">
					<MessageContent className="w-fit max-w-[78%] rounded-lg border border-coral-200 px-4 py-2 font-semibold text-coral-700 text-xs">
						상대가 입력 중이에요
					</MessageContent>
				</Message>
			) : null}
		</MessageGroup>
	);
}

interface AttachmentDraftPanelProps {
	attachmentDraft: AttachmentDraft;
	isAttachmentSubmitting: boolean;
	onClear: () => void;
}

function AttachmentDraftPanel({
	attachmentDraft,
	isAttachmentSubmitting,
	onClear,
}: AttachmentDraftPanelProps) {
	return (
		<div className="flex items-start gap-3 border-border border-b bg-secondary/60 px-4 py-3">
			<span className="inline-flex size-9 flex-none items-center justify-center rounded-lg bg-background text-coral-600">
				<PaperclipIcon />
			</span>
			<div className="min-w-0 flex-1">
				<div className="flex items-center gap-2">
					<strong className="min-w-0 truncate text-sm">
						{attachmentDraft.file.name}
					</strong>
					<Badge
						tone={attachmentDraft.status === "error" ? "danger" : "pending"}
					>
						{getAttachmentStatusLabel(attachmentDraft.status)}
					</Badge>
				</div>
				<p className="mt-1 mb-0 text-muted-foreground text-xs">
					{attachmentDraft.file.type || "알 수 없는 형식"} ·{" "}
					{formatAttachmentSize(attachmentDraft.file.size)}
				</p>
				{attachmentDraft.errorMessage ? (
					<p className="mt-1 mb-0 font-semibold text-red-600 text-xs">
						{attachmentDraft.errorMessage}
					</p>
				) : null}
			</div>
			<button
				aria-label="첨부 파일 제거"
				className="inline-flex size-8 flex-none cursor-pointer items-center justify-center rounded-lg border border-border bg-background text-muted-foreground hover:text-foreground"
				disabled={isAttachmentSubmitting}
				onClick={onClear}
				title="첨부 파일 제거"
				type="button"
			>
				<span className="inline-flex size-4">
					<XIcon />
				</span>
			</button>
		</div>
	);
}

interface ChatComposerProps {
	attachmentDraft: AttachmentDraft | null;
	attachmentInputRef: React.RefObject<HTMLInputElement | null>;
	isAttachmentSubmitting: boolean;
	isComposerSubmitting: boolean;
	message: string;
	onAttachmentChange: (event: React.ChangeEvent<HTMLInputElement>) => void;
	onClearAttachment: () => void;
	onMessageChange: (value: string) => void;
	onSubmit: (event: React.FormEvent<HTMLFormElement>) => void;
}

// 입력창에는 나감 상태 배선이 없다 — 한쪽이라도 나간 방은 서버가 NOT_FOUND로 끊어
// 화면 자체가 열리지 않으므로, 살아 있는 방에서는 잠글 이유가 없다.
function ChatComposer({
	attachmentDraft,
	attachmentInputRef,
	isAttachmentSubmitting,
	isComposerSubmitting,
	message,
	onAttachmentChange,
	onClearAttachment,
	onMessageChange,
	onSubmit,
}: ChatComposerProps) {
	// 전송 가능 판정은 한 벌만 둔다 — 모바일 원형 버튼과 데스크톱 텍스트 버튼이 같이 쓴다.
	const isSendDisabled =
		isComposerSubmitting ||
		attachmentDraft?.status === "error" ||
		!(message.trim() || attachmentDraft);

	return (
		<div className="flex-none border-border border-t max-md:pb-[env(safe-area-inset-bottom)]">
			{attachmentDraft ? (
				<AttachmentDraftPanel
					attachmentDraft={attachmentDraft}
					isAttachmentSubmitting={isAttachmentSubmitting}
					onClear={onClearAttachment}
				/>
			) : null}
			<form
				className="flex items-center gap-2 p-4 max-md:gap-1.5 max-md:p-2"
				onSubmit={onSubmit}
			>
				<label
					aria-label="파일 첨부"
					className="inline-flex size-11 flex-none cursor-pointer items-center justify-center rounded-lg border border-border bg-background text-muted-foreground focus-within:ring-2 focus-within:ring-coral-100 hover:text-foreground max-md:size-10 max-md:rounded-full max-md:border-transparent max-md:bg-secondary"
					title="파일 첨부"
				>
					<input
						accept={ACCEPTED_ATTACHMENT_MIME_TYPES.join(",")}
						className="sr-only"
						onChange={onAttachmentChange}
						ref={attachmentInputRef}
						type="file"
					/>
					<span className="inline-flex size-5 max-md:hidden">
						<PaperclipIcon />
					</span>
					<span className="inline-flex size-5 md:hidden">
						<PlusIcon />
					</span>
				</label>
				<label className="sr-only" htmlFor="chat-message">
					메시지
				</label>
				<input
					className="h-11 min-w-0 flex-1 rounded-lg border border-border bg-background px-4 text-sm outline-none focus-visible:ring-2 focus-visible:ring-coral-100 max-md:h-10 max-md:rounded-full max-md:border-transparent max-md:bg-secondary"
					id="chat-message"
					onChange={(event) => onMessageChange(event.target.value)}
					placeholder="메시지를 입력하세요"
					value={message}
				/>
				<Button
					className="max-md:hidden"
					disabled={isSendDisabled}
					rightIcon={<MessageIcon />}
					size="md"
					type="submit"
				>
					{isAttachmentSubmitting ? "업로드 중" : "전송"}
				</Button>
				{/* 모바일은 원형 코럴 아이콘 버튼 하나 — 활성 조건은 데스크톱과 같다. */}
				<UiButton
					aria-label={isAttachmentSubmitting ? "업로드 중" : "전송"}
					className="size-10 flex-none rounded-full bg-coral-500 text-white md:hidden"
					disabled={isSendDisabled}
					size="icon-lg"
					type="submit"
				>
					<span className="inline-flex size-5 translate-x-px -translate-y-px items-center justify-center">
						<MessageIcon />
					</span>
				</UiButton>
			</form>
		</div>
	);
}

// 채팅방 헤더에서 공고 상세로 가는 버튼. 상세(jobs.getById)는 published + paid만 열어 주므로
// 그 밖의 공고(삭제·검수 중·숨김·미결제)는 이동시키지 않고 이유만 남긴다 — 눌러서 404를 보는
// 것보다 낫다. 경로는 구직자·구인자 공용이다(seeker 레이아웃은 비로그인·게스트만 막는다).
function ChatJobPostLink({
	jobPost,
}: {
	jobPost: null | {
		id: string;
		paymentStatus: string;
		status: string;
	};
}) {
	const isViewable =
		jobPost?.status === "published" && jobPost.paymentStatus === "paid";

	if (!(jobPost && isViewable)) {
		return (
			<UiButton className="flex-none" disabled size="sm" variant="outline">
				{jobPost ? "공고 비공개" : "공고 삭제됨"}
			</UiButton>
		);
	}

	return (
		<UiButton
			className="flex-none"
			nativeButton={false}
			render={<Link href={`/seeker/jobs/${jobPost.id}` as Route} />}
			size="sm"
			variant="outline"
		>
			공고 보기
		</UiButton>
	);
}

// 헤더 상태 배지. 남는 상태는 운영자 차단뿐이다 — 상대가 나갔는지는 드러내지 않는다.
function ChatRoomStateBadge({ isBlocked }: { isBlocked: boolean }) {
	if (isBlocked) {
		return <Badge tone="danger">차단됨</Badge>;
	}

	return <Badge tone="success">대화 가능</Badge>;
}

function ChatCounterpartName({ name }: { name: string | null }) {
	if (!name) {
		return null;
	}

	return (
		<p className="mt-0.5 mb-0 truncate font-bold text-foreground text-sm">
			{name}
		</p>
	);
}

// 차단 대상 userId 유도: 구직자 관점이면 상대는 구인자, 아니면 구직자.
function resolveBlockedUserId(
	isJobSeeker: boolean,
	room: { employerUserId: string; jobSeekerUserId: string }
): string {
	if (isJobSeeker) {
		return room.employerUserId;
	}
	return room.jobSeekerUserId;
}

// "차단하기" 트리거 버튼. 안전 안내 헤딩과 같은 줄 우측에 배치한다.
// 이미 차단됐거나 확인 단계가 열려 있으면 노출하지 않는다.
function ChatBlockTrigger({
	isBlocked,
	isConfirmOpen,
	onOpen,
}: {
	isBlocked: boolean;
	isConfirmOpen: boolean;
	onOpen: () => void;
}) {
	if (isBlocked || isConfirmOpen) {
		return null;
	}

	return (
		<Button onClick={onOpen} size="sm" variant="secondary">
			차단하기
		</Button>
	);
}

// 차단 확인 패널. 실수 방지를 위해 "차단하기" → 인라인 확인 단계를 거친다.
// 안전 안내 문구 아래에 전체 폭으로 펼쳐진다.
function ChatBlockConfirm({
	isConfirmOpen,
	isPending,
	onCancel,
	onConfirm,
}: {
	isConfirmOpen: boolean;
	isPending: boolean;
	onCancel: () => void;
	onConfirm: () => void;
}) {
	if (!isConfirmOpen) {
		return null;
	}

	return (
		<div className="mt-3 flex flex-col gap-2 border-coral-100 border-t pt-3">
			<p className="m-0 font-bold text-coral-700 text-xs">
				이 상대를 정말 차단할까요? 차단하면 서로 대화할 수 없어요.
			</p>
			<div className="flex gap-2">
				<Button
					disabled={isPending}
					onClick={onCancel}
					size="sm"
					variant="secondary"
				>
					취소
				</Button>
				<Button
					disabled={isPending}
					onClick={onConfirm}
					size="sm"
					variant="danger"
				>
					{isPending ? "차단 중" : "차단"}
				</Button>
			</div>
		</div>
	);
}

// 헤더 아래 "연락처 보호 중" 안내 바 — 신고·차단 진입점을 함께 담는다(데스크톱 전용).
// 채팅 신고는 구직자 전용이라(서버 createReport도 같은 기준으로 막는다) 구인자에게는
// 차단하기만 남기고 안내 문구도 차단 기준으로 바꾼다. 차단은 양쪽 모두 쓸 수 있다.
// 확인 단계는 이 바 밖에서 쓰이지 않아 여기서 갖고 있고, 신고 창은 모바일 서랍과 공유하려고
// 부모가 들고 있다.
function ChatSafetyNotice({
	isBlocked,
	isBlockPending,
	isJobSeeker,
	onBlock,
	onReport,
}: {
	isBlocked: boolean;
	isBlockPending: boolean;
	isJobSeeker: boolean;
	onBlock: () => void;
	onReport: () => void;
}) {
	const [isBlockConfirmOpen, setIsBlockConfirmOpen] = useState(false);

	return (
		<div className="hidden flex-none border-coral-100 border-b bg-coral-50 px-4 py-3 text-coral-700 md:block">
			<div className="flex items-center justify-between gap-3">
				<div className="flex items-center gap-2 font-extrabold text-sm">
					<span className="inline-flex size-4">
						<ShieldIcon />
					</span>
					면접 확정 전 연락처 보호 중
				</div>
				<div className="flex items-center gap-2">
					{isJobSeeker ? (
						<Button onClick={onReport} size="sm" variant="secondary">
							신고
						</Button>
					) : null}
					<ChatBlockTrigger
						isBlocked={isBlocked}
						isConfirmOpen={isBlockConfirmOpen}
						onOpen={() => setIsBlockConfirmOpen(true)}
					/>
				</div>
			</div>
			<p className="mt-1 mb-0 text-xs leading-relaxed">
				{isJobSeeker
					? "외부 연락처 공유 유도나 조건 불일치는 신고할 수 있어요."
					: "문제가 되는 상대는 차단할 수 있어요."}
			</p>
			<ChatBlockConfirm
				isConfirmOpen={isBlockConfirmOpen}
				isPending={isBlockPending}
				onCancel={() => setIsBlockConfirmOpen(false)}
				onConfirm={onBlock}
			/>
		</div>
	);
}

// 모바일 안전 바 — 한 줄만 남기고 신고·차단은 서랍으로 옮겼다.
function ChatSafetyBannerMobile() {
	return (
		<div className="flex flex-none items-center gap-2 border-coral-100 border-b bg-coral-50 px-4 py-1.5 font-bold text-coral-700 text-xs md:hidden">
			<span className="inline-flex size-3.5">
				<ShieldIcon />
			</span>
			면접 확정 전 연락처 보호 중
		</div>
	);
}

// 서랍 안 안전 섹션 — 데스크톱 안내 바가 갖던 신고·차단을 그대로 옮겨 담는다(같은 트리거·
// 확인 단계 컴포넌트를 쓴다). 신고 창 자체는 부모가 한 벌만 띄운다.
function ChatSafetySheetCard({
	isBlocked,
	isBlockPending,
	isJobSeeker,
	onBlock,
	onReport,
}: {
	isBlocked: boolean;
	isBlockPending: boolean;
	isJobSeeker: boolean;
	onBlock: () => void;
	onReport: () => void;
}) {
	const [isBlockConfirmOpen, setIsBlockConfirmOpen] = useState(false);

	return (
		<Card className="rounded-lg" pad="lg" tone="outline">
			<h2 className="m-0 font-extrabold text-lg">안전</h2>
			<p className="mt-2 mb-0 text-muted-foreground text-sm leading-relaxed">
				{isJobSeeker
					? "외부 연락처 공유 유도나 조건 불일치는 신고할 수 있어요."
					: "문제가 되는 상대는 차단할 수 있어요."}
			</p>
			<div className="mt-3 flex items-center gap-2">
				{isJobSeeker ? (
					<Button onClick={onReport} size="sm" variant="secondary">
						신고
					</Button>
				) : null}
				<ChatBlockTrigger
					isBlocked={isBlocked}
					isConfirmOpen={isBlockConfirmOpen}
					onOpen={() => setIsBlockConfirmOpen(true)}
				/>
			</div>
			<ChatBlockConfirm
				isConfirmOpen={isBlockConfirmOpen}
				isPending={isBlockPending}
				onCancel={() => setIsBlockConfirmOpen(false)}
				onConfirm={onBlock}
			/>
		</Card>
	);
}

// 면접 일정 제안 폼은 구인자에게만 노출된다. 구직자는 제안을 받기만 한다.
function InterviewProposalForm({
	interviewAt,
	isPending,
	locationNote,
	onLocationNoteChange,
	onScheduledAtChange,
	onSubmit,
}: {
	interviewAt: string;
	isPending: boolean;
	locationNote: string;
	onLocationNoteChange: (value: string) => void;
	onScheduledAtChange: (value: string) => void;
	onSubmit: (event: React.FormEvent<HTMLFormElement>) => void;
}) {
	// 이 폼은 데스크톱 사이드바와 모바일 서랍 양쪽에 동시에 붙는다 — id를 고정하면
	// 같은 문서에 중복 id가 생겨 라벨이 엉뚱한 입력을 가리킨다.
	const fieldId = useId();

	return (
		<form className="mt-4 grid gap-3" onSubmit={onSubmit}>
			<div className="flex flex-col gap-2">
				<FieldLabel htmlFor={`${fieldId}-interview-at`}>면접 일시</FieldLabel>
				<Input
					id={`${fieldId}-interview-at`}
					min={new Date().toISOString().slice(0, 16)}
					onChange={(event) => onScheduledAtChange(event.target.value)}
					required
					type="datetime-local"
					value={interviewAt}
				/>
			</div>
			<div className="flex flex-col gap-2">
				<FieldLabel htmlFor={`${fieldId}-location-note`} optional>
					장소 메모
				</FieldLabel>
				<Input
					id={`${fieldId}-location-note`}
					maxLength={300}
					onChange={(event) => onLocationNoteChange(event.target.value)}
					placeholder="예: 역삼역 3번 출구 근처"
					value={locationNote}
				/>
			</div>
			<UiButton className="w-full" disabled={isPending} size="lg" type="submit">
				{isPending ? "제안 중" : "면접 일정 제안"}
			</UiButton>
		</form>
	);
}

// 면접 일정 카드 하단. 구인자는 "연락처 공개 요청" 버튼, 구직자는 구인자 인증번호를 본다.
function ContactRevealAction({
	employerVerifiedPhone,
	isJobSeeker,
	isRequesting,
	onRequest,
}: {
	employerVerifiedPhone: null | string;
	isJobSeeker: boolean;
	isRequesting: boolean;
	onRequest: () => void;
}) {
	if (!isJobSeeker) {
		return (
			<Button
				block
				className="mt-4 shadow-none"
				disabled={isRequesting}
				onClick={onRequest}
				size="md"
				variant="primary"
			>
				연락처 공개 요청
			</Button>
		);
	}

	if (!employerVerifiedPhone) {
		return null;
	}

	return (
		<div className="mt-4 flex flex-col gap-1 rounded-lg border border-border bg-card px-4 py-3">
			<span className="font-medium text-muted-foreground text-xs">
				구인자 인증 연락처
			</span>
			{/* 좁은 사이드 카드에서도 번호가 꺾이지 않도록 항상 세로 스택 + 번호는 한 줄 고정. */}
			<span className="flex flex-col gap-0.5">
				<a
					className="whitespace-nowrap font-bold text-base text-foreground underline-offset-2 hover:underline"
					href={`tel:${employerVerifiedPhone}`}
				>
					{formatPhone(employerVerifiedPhone)}
				</a>
				<span className="text-muted-foreground text-xs">
					밤비알바 보고 연락드렸다고 하시면 정확한 상담을 받으실 수 있어요.
				</span>
			</span>
		</div>
	);
}

interface ChatRoomSidePanelProps {
	currentUserId: string;
	employerVerifiedPhone: null | string;
	interviewAt: string;
	isBlocked: boolean;
	isJobSeeker: boolean;
	isProposePending: boolean;
	isRequestingContact: boolean;
	isStatusPending: boolean;
	jobPost: null | {
		id: string;
		payAmount: null | number;
		payUnit: string;
		paymentStatus: string;
		status: string;
	};
	locationNote: string;
	onInterviewSubmit: (event: React.FormEvent<HTMLFormElement>) => void;
	onLocationNoteChange: (value: string) => void;
	onRequestContact: () => void;
	onScheduledAtChange: (value: string) => void;
	safety: ReactNode;
	scheduleErrorMessage: null | string;
	schedules: readonly {
		id: string;
		locationNote: null | string;
		proposedByUserId: string;
		scheduledAt: Date | string;
		status: string;
	}[];
	setScheduleStatus: (
		interviewScheduleId: string,
		status: "canceled" | "confirmed" | "declined"
	) => void;
}

// 공고 조건·면접 일정·연락처 카드. 데스크톱 사이드바(aside)와 모바일 서랍(Sheet)이
// 같은 내용을 쓴다 — 서랍에만 있는 조각(공고 보기·상태 배지·안전 섹션)은 md:hidden으로
// 데스크톱 사이드바에서만 빠진다(모바일 헤더에서 뺀 것들의 새 자리라 데스크톱은 무변경).
function ChatRoomSidePanel({
	currentUserId,
	employerVerifiedPhone,
	interviewAt,
	isBlocked,
	isJobSeeker,
	isProposePending,
	isRequestingContact,
	isStatusPending,
	jobPost,
	locationNote,
	onInterviewSubmit,
	onLocationNoteChange,
	onRequestContact,
	onScheduledAtChange,
	safety,
	scheduleErrorMessage,
	schedules,
	setScheduleStatus,
}: ChatRoomSidePanelProps) {
	return (
		<div className="grid gap-4">
			<Card className="rounded-lg" pad="lg" tone="outline">
				<div className="flex items-center justify-between gap-2">
					<h2 className="m-0 font-extrabold text-lg">공고 조건</h2>
					<span className="md:hidden">
						<ChatRoomStateBadge isBlocked={isBlocked} />
					</span>
				</div>
				<div className="mt-4 grid gap-3 text-sm">
					<div className="flex items-center gap-2 font-bold">
						<span className="inline-flex size-4 text-coral-600">
							<DollarCircle />
						</span>
						{formatPay(jobPost?.payAmount, jobPost?.payUnit)}
					</div>
					<div className="flex items-center gap-2 font-bold">
						<span className="inline-flex size-4 text-coral-600">
							<ClockIcon />
						</span>
						{jobPost?.status
							? (jobStatusLabels[
									jobPost.status as keyof typeof jobStatusLabels
								] ?? jobPost.status)
							: "상태 확인"}
					</div>
				</div>
				<div className="mt-4 flex md:hidden">
					<ChatJobPostLink jobPost={jobPost} />
				</div>
			</Card>
			<Card className="rounded-lg" pad="lg" tone="outline">
				<h2 className="m-0 font-extrabold text-lg">면접 일정</h2>
				{/* 구직자에게는 제안 폼이 없다. */}
				{isJobSeeker ? null : (
					<InterviewProposalForm
						interviewAt={interviewAt}
						isPending={isProposePending}
						locationNote={locationNote}
						onLocationNoteChange={onLocationNoteChange}
						onScheduledAtChange={onScheduledAtChange}
						onSubmit={onInterviewSubmit}
					/>
				)}
				{scheduleErrorMessage ? (
					<p className="mt-3 mb-0 font-semibold text-red-600 text-xs">
						{scheduleErrorMessage}
					</p>
				) : null}
				{schedules.length === 0 ? (
					<p className="mt-3 mb-0 text-muted-foreground text-sm leading-relaxed">
						아직 제안된 면접 일정이 없어요. 채팅에서 가능한 시간을 조율해보세요.
					</p>
				) : (
					<div className="mt-3 grid gap-2">
						{schedules.map((schedule) => (
							<div
								className="rounded-lg border border-border bg-secondary p-3"
								key={schedule.id}
							>
								<div className="flex items-center justify-between gap-2">
									<strong className="text-sm">
										{formatDateTime(schedule.scheduledAt)}
									</strong>
									<Badge
										tone={
											schedule.status === "confirmed" ? "success" : "pending"
										}
									>
										{interviewStatusLabels[
											schedule.status as keyof typeof interviewStatusLabels
										] ?? schedule.status}
									</Badge>
								</div>
								{schedule.locationNote ? (
									<p className="mt-2 mb-0 text-muted-foreground text-xs">
										{schedule.locationNote}
									</p>
								) : null}
								{schedule.status === "proposed" &&
								schedule.proposedByUserId !== currentUserId ? (
									<div className="mt-3 grid grid-cols-2 gap-2">
										<Button
											className="shadow-none"
											disabled={isStatusPending}
											onClick={() =>
												setScheduleStatus(schedule.id, "confirmed")
											}
											size="md"
											variant="primary"
										>
											확정
										</Button>
										<Button
											disabled={isStatusPending}
											onClick={() => setScheduleStatus(schedule.id, "declined")}
											size="md"
											variant="secondary"
										>
											거절
										</Button>
									</div>
								) : null}
								{/* 확정 카드에는 취소만 남는다 — 완료 처리는 방을 나가도 누를 수
								    있도록 "내 정보 → 예정된 면접"으로 옮겼다. */}
								{schedule.status === "confirmed" ? (
									<Button
										block
										className="mt-3 shadow-none"
										disabled={isStatusPending}
										onClick={() => setScheduleStatus(schedule.id, "canceled")}
										size="md"
										variant="secondary"
									>
										취소
									</Button>
								) : null}
							</div>
						))}
					</div>
				)}
				<ContactRevealAction
					employerVerifiedPhone={employerVerifiedPhone}
					isJobSeeker={isJobSeeker}
					isRequesting={isRequestingContact}
					onRequest={onRequestContact}
				/>
			</Card>
			<div className="md:hidden">{safety}</div>
		</div>
	);
}

export function SeekerChatRoomResponsive({
	onBack,
	roomId,
}: SeekerChatRoomResponsiveProps) {
	const queryClient = useQueryClient();
	const router = useRouter();
	const [message, setMessage] = useState("");
	const [attachmentDraft, setAttachmentDraft] =
		useState<AttachmentDraft | null>(null);
	const [interviewAt, setInterviewAt] = useState("");
	const [locationNote, setLocationNote] = useState("");
	const [realtimeStatus, setRealtimeStatus] =
		useState<RealtimeStatus>("connecting");
	const [typingUserIds, setTypingUserIds] = useState<string[]>([]);
	const [errorMessage, setErrorMessage] = useState<null | string>(null);
	// 모바일 서랍(공고·면접·연락처·안전)과 신고 창. 신고 창은 데스크톱 안내 바와 모바일
	// 서랍이 같이 여는 자리라 여기서 한 벌만 들고 있는다.
	const [isSheetOpen, setIsSheetOpen] = useState(false);
	const [isReportOpen, setIsReportOpen] = useState(false);
	const [scheduleErrorMessage, setScheduleErrorMessage] = useState<
		null | string
	>(null);
	const attachmentInputRef = useRef<HTMLInputElement | null>(null);
	const chatPanelRef = useRef<HTMLElement | null>(null);
	const typingActiveRef = useRef(false);
	const { visualViewportHeight } = useMobileKeyboardState();

	useEffect(() => {
		const panel = chatPanelRef.current;
		if (!panel || visualViewportHeight === null) {
			return;
		}

		panel.style.setProperty(
			"--chat-visual-viewport-height",
			`${Math.round(visualViewportHeight)}px`
		);
	}, [visualViewportHeight]);
	// 모바일 채팅방은 뷰포트에 고정된 풀스크린이라 문서 스크롤이 있을 이유가 없다. iOS는
	// 키보드가 열리면 문서를 제멋대로 밀어 올리므로, 잠금과 함께 매 뷰포트 변화에서 0으로
	// 되돌린다. 데스크톱(md+)에는 아무 일도 하지 않는다.
	useEffect(() => {
		if (window.matchMedia("(min-width: 768px)").matches) {
			return;
		}

		const { body } = document;
		const previousOverflow = body.style.overflow;
		const resetScroll = () => window.scrollTo(0, 0);

		body.style.overflow = "hidden";
		resetScroll();
		window.visualViewport?.addEventListener("resize", resetScroll);
		window.visualViewport?.addEventListener("scroll", resetScroll);

		return () => {
			body.style.overflow = previousOverflow;
			window.visualViewport?.removeEventListener("resize", resetScroll);
			window.visualViewport?.removeEventListener("scroll", resetScroll);
		};
	}, []);
	// 방을 열면 최근 메시지 한 페이지만 받는다. 예전에는 이력 전체가 매 조회마다 다시
	// 내려왔고, 소켓 이벤트가 뜰 때마다 그 전량 전송이 반복됐다.
	const roomQuery = useQuery(
		orpc.bambi.chats.getById.queryOptions({
			input: { id: roomId, limit: CHAT_MESSAGE_PAGE_SIZE },
		})
	);
	// 문서가 아니라 메시지 영역만 스크롤한다.
	const {
		captureOlderAnchor,
		handleScroll,
		scrollRef,
		stickToBottom,
		syncScroll,
	} = useChatMessageScroll(roomId);
	// "이전 메시지 더 보기"로 쌓은 커서 페이지들(오래된 → 최신).
	const { canLoadOlder, isLoadingOlder, loadOlder, olderMessages } =
		useOlderChatMessages({
			latestPageCursor: roomQuery.data?.nextCursor,
			onBeforePrepend: captureOlderAnchor,
			onError: setErrorMessage,
			pageSize: CHAT_MESSAGE_PAGE_SIZE,
			roomId,
		});
	const currentSessionUserId = roomQuery.data?.currentUserId;
	const invalidateRoom = useCallback(async () => {
		// 페이지 크기가 입력에 들어가므로 부분 일치 키로 무효화한다(더 보기로 늘린
		// 페이지도 함께 갱신되게).
		await queryClient.invalidateQueries({
			queryKey: orpc.bambi.chats.getById.key({ input: { id: roomId } }),
		});
		await queryClient.invalidateQueries({
			queryKey: orpc.bambi.chats.listMine.queryKey(),
		});
	}, [queryClient, roomId]);
	const sendMessageMutation = useMutation(
		orpc.bambi.chats.sendMessage.mutationOptions({
			onError: (error) => {
				setErrorMessage(getMutationErrorMessage(error));
			},
			onSuccess: async () => {
				setMessage("");
				setErrorMessage(null);
				await invalidateRoom();
			},
		})
	);
	const createAttachmentUploadMutation = useMutation(
		orpc.bambi.chats.createAttachmentUpload.mutationOptions({
			onError: (error) => {
				setAttachmentDraft((current) =>
					current
						? {
								...current,
								errorMessage: getMutationErrorMessage(error),
								status: "error",
							}
						: current
				);
			},
		})
	);
	const sendMediaMessageMutation = useMutation(
		orpc.bambi.chats.sendMediaMessage.mutationOptions({
			onError: (error) => {
				setAttachmentDraft((current) =>
					current
						? {
								...current,
								errorMessage: getMutationErrorMessage(error),
								status: "error",
							}
						: current
				);
			},
		})
	);
	const markReadMutation = useMutation(
		orpc.bambi.chats.markRead.mutationOptions({
			// 읽음 요청이 왕복하는 사이에 목록이 다시 그려지면 방금 읽은 방에 핀이 잠깐
			// 떴다 사라진다. 보고 있는 방의 안 읽음은 먼저 0으로 눌러 두고, 성공 뒤 정본으로
			// 맞춘다(핀 숫자의 정본은 서버 집계다).
			onMutate: () => {
				queryClient.setQueryData(
					orpc.bambi.chats.listMine.queryKey(),
					(rooms) => zeroUnreadCountForRoom(rooms, roomId)
				);
			},
			onError: () => {
				setErrorMessage("읽음 상태를 반영하지 못했어요.");
			},
			onSuccess: (data) => {
				// 핀은 여기서 서버가 방금 센 총합으로 바로 덮는다. 무효화만 걸어 두면
				// 핀이 0이 되는 시점이 "재조회가 언제 도느냐"에 달리는데, 새 메시지
				// 신호로 이미 떠 있던 조회가 읽음 커밋 전 값(1)을 들고 늦게 돌아오면
				// 핀이 1에 머문다. 아래 무효화는 그 뒤 정본 대조용으로 남긴다.
				queryClient.setQueryData(orpc.bambi.chats.unreadState.queryKey(), {
					unreadMessageCount: data.totalUnreadMessageCount,
				});
				queryClient
					.invalidateQueries({
						queryKey: orpc.bambi.chats.unreadState.queryKey(),
					})
					.catch(() => undefined);
				queryClient
					.invalidateQueries({
						queryKey: orpc.bambi.chats.listMine.queryKey(),
					})
					.catch(() => undefined);
			},
		})
	);
	const proposeInterviewMutation = useMutation(
		orpc.bambi.chats.proposeInterview.mutationOptions({
			onError: (error) => {
				setScheduleErrorMessage(getMutationErrorMessage(error));
			},
			onSuccess: async () => {
				setInterviewAt("");
				setLocationNote("");
				setScheduleErrorMessage(null);
				await invalidateRoom();
			},
		})
	);
	const setInterviewStatusMutation = useMutation(
		orpc.bambi.chats.setInterviewStatus.mutationOptions({
			onError: (error) => {
				setScheduleErrorMessage(getMutationErrorMessage(error));
			},
			onSuccess: async () => {
				setScheduleErrorMessage(null);
				await invalidateRoom();
			},
		})
	);
	const blockMutation = useMutation(
		orpc.bambi.blocks.blockUser.mutationOptions({
			onError: (error) => {
				toast.error(error.message || "차단하지 못했어요.");
			},
			onSuccess: () => {
				toast.success("상대를 차단했어요.");
				router.push("/seeker/chats");
			},
		})
	);
	const requestContactRevealMutation = useMutation(
		orpc.bambi.chats.requestContactReveal.mutationOptions({
			onError: (error) => {
				toast.error(error.message || getMutationErrorMessage(error));
			},
			onSuccess: async () => {
				toast.success("연락처 공개를 요청했어요.");
				await invalidateRoom();
			},
		})
	);
	const respondContactRevealMutation = useMutation(
		orpc.bambi.chats.respondContactReveal.mutationOptions({
			onError: (error) => {
				toast.error(error.message || getMutationErrorMessage(error));
			},
			onSuccess: async (_data, variables) => {
				toast.success(
					variables.decision === "reveal"
						? "연락처를 공개했어요."
						: "연락처 공개를 거절했어요."
				);
				await invalidateRoom();
			},
		})
	);
	// 화면에 올라온 메시지 = 커서로 쌓은 이전 페이지 + 최신 페이지. 합칠 때 id가 유일
	// 키라, 큐 재처리·소켓 재전달로 같은 메시지가 두 경로로 들어와도 말풍선이 겹치지 않는다.
	const messages = useMemo(
		() =>
			mergeChatMessagesById<ChatMessageItem>(
				olderMessages,
				roomQuery.data?.messages ?? []
			),
		[olderMessages, roomQuery.data]
	);
	// 읽음 처리는 "여기까지 봤다" 기준선 하나만 보낸다. 예전에는 상대가 보낸 메시지 id를
	// 전부 실어 보냈는데 서버 상한이 50이라, 51건째부터 요청 전체가 거절돼 읽음영수증이
	// 한 건도 안 써졌다(안 읽음 뱃지가 영영 안 꺼짐). 기준선은 화면에 올라온 마지막
	// 메시지다 — 내가 보낸 것이어도 그 앞의 상대 메시지는 본 것이므로 함께 읽음이 된다.
	const lastVisibleMessageId = messages.at(-1)?.id ?? null;
	const { markReadNow, queueMarkRead, reassertMarkRead } = useChatRoomAutoRead({
		chatRoomId: roomId,
		// 성공 여부를 훅이 알아야 실패한 기준선을 다시 시도할 수 있다.
		markRead: markReadMutation.mutateAsync,
	});
	// 목록이 바뀐 뒤 레이아웃 커밋에서 스크롤 위치를 맞춘다(하단 고정·앵커 복원).
	useLayoutEffect(() => syncScroll(messages), [messages, syncScroll]);
	// 키보드가 열리면 패널이 줄면서 메시지 영역도 같이 줄어, 보고 있던 마지막 말풍선이
	// 접힌 만큼 화면 밖으로 밀린다. 높이를 바꾸는 위 effect 다음에 돌아 다시 바닥에
	// 붙인다 — 위로 올려 과거를 읽는 중이면 syncScroll이 자리를 지킨다.
	useEffect(() => {
		if (visualViewportHeight === null) {
			return;
		}

		syncScroll(messages);
	}, [messages, syncScroll, visualViewportHeight]);
	// 세션 id는 방 HTTP 조회가 끝나야 온다. 소켓 접속·입장이 그걸 기다리면 그 사이에 온
	// 상대 메시지가 방 소켓룸으로 오지 않아 핀이 남는다. 값은 ref로만 흘려 넣어 도착이
	// effect를 다시 돌리지 않게 한다(leave/join 왕복 방지).
	const currentSessionUserIdRef = useRef<string | undefined>(undefined);

	useEffect(() => {
		currentSessionUserIdRef.current = currentSessionUserId;
	}, [currentSessionUserId]);

	useEffect(() => {
		// 참여자 검증은 서버 join 가드가 한다 — 클라이언트는 URL의 방 id만으로 바로 붙는다.
		const socket = connectBambiChatSocket();
		const refreshIfCurrentRoom = (payload: { roomId: string }) => {
			if (payload.roomId === roomId) {
				invalidateRoom().catch(() => undefined);
			}
		};
		// 실시간 수신분은 정본 재조회를 기다리지 않고 바로 읽음 기준선으로 올린다. 방 데이터
		// 로드 기준으로만 markRead를 걸면 소켓으로 먼저 도착한 상대 메시지가 빠져 목록에
		// 핀이 잠깐 뜬다. 발신자는 가리지 않는다 — 기준선은 "여기까지 봤다" 한 점이라
		// 내가 보낸 메시지여도 그 앞의 상대 메시지가 함께 읽음이 되고, 중복 요청은 합쳐진다.
		const handleMessageCreated = (payload: {
			messageId: string;
			roomId: string;
		}) => {
			if (payload.roomId !== roomId) {
				return;
			}

			queueMarkRead(payload.messageId);
			invalidateRoom().catch(() => undefined);
		};
		// 재연결하면 서버 쪽 방 입장 기록이 사라져 있다(끊길 때 지운다). 다시 들어가지
		// 않으면 소켓은 붙어 있는데 방 이벤트가 한 건도 안 오고, 타이핑마다 "채팅방에 먼저
		// 입장해 주세요" 오류만 뜬다 — 상태 배지는 '연결'이라 사용자는 정상으로 오인한다.
		const joinRoom = () => {
			joinBambiChatRoom(roomId)
				.then(() => {
					setRealtimeStatus("connected");
				})
				.catch((error: unknown) => {
					setRealtimeStatus("offline");
					setErrorMessage(getRealtimeErrorMessage(error));
				});
		};
		const handleConnect = () => {
			setRealtimeStatus("connected");
			joinRoom();
			// 끊겨 있던 사이의 메시지는 방 소켓룸으로 오지 않았으므로 정본을 다시 읽는다.
			invalidateRoom().catch(() => undefined);
		};
		const handleDisconnect = () => setRealtimeStatus("offline");
		const handleRealtimeError = (payload: { message: string }) => {
			setErrorMessage(payload.message);
		};
		const handleTypingStarted = (payload: {
			roomId: string;
			userId: string;
		}) => {
			if (
				payload.roomId !== roomId ||
				payload.userId === currentSessionUserIdRef.current
			) {
				return;
			}

			setTypingUserIds((prev) =>
				prev.includes(payload.userId) ? prev : [...prev, payload.userId]
			);
		};
		// 이 방의 안 읽음이 아직 0이 아니라는 신호. 방을 보고 있는 동안 그 상태는 성립할 수
		// 없으므로, 이미 보낸 기준선이어도 읽음을 다시 주장한다(어떤 레이스로 뜬 핀이든
		// 자가 소멸). markRead 성공이 안 읽음 0 신호를 만들어 루프는 돌지 않는다.
		const handleUnreadUpdated = (payload: {
			roomId: string;
			unreadCount: number;
			userId: string;
		}) => {
			refreshIfCurrentRoom(payload);

			if (
				payload.roomId === roomId &&
				payload.unreadCount > 0 &&
				payload.userId === currentSessionUserIdRef.current
			) {
				reassertMarkRead();
			}
		};
		const handleTypingStopped = (payload: {
			roomId: string;
			userId: string;
		}) => {
			if (payload.roomId !== roomId) {
				return;
			}

			setTypingUserIds((prev) =>
				prev.filter((userId) => userId !== payload.userId)
			);
		};

		socket.on("connect", handleConnect);
		socket.on("disconnect", handleDisconnect);
		socket.on("chat:error", handleRealtimeError);
		socket.on("chat:message:created", handleMessageCreated);
		socket.on("chat:message:read", refreshIfCurrentRoom);
		socket.on("chat:room:updated", refreshIfCurrentRoom);
		socket.on("chat:unread:updated", handleUnreadUpdated);
		// 유저 채널로 오는 신호라 방 소켓룸을 잃은 상태에서도 도착한다 — 방 화면의
		// 마지막 안전망.
		socket.on("chat:list:updated", refreshIfCurrentRoom);
		socket.on("chat:typing:started", handleTypingStarted);
		socket.on("chat:typing:stopped", handleTypingStopped);
		setRealtimeStatus(socket.connected ? "connected" : "connecting");
		joinRoom();

		return () => {
			socket.off("connect", handleConnect);
			socket.off("disconnect", handleDisconnect);
			socket.off("chat:error", handleRealtimeError);
			socket.off("chat:message:created", handleMessageCreated);
			socket.off("chat:message:read", refreshIfCurrentRoom);
			socket.off("chat:room:updated", refreshIfCurrentRoom);
			socket.off("chat:unread:updated", handleUnreadUpdated);
			socket.off("chat:list:updated", refreshIfCurrentRoom);
			socket.off("chat:typing:started", handleTypingStarted);
			socket.off("chat:typing:stopped", handleTypingStopped);

			// 입력 중에 나가면 상대 화면에 "입력 중"이 유령처럼 남는다. 이건 나감 알림이
			// 아니라 내가 켠 표시를 끄는 것이라 즉시 보낸다(아직 방에 들어가 있어 통과된다).
			if (typingActiveRef.current) {
				emitBambiChatTypingStopped(roomId);
			}

			// 방 입장 정리는 30초 유예 뒤에 조용히 한다 — 상대에게 가는 표시·알림은 없다.
			// 그 안에 같은 방으로 돌아오면 join이 타이머를 취소하고 기존 입장을 그대로 쓴다.
			scheduleBambiChatRoomLeave(roomId);
			typingActiveRef.current = false;
			setTypingUserIds([]);
		};
	}, [invalidateRoom, queueMarkRead, reassertMarkRead, roomId]);

	useEffect(() => {
		if (!roomQuery.isSuccess) {
			return;
		}

		// 방 진입 HTTP 조회가 완료된 바로 그 시점에 읽음을 서버에 저장한다. 실시간
		// 수신용 합치기 큐에만 기대면 렌더 교체·이탈 타이밍에 요청이 유실될 수 있다.
		markReadNow(lastVisibleMessageId);
	}, [lastVisibleMessageId, markReadNow, roomQuery.isSuccess]);

	useEffect(() => {
		if (!roomQuery.data) {
			return;
		}

		if (!message.trim()) {
			if (typingActiveRef.current) {
				emitBambiChatTypingStopped(roomId);
				typingActiveRef.current = false;
			}
			return;
		}

		if (!typingActiveRef.current) {
			emitBambiChatTypingStarted(roomId);
			typingActiveRef.current = true;
		}

		const timeoutId = window.setTimeout(() => {
			if (typingActiveRef.current) {
				emitBambiChatTypingStopped(roomId);
				typingActiveRef.current = false;
			}
		}, 1200);

		return () => window.clearTimeout(timeoutId);
	}, [message, roomId, roomQuery.data]);

	// 차단·운영자 조치·내 신고 검토로 막힌 방은 오류 카드로 세워두지 않고 목록으로
	// 돌려보내며 이유만 토스트로 알린다. id를 고정해 StrictMode 이중 실행에도 토스트가
	// 겹치지 않는다. 상대가 나간 방은 여기서 걸리지 않는다(읽기는 그대로 열어 둔다).
	const chatBlockMessage = getChatBlockMessage(roomQuery.error);

	useEffect(() => {
		if (!chatBlockMessage) {
			return;
		}

		toast.error(chatBlockMessage, { id: "chat-room-blocked" });
		router.replace("/seeker/chats");
	}, [chatBlockMessage, router]);

	if (chatBlockMessage) {
		return (
			<div
				className={cn(
					"mx-auto w-full px-5 py-10 text-center font-bold text-muted-foreground md:px-6",
					SEEKER_CONTENT_WIDTH
				)}
			>
				채팅 목록으로 이동하고 있어요.
			</div>
		);
	}

	if (roomQuery.isLoading) {
		return (
			<div
				className={cn(
					"mx-auto w-full px-5 py-10 text-center font-bold text-muted-foreground md:px-6",
					SEEKER_CONTENT_WIDTH
				)}
			>
				채팅방을 불러오고 있어요.
			</div>
		);
	}

	if (roomQuery.isError || !roomQuery.data) {
		return (
			<div
				className={cn(
					"mx-auto w-full px-5 py-10 md:px-6",
					SEEKER_CONTENT_WIDTH
				)}
			>
				<Card className="rounded-lg text-center" pad="lg" tone="outline">
					<h1 className="m-0 font-extrabold text-xl">
						채팅방을 불러올 수 없어요
					</h1>
					<p className="mt-2 mb-4 text-muted-foreground text-sm">
						종료됐거나 접근할 수 없는 채팅방이에요.
					</p>
					<div className="flex flex-wrap justify-center gap-2">
						<Button
							className="shadow-none"
							onClick={() => router.push("/seeker/chats")}
							variant="primary"
						>
							채팅 목록으로
						</Button>
						<Button onClick={() => roomQuery.refetch()} variant="secondary">
							다시 시도
						</Button>
					</div>
				</Card>
			</div>
		);
	}

	const {
		counterpartName,
		currentUserId,
		employerVerifiedPhone,
		jobPost,
		room,
		schedules,
	} = roomQuery.data;
	const isJobSeeker = currentUserId === room.jobSeekerUserId;
	const blockedUserId = resolveBlockedUserId(isJobSeeker, room);
	const isAttachmentSubmitting =
		createAttachmentUploadMutation.isPending ||
		sendMediaMessageMutation.isPending;
	const isComposerSubmitting =
		sendMessageMutation.isPending || isAttachmentSubmitting;
	const clearAttachmentDraft = () => {
		setAttachmentDraft(null);
		if (attachmentInputRef.current) {
			attachmentInputRef.current.value = "";
		}
	};
	const handleAttachmentChange = async (
		event: React.ChangeEvent<HTMLInputElement>
	) => {
		const file = event.target.files?.[0];
		event.target.value = "";

		if (!file) {
			return;
		}

		// 이미지·PDF 모두 앞바이트(매직넘버)로 실제 형식을 확인해 확장자·MIME 위조를 거른다.
		// GIF는 채팅 허용 목록에 없어(bambi-media-policy.ts) 안내 문구에서도 뺀다.
		if (file.type.startsWith("image/")) {
			const detected = await detectImageSignature(file);
			if (isSignatureMismatch(file.type, detected)) {
				toast.error(
					"이미지 형식이 올바르지 않습니다. JPG·PNG·WebP 이미지 또는 PDF 파일만 첨부할 수 있어요."
				);
				return;
			}
		}

		if (file.type === "application/pdf" && !(await isPdfSignature(file))) {
			toast.error(
				"PDF 형식이 올바르지 않습니다. 이미지 또는 PDF 파일만 첨부할 수 있어요."
			);
			return;
		}

		const error = getAttachmentValidationError(file);
		setAttachmentDraft({
			errorMessage: error ?? undefined,
			file,
			status: error ? "error" : "selected",
		});
		setErrorMessage(null);
	};
	const handleRespondContact = (
		messageId: string,
		decision: ContactRevealDecision
	) => {
		respondContactRevealMutation.mutate({ decision, messageId });
	};
	const stopTyping = () => {
		if (typingActiveRef.current) {
			emitBambiChatTypingStopped(room.id);
			typingActiveRef.current = false;
		}
	};
	const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
		event.preventDefault();
		const body = message.trim();
		// 내가 보낸 것은 위로 올려 읽던 중이었더라도 하단으로 따라 내린다.
		stickToBottom();

		if (attachmentDraft) {
			const validationError =
				attachmentDraft.errorMessage ??
				getAttachmentValidationError(attachmentDraft.file);

			if (validationError) {
				setAttachmentDraft({
					...attachmentDraft,
					errorMessage: validationError,
					status: "error",
				});
				return;
			}

			setAttachmentDraft({
				...attachmentDraft,
				errorMessage: undefined,
				status: "uploading",
			});

			try {
				const uploadIntent = await createAttachmentUploadMutation.mutateAsync({
					byteSize: attachmentDraft.file.size,
					chatRoomId: room.id,
					fileName: attachmentDraft.file.name,
					mimeType: attachmentDraft.file.type,
				});

				// 인텐트만 받고 파일을 올리지 않으면 첨부 레코드만 남아 상대에게는 원본 대신
				// 안내 이미지가 뜬다. 공고 미디어와 같은 헬퍼로 서명 URL에 직접 PUT 한다.
				await uploadFileToSignedUrl({
					file: attachmentDraft.file,
					uploadIntent,
				});

				await sendMediaMessageMutation.mutateAsync({
					byteSize: uploadIntent.byteSize,
					chatRoomId: room.id,
					fileName: uploadIntent.fileName,
					// 메시지 id는 클라이언트가 만들어 보낸다. 서버가 PK 충돌로 재시도·더블클릭을
					// 흡수하므로 같은 전송이 두 번 들어가도 방에는 한 건만 남는다.
					messageId: generateChatMessageId(),
					mimeType: uploadIntent.mimeType,
					storageKey: uploadIntent.storageKey,
				});
				clearAttachmentDraft();
				setMessage("");
				setErrorMessage(null);
				await invalidateRoom();
				stopTyping();
			} catch (error) {
				setAttachmentDraft((current) =>
					current
						? {
								...current,
								errorMessage:
									error instanceof Error
										? getMutationErrorMessage(error)
										: "첨부 파일을 전송하지 못했어요.",
								status: "error",
							}
						: current
				);
			}
			return;
		}

		if (!body) {
			setErrorMessage("메시지를 입력해 주세요.");
			return;
		}

		sendMessageMutation.mutate({
			body,
			chatRoomId: room.id,
			messageId: generateChatMessageId(),
		});
		stopTyping();
	};
	const handleInterviewSubmit = (event: React.FormEvent<HTMLFormElement>) => {
		event.preventDefault();

		if (!interviewAt) {
			setScheduleErrorMessage("면접 일시를 선택해 주세요.");
			return;
		}

		const scheduledAt = new Date(interviewAt);

		if (!Number.isFinite(scheduledAt.getTime())) {
			setScheduleErrorMessage("면접 일시를 다시 확인해 주세요.");
			return;
		}

		proposeInterviewMutation.mutate({
			chatRoomId: room.id,
			locationNote: locationNote.trim() || undefined,
			scheduledAt: scheduledAt.toISOString(),
		});
	};
	const setScheduleStatus = (
		interviewScheduleId: string,
		status: "canceled" | "confirmed" | "declined"
	) => {
		setInterviewStatusMutation.mutate({
			interviewScheduleId,
			status,
		});
	};
	// 신고한 방은 검토가 끝날 때까지 서버가 감춘다. 창을 닫을 때 방 조회를 다시 돌려
	// "신고를 검토하고 있는 채팅이에요" 안내와 함께 목록으로 나가게 한다.
	const handleReportOpenChange = (next: boolean) => {
		setIsReportOpen(next);

		if (!next) {
			invalidateRoom().catch(() => undefined);
		}
	};
	const sidePanel = (
		<ChatRoomSidePanel
			currentUserId={currentUserId}
			employerVerifiedPhone={employerVerifiedPhone}
			interviewAt={interviewAt}
			isBlocked={room.isBlocked}
			isJobSeeker={isJobSeeker}
			isProposePending={proposeInterviewMutation.isPending}
			isRequestingContact={requestContactRevealMutation.isPending}
			isStatusPending={setInterviewStatusMutation.isPending}
			jobPost={jobPost}
			locationNote={locationNote}
			onInterviewSubmit={handleInterviewSubmit}
			onLocationNoteChange={setLocationNote}
			onRequestContact={() =>
				requestContactRevealMutation.mutate({ chatRoomId: room.id })
			}
			onScheduledAtChange={setInterviewAt}
			safety={
				<ChatSafetySheetCard
					isBlocked={room.isBlocked}
					isBlockPending={blockMutation.isPending}
					isJobSeeker={isJobSeeker}
					onBlock={() =>
						blockMutation.mutate({ blockedUserId, chatRoomId: room.id })
					}
					onReport={() => {
						setIsSheetOpen(false);
						setIsReportOpen(true);
					}}
				/>
			}
			scheduleErrorMessage={scheduleErrorMessage}
			schedules={schedules}
			setScheduleStatus={setScheduleStatus}
		/>
	);

	return (
		<div
			className={cn(
				"mx-auto grid w-full gap-5 px-5 py-5 max-md:gap-0 max-md:p-0 md:px-6 md:py-7 lg:grid-cols-[minmax(0,1fr)_320px]",
				SEEKER_CONTENT_WIDTH
			)}
		>
			{/* 대화가 길어져도 문서가 자라지 않도록 방 패널을 뷰포트에 고정하고, 스크롤은
			    메시지 영역 하나만 갖는다. 모바일은 카카오톡처럼 뷰포트를 통째로 덮어(fixed)
			    키보드가 열리면 visualViewport 높이만큼 줄어 입력창이 키보드 바로 위에 붙는다.
			    데스크톱에서 빼는 높이는 셸 헤더(4rem)와 이 컨테이너 위아래 여백(md:py-7) 합이다. */}
			<main
				className="flex min-w-0 flex-col overflow-hidden bg-card max-md:fixed max-md:inset-x-0 max-md:top-0 max-md:z-40 max-md:h-[var(--chat-visual-viewport-height,100dvh)] md:h-[calc(100dvh-7.5rem)] md:rounded-lg md:shadow-sm md:ring-1 md:ring-border lg:self-start"
				ref={chatPanelRef}
			>
				{/* 모바일 헤더 — 뒤로가기 · 상대 이름(+연결 점)·공고 제목 · 서랍 메뉴 한 줄. */}
				<header className="flex flex-none items-center gap-1 border-border border-b px-2 py-1.5 md:hidden">
					<UiButton
						aria-label="채팅 목록으로"
						className="flex-none"
						onClick={onBack}
						size="icon-lg"
						variant="ghost"
					>
						<span className="inline-flex size-5">
							<ArrowNarrowLeft />
						</span>
					</UiButton>
					<div className="min-w-0 flex-1">
						<div className="flex min-w-0 items-center gap-1.5">
							<strong className="truncate font-extrabold text-sm">
								{counterpartName ?? "공고 채팅"}
							</strong>
							<span
								aria-hidden="true"
								className={cn(
									"size-2 flex-none rounded-full",
									realtimeStatus === "connected"
										? "bg-green-500"
										: "bg-muted-foreground/40"
								)}
							/>
							<span className="sr-only">
								{getRealtimeStatusLabel(realtimeStatus)}
							</span>
						</div>
						<p className="m-0 truncate text-muted-foreground text-xs">
							{jobPost?.title ?? "공고 채팅"}
						</p>
					</div>
					<UiButton
						aria-label="채팅 정보 열기"
						className="flex-none"
						onClick={() => setIsSheetOpen(true)}
						size="icon-lg"
						variant="ghost"
					>
						<span className="inline-flex size-5">
							<MenuIcon />
						</span>
					</UiButton>
				</header>
				<header className="hidden flex-none flex-col gap-2 border-border border-b p-3 sm:p-4 md:flex">
					<div className="flex min-w-0 items-center gap-2 sm:gap-3">
						<button
							className="shrink-0 cursor-pointer rounded-lg border border-border bg-background px-3 py-2 font-bold text-sm"
							onClick={onBack}
							type="button"
						>
							목록
						</button>
						<div className="min-w-0 flex-1">
							<h1 className="m-0 truncate font-extrabold text-sm sm:text-lg">
								{jobPost?.title ?? "공고 채팅"}
							</h1>
							<ChatCounterpartName name={counterpartName} />
							<p className="mt-1 mb-0 truncate text-muted-foreground text-xs">
								{jobPost?.industryCategory ?? "공고"} ·{" "}
								{jobPost?.region ?? "지역 확인"}
							</p>
						</div>
					</div>
					<div className="flex min-w-0 items-center gap-2 overflow-hidden">
						<ChatJobPostLink jobPost={jobPost} />
						<ChatRoomStateBadge isBlocked={room.isBlocked} />
						<Badge
							tone={realtimeStatus === "connected" ? "success" : "neutral"}
						>
							{getRealtimeStatusLabel(realtimeStatus)}
						</Badge>
					</div>
				</header>
				<ChatSafetyBannerMobile />
				<ChatSafetyNotice
					isBlocked={room.isBlocked}
					isBlockPending={blockMutation.isPending}
					isJobSeeker={isJobSeeker}
					onBlock={() =>
						blockMutation.mutate({ blockedUserId, chatRoomId: room.id })
					}
					onReport={() => setIsReportOpen(true)}
				/>
				{/* 이 안쪽만 스크롤한다 — min-h-0이 없으면 flex 자식이 내용만큼 늘어나 다시
				    문서가 자란다. */}
				<div
					className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto p-4 max-md:bg-secondary"
					onScroll={handleScroll}
					ref={scrollRef}
				>
					<ChatMessageList
						canLoadOlder={canLoadOlder}
						counterpartName={counterpartName}
						currentUserId={currentUserId}
						isLoadingOlder={isLoadingOlder}
						isResponding={respondContactRevealMutation.isPending}
						messages={messages}
						onLoadOlder={() => loadOlder(messages)}
						onRespond={handleRespondContact}
						typingUserIds={typingUserIds}
						viewerIsEmployer={!isJobSeeker}
					/>
				</div>
				<ChatComposer
					attachmentDraft={attachmentDraft}
					attachmentInputRef={attachmentInputRef}
					isAttachmentSubmitting={isAttachmentSubmitting}
					isComposerSubmitting={isComposerSubmitting}
					message={message}
					onAttachmentChange={handleAttachmentChange}
					onClearAttachment={clearAttachmentDraft}
					onMessageChange={setMessage}
					onSubmit={handleSubmit}
				/>
				{errorMessage ? (
					<div className="flex-none border-border border-t px-4 py-3 font-semibold text-red-600 text-sm">
						{errorMessage}
					</div>
				) : null}
			</main>
			<aside className="min-w-0 max-md:hidden">
				<div className="sticky top-20">{sidePanel}</div>
			</aside>
			{/* 모바일 서랍 — 헤더 메뉴로 열리며 데스크톱 사이드바와 같은 내용을 담는다. */}
			<Sheet onOpenChange={setIsSheetOpen} open={isSheetOpen}>
				<SheetContent>
					<SheetTitle className="mb-4">채팅 정보</SheetTitle>
					{sidePanel}
				</SheetContent>
			</Sheet>
			{isJobSeeker ? (
				<ReportDialog
					onOpenChange={handleReportOpenChange}
					open={isReportOpen}
					targetId={room.id}
					targetType="chat_room"
				/>
			) : null}
		</div>
	);
}
