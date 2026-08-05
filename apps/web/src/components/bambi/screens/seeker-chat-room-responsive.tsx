"use client";

import { Button as UiButton } from "@bambi-app/ui/components/button";
import { Input } from "@bambi-app/ui/components/input";
import {
	Message,
	MessageContent,
	MessageGroup,
} from "@bambi-app/ui/components/message";
import { cn } from "@bambi-app/ui/lib/utils";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { Route } from "next";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
	type ReactNode,
	useCallback,
	useEffect,
	useMemo,
	useRef,
	useState,
} from "react";
import { toast } from "sonner";
import {
	COUNTERPART_LEFT_NOTICE,
	getChatBlockMessage,
	getChatEntryBlockMessage,
} from "@/lib/bambi/chat-block";
import {
	detectImageSignature,
	isPdfSignature,
	isSignatureMismatch,
} from "@/lib/bambi/image-signature";
import { SEEKER_CONTENT_WIDTH } from "@/lib/bambi/layout";
import {
	connectBambiChatSocket,
	emitBambiChatTypingStarted,
	emitBambiChatTypingStopped,
	joinBambiChatRoom,
	leaveBambiChatRoom,
} from "@/lib/bambi-chat-realtime";
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
import { Badge, Button, Card } from "../ds";
import { FieldLabel } from "../form-message";
import {
	ClockIcon,
	DollarCircle,
	Message as MessageIcon,
	PaperclipIcon,
	ShieldIcon,
	XIcon,
} from "../icons";
import { ReportDialog } from "../report-dialog";
import { ReviewForm } from "../review-form";

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

/**
 * 상대가 방을 나가 발신이 막혔을 때 입력창 위에 붙일 안내.
 * 상대 이름을 알면 누구인지까지 밝혀, 방을 잘못 찾아온 게 아님을 분명히 한다.
 */
const getComposerDisabledNotice = ({
	counterpartLeft,
	counterpartName,
}: {
	counterpartLeft: boolean;
	counterpartName: null | string;
}): null | string => {
	if (!counterpartLeft) {
		return null;
	}

	return counterpartName
		? `${counterpartName}님이 채팅방을 나가서 더 이상 메시지를 보낼 수 없어요.`
		: COUNTERPART_LEFT_NOTICE;
};

const getReviewMutationErrorMessage = (error: Error): string => {
	if ("code" in error && error.code === "BAD_REQUEST") {
		return "별점과 후기 내용을 다시 확인해 주세요.";
	}

	if ("code" in error && error.code === "CONFLICT") {
		return "이미 이 채팅방의 후기를 등록했어요.";
	}

	if ("code" in error && error.code === "FORBIDDEN") {
		return "확정된 면접 이후에만 후기를 남길 수 있어요.";
	}

	return getMutationErrorMessage(error);
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
			? `${counterpartName}님께서 연락처를 공개했습니다: ${revealedPhone ?? "확인 필요"}`
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
function ChatMessageBubble({
	currentUserId,
	message,
}: {
	currentUserId: string;
	message: ChatMessageItem;
}) {
	const mine = message.senderUserId === currentUserId;
	const attachments = message.attachments ?? [];

	return (
		<Message align={mine ? "end" : "start"}>
			<MessageContent
				className={cn(
					"w-fit max-w-[78%] rounded-lg px-4 py-2",
					mine ? "bg-coral-500 text-white" : "bg-secondary text-foreground"
				)}
			>
				{attachments.length === 0 ? (
					<p className="m-0 whitespace-pre-wrap text-sm leading-relaxed">
						{message.body}
					</p>
				) : (
					<div className="grid gap-2">
						{attachments.map((attachment) => (
							<ChatAttachmentPreview
								attachment={attachment}
								key={attachment.id}
								mine={mine}
							/>
						))}
					</div>
				)}
				<p className="mt-1 mb-0 text-[11px] opacity-70">
					{formatDateTime(message.createdAt)}
				</p>
			</MessageContent>
		</Message>
	);
}

// contact_request 특수 렌더. 중앙 정렬 시스템 카드 + 대상 구직자의 pending 응답 버튼.
function ContactRequestMessage({
	counterpartName,
	currentUserId,
	isResponding,
	isSendBlocked,
	message,
	onRespond,
	viewerIsEmployer,
}: {
	counterpartName: null | string;
	currentUserId: string;
	isResponding: boolean;
	isSendBlocked: boolean;
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
	// 상대가 방을 나갔으면 응답을 보낼 곳이 없다(서버도 같은 이유로 거절한다).
	const canRespond =
		!isSendBlocked &&
		metadata.status === "pending" &&
		metadata.targetUserId === currentUserId;

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
	counterpartName: null | string;
	currentUserId: string;
	isResponding: boolean;
	isSendBlocked: boolean;
	messages: ChatMessageItem[];
	onRespond: (messageId: string, decision: ContactRevealDecision) => void;
	typingUserIds: string[];
	viewerIsEmployer: boolean;
}

function ChatMessageList({
	counterpartName,
	currentUserId,
	isResponding,
	isSendBlocked,
	messages,
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
			{messages.map((chatMessage) =>
				chatMessage.kind === "contact_request" ? (
					<ContactRequestMessage
						counterpartName={counterpartName}
						currentUserId={currentUserId}
						isResponding={isResponding}
						isSendBlocked={isSendBlocked}
						key={chatMessage.id}
						message={chatMessage}
						onRespond={onRespond}
						viewerIsEmployer={viewerIsEmployer}
					/>
				) : (
					<ChatMessageBubble
						currentUserId={currentUserId}
						key={chatMessage.id}
						message={chatMessage}
					/>
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
	disabledNotice: null | string;
	isAttachmentSubmitting: boolean;
	isComposerSubmitting: boolean;
	message: string;
	onAttachmentChange: (event: React.ChangeEvent<HTMLInputElement>) => void;
	onClearAttachment: () => void;
	onMessageChange: (value: string) => void;
	onSubmit: (event: React.FormEvent<HTMLFormElement>) => void;
}

// disabledNotice가 있으면 발신이 막힌 방(상대가 나감 등)이다. 입력창을 지우지 않고
// 잠근 채 이유를 위에 붙여, 지난 대화를 계속 읽으면서도 왜 못 보내는지 알게 한다.
function ChatComposer({
	attachmentDraft,
	attachmentInputRef,
	disabledNotice,
	isAttachmentSubmitting,
	isComposerSubmitting,
	message,
	onAttachmentChange,
	onClearAttachment,
	onMessageChange,
	onSubmit,
}: ChatComposerProps) {
	const isDisabled = Boolean(disabledNotice);

	return (
		<div className="border-border border-t">
			{disabledNotice ? (
				<p className="m-0 border-border border-b bg-muted px-4 py-3 text-center font-bold text-muted-foreground text-sm">
					{disabledNotice}
				</p>
			) : null}
			{attachmentDraft ? (
				<AttachmentDraftPanel
					attachmentDraft={attachmentDraft}
					isAttachmentSubmitting={isAttachmentSubmitting}
					onClear={onClearAttachment}
				/>
			) : null}
			<form className="flex items-center gap-2 p-4" onSubmit={onSubmit}>
				<label
					aria-label="파일 첨부"
					className={cn(
						"inline-flex size-11 flex-none items-center justify-center rounded-lg border border-border bg-background text-muted-foreground focus-within:ring-2 focus-within:ring-coral-100",
						isDisabled
							? "pointer-events-none opacity-50"
							: "cursor-pointer hover:text-foreground"
					)}
					title="파일 첨부"
				>
					<input
						accept={ACCEPTED_ATTACHMENT_MIME_TYPES.join(",")}
						className="sr-only"
						disabled={isDisabled}
						onChange={onAttachmentChange}
						ref={attachmentInputRef}
						type="file"
					/>
					<span className="inline-flex size-5">
						<PaperclipIcon />
					</span>
				</label>
				<label className="sr-only" htmlFor="chat-message">
					메시지
				</label>
				<input
					className="h-11 min-w-0 flex-1 rounded-lg border border-border bg-background px-4 text-sm outline-none focus-visible:ring-2 focus-visible:ring-coral-100 disabled:cursor-not-allowed disabled:opacity-60"
					disabled={isDisabled}
					id="chat-message"
					onChange={(event) => onMessageChange(event.target.value)}
					placeholder={
						isDisabled ? "메시지를 보낼 수 없어요" : "메시지를 입력하세요"
					}
					value={message}
				/>
				<Button
					disabled={
						isDisabled ||
						isComposerSubmitting ||
						attachmentDraft?.status === "error" ||
						!(message.trim() || attachmentDraft)
					}
					rightIcon={<MessageIcon />}
					size="md"
					type="submit"
				>
					{isAttachmentSubmitting ? "업로드 중" : "전송"}
				</Button>
			</form>
		</div>
	);
}

interface ReviewSidebarCardReview {
	body: string;
	rating: number;
	status: string;
}

interface ReviewSidebarCardProps {
	canCreateReview: boolean;
	errorMessage: null | string;
	existingReview?: ReviewSidebarCardReview;
	isLoading: boolean;
	isSubmitting: boolean;
	isVisible: boolean;
	onSubmit: (input: {
		body: string;
		isAnonymous: boolean;
		rating: number;
	}) => void;
	successMessage: null | string;
}

function ReviewSidebarCard({
	canCreateReview,
	errorMessage,
	existingReview,
	isLoading,
	isSubmitting,
	isVisible,
	onSubmit,
	successMessage,
}: ReviewSidebarCardProps) {
	if (!isVisible) {
		return null;
	}

	let content: ReactNode;

	if (isLoading) {
		content = (
			<p className="mt-4 mb-0 text-muted-foreground text-sm">
				후기 상태를 확인하고 있어요.
			</p>
		);
	} else if (existingReview) {
		const title =
			existingReview.status === "pending_review"
				? "검수 중인 후기"
				: "등록된 후기";

		content = (
			<div className="mt-4 rounded-lg border border-border bg-secondary p-3">
				<strong className="text-sm">{title}</strong>
				<p className="mt-1 mb-0 text-muted-foreground text-xs leading-relaxed">
					별점 {existingReview.rating.toFixed(1)} · {existingReview.body}
				</p>
			</div>
		);
	} else if (canCreateReview) {
		content = (
			<div className="mt-4">
				<ReviewForm
					errorMessage={errorMessage}
					isSubmitting={isSubmitting}
					onSubmit={onSubmit}
				/>
				{successMessage ? (
					<p className="mt-3 mb-0 font-semibold text-green-700 text-xs">
						{successMessage}
					</p>
				) : null}
			</div>
		);
	} else {
		content = (
			<p className="mt-4 mb-0 text-muted-foreground text-sm">
				후기를 등록할 수 없는 채팅방입니다.
			</p>
		);
	}

	return (
		<Card className="rounded-lg" pad="lg" tone="outline">
			<div className="flex items-start justify-between gap-3">
				<div>
					<h2 className="m-0 font-extrabold text-lg">후기 남기기</h2>
					<p className="mt-1 mb-0 text-muted-foreground text-sm leading-relaxed">
						면접 이후 경험을 남기면 다른 구직자가 업체를 더 잘 판단할 수 있어요.
					</p>
				</div>
				<Badge tone={existingReview ? "success" : "pending"}>
					{existingReview ? "작성 완료" : "작성 가능"}
				</Badge>
			</div>
			{content}
		</Card>
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

// 헤더 상태 배지. 운영자 차단이 가장 강한 상태고, 그다음이 "상대가 나감"(읽기만 가능)이다.
function ChatRoomStateBadge({
	counterpartLeft,
	isBlocked,
}: {
	counterpartLeft: boolean;
	isBlocked: boolean;
}) {
	if (isBlocked) {
		return <Badge tone="danger">차단됨</Badge>;
	}

	if (counterpartLeft) {
		return <Badge tone="neutral">상대방 나감</Badge>;
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

// 헤더 아래 "연락처 보호 중" 안내 바 — 신고·차단 진입점을 함께 담는다.
// 채팅 신고는 구직자 전용이라(서버 createReport도 같은 기준으로 막는다) 구인자에게는
// 차단하기만 남기고 안내 문구도 차단 기준으로 바꾼다. 차단은 양쪽 모두 쓸 수 있다.
// 확인 단계·신고 창 열림 상태는 이 바 밖에서 쓰이지 않아 여기서 갖고 있는다.
function ChatSafetyNotice({
	chatRoomId,
	isBlocked,
	isBlockPending,
	isJobSeeker,
	onBlock,
}: {
	chatRoomId: string;
	isBlocked: boolean;
	isBlockPending: boolean;
	isJobSeeker: boolean;
	onBlock: () => void;
}) {
	const queryClient = useQueryClient();
	const [isBlockConfirmOpen, setIsBlockConfirmOpen] = useState(false);
	const [isReportOpen, setIsReportOpen] = useState(false);
	// 신고한 방은 검토가 끝날 때까지 서버가 감춘다. 창을 닫을 때 방 조회를 다시 돌려
	// "신고를 검토하고 있는 채팅이에요" 안내와 함께 목록으로 나가게 한다.
	const handleReportOpenChange = (next: boolean) => {
		setIsReportOpen(next);

		if (!next) {
			queryClient
				.invalidateQueries({
					queryKey: orpc.bambi.chats.getById.queryKey({
						input: { id: chatRoomId },
					}),
				})
				.catch(() => undefined);
		}
	};

	return (
		<div className="border-coral-100 border-b bg-coral-50 px-4 py-3 text-coral-700">
			<div className="flex items-center justify-between gap-3">
				<div className="flex items-center gap-2 font-extrabold text-sm">
					<span className="inline-flex size-4">
						<ShieldIcon />
					</span>
					면접 확정 전 연락처 보호 중
				</div>
				<div className="flex items-center gap-2">
					{isJobSeeker ? (
						<Button
							onClick={() => setIsReportOpen(true)}
							size="sm"
							variant="secondary"
						>
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
			{isJobSeeker ? (
				<ReportDialog
					onOpenChange={handleReportOpenChange}
					open={isReportOpen}
					targetId={chatRoomId}
					targetType="chat_room"
				/>
			) : null}
		</div>
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
	return (
		<form className="mt-4 grid gap-3" onSubmit={onSubmit}>
			<div className="flex flex-col gap-2">
				<FieldLabel htmlFor="interview-at">면접 일시</FieldLabel>
				<Input
					id="interview-at"
					min={new Date().toISOString().slice(0, 16)}
					onChange={(event) => onScheduledAtChange(event.target.value)}
					required
					type="datetime-local"
					value={interviewAt}
				/>
			</div>
			<div className="flex flex-col gap-2">
				<FieldLabel htmlFor="location-note" optional>
					장소 메모
				</FieldLabel>
				<Input
					id="location-note"
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
	isSendBlocked,
	onRequest,
}: {
	employerVerifiedPhone: null | string;
	isJobSeeker: boolean;
	isRequesting: boolean;
	isSendBlocked: boolean;
	onRequest: () => void;
}) {
	if (!isJobSeeker) {
		// 구직자가 나간 방에서는 요청을 받아 줄 사람이 없다 — 버튼을 아예 감춘다.
		if (isSendBlocked) {
			return null;
		}

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
					{employerVerifiedPhone}
				</a>
				<span className="text-muted-foreground text-xs">
					밤비알바 보고 연락드렸다고 하시면 정확한 상담을 받으실 수 있어요.
				</span>
			</span>
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
	const [scheduleErrorMessage, setScheduleErrorMessage] = useState<
		null | string
	>(null);
	const [reviewErrorMessage, setReviewErrorMessage] = useState<null | string>(
		null
	);
	const [reviewSuccessMessage, setReviewSuccessMessage] = useState<
		null | string
	>(null);
	const attachmentInputRef = useRef<HTMLInputElement | null>(null);
	const lastReadMessageSignatureRef = useRef("");
	const typingActiveRef = useRef(false);
	const roomQuery = useQuery(
		orpc.bambi.chats.getById.queryOptions({ input: { id: roomId } })
	);
	const currentSessionUserId = roomQuery.data?.currentUserId;
	const reviewListQuery = useQuery({
		...orpc.bambi.reviews.listMine.queryOptions(),
		enabled: Boolean(currentSessionUserId),
	});
	const invalidateRoom = useCallback(async () => {
		await queryClient.invalidateQueries({
			queryKey: orpc.bambi.chats.getById.queryKey({ input: { id: roomId } }),
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
			onError: () => {
				setErrorMessage("읽음 상태를 반영하지 못했어요.");
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
	const createReviewMutation = useMutation(
		orpc.bambi.reviews.create.mutationOptions({
			onError: (error) => {
				setReviewSuccessMessage(null);
				setReviewErrorMessage(getReviewMutationErrorMessage(error));
			},
			onSuccess: async () => {
				setReviewErrorMessage(null);
				setReviewSuccessMessage("후기가 등록됐어요.");
				await queryClient.invalidateQueries({
					queryKey: orpc.bambi.reviews.listMine.queryKey(),
				});
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
	const readCandidateMessageIds = useMemo(() => {
		if (!roomQuery.data) {
			return [];
		}

		return roomQuery.data.messages
			.filter(
				(chatMessage) => chatMessage.senderUserId !== currentSessionUserId
			)
			.map((chatMessage) => chatMessage.id);
	}, [currentSessionUserId, roomQuery.data]);
	const readCandidateMessageIdsSignature = readCandidateMessageIds.join("|");

	useEffect(() => {
		if (!currentSessionUserId) {
			return;
		}

		const socket = connectBambiChatSocket();
		const refreshIfCurrentRoom = (payload: { roomId: string }) => {
			if (payload.roomId === roomId) {
				invalidateRoom().catch(() => undefined);
			}
		};
		const handleConnect = () => setRealtimeStatus("connected");
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
				payload.userId === currentSessionUserId
			) {
				return;
			}

			setTypingUserIds((prev) =>
				prev.includes(payload.userId) ? prev : [...prev, payload.userId]
			);
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
		socket.on("chat:message:created", refreshIfCurrentRoom);
		socket.on("chat:message:read", refreshIfCurrentRoom);
		socket.on("chat:room:updated", refreshIfCurrentRoom);
		socket.on("chat:unread:updated", refreshIfCurrentRoom);
		socket.on("chat:typing:started", handleTypingStarted);
		socket.on("chat:typing:stopped", handleTypingStopped);
		setRealtimeStatus(socket.connected ? "connected" : "connecting");
		joinBambiChatRoom(roomId).catch((error) => {
			setRealtimeStatus("offline");
			setErrorMessage(
				error instanceof Error
					? error.message
					: "실시간 채팅 연결을 확인해 주세요."
			);
		});

		return () => {
			socket.off("connect", handleConnect);
			socket.off("disconnect", handleDisconnect);
			socket.off("chat:error", handleRealtimeError);
			socket.off("chat:message:created", refreshIfCurrentRoom);
			socket.off("chat:message:read", refreshIfCurrentRoom);
			socket.off("chat:room:updated", refreshIfCurrentRoom);
			socket.off("chat:unread:updated", refreshIfCurrentRoom);
			socket.off("chat:typing:started", handleTypingStarted);
			socket.off("chat:typing:stopped", handleTypingStopped);
			leaveBambiChatRoom(roomId);
			typingActiveRef.current = false;
			setTypingUserIds([]);
		};
	}, [currentSessionUserId, invalidateRoom, roomId]);

	useEffect(() => {
		if (!(roomQuery.data && readCandidateMessageIdsSignature)) {
			return;
		}

		if (
			lastReadMessageSignatureRef.current === readCandidateMessageIdsSignature
		) {
			return;
		}

		lastReadMessageSignatureRef.current = readCandidateMessageIdsSignature;
		markReadMutation.mutate({
			chatRoomId: roomId,
			messageIds: readCandidateMessageIds,
		});
	}, [
		markReadMutation,
		readCandidateMessageIds,
		readCandidateMessageIdsSignature,
		roomId,
		roomQuery.data,
	]);

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
	const chatBlockMessage = getChatEntryBlockMessage(roomQuery.error);

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
						로그인 상태나 채팅방 접근 권한을 확인해 주세요.
					</p>
					<div className="flex flex-wrap justify-center gap-2">
						<Button
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
		counterpartLeft,
		counterpartName,
		currentUserId,
		employerVerifiedPhone,
		jobPost,
		messages,
		room,
		schedules,
	} = roomQuery.data;
	const isJobSeeker = currentUserId === room.jobSeekerUserId;
	const composerDisabledNotice = getComposerDisabledNotice({
		counterpartLeft,
		counterpartName,
	});
	const blockedUserId = resolveBlockedUserId(isJobSeeker, room);
	const isAttachmentSubmitting =
		createAttachmentUploadMutation.isPending ||
		sendMediaMessageMutation.isPending;
	const isComposerSubmitting =
		sendMessageMutation.isPending || isAttachmentSubmitting;
	// 완료된 면접도 확정을 거친 것이라 연락처 열람·후기 작성을 계속 허용한다.
	const eligibleSchedule = schedules.find(
		(schedule) =>
			schedule.status === "confirmed" || schedule.status === "completed"
	);
	const existingReview = reviewListQuery.data?.find(
		(item) => item.chatRoomId === room.id
	);
	const canCreateReview =
		isJobSeeker &&
		Boolean(eligibleSchedule) &&
		!existingReview &&
		!room.isBlocked &&
		!reviewListQuery.isError &&
		!reviewListQuery.isLoading;
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
		status: "canceled" | "completed" | "confirmed" | "declined"
	) => {
		setInterviewStatusMutation.mutate({
			interviewScheduleId,
			status,
		});
	};
	const handleReviewSubmit = ({
		body,
		isAnonymous,
		rating,
	}: {
		body: string;
		isAnonymous: boolean;
		rating: number;
	}) => {
		createReviewMutation.mutate({
			body,
			chatRoomId: room.id,
			isAnonymous,
			rating,
		});
	};

	return (
		<div
			className={cn(
				"mx-auto grid w-full gap-5 px-5 py-5 pb-28 md:px-6 md:py-7 lg:grid-cols-[minmax(0,1fr)_320px] lg:pb-8",
				SEEKER_CONTENT_WIDTH
			)}
		>
			<main className="min-w-0 rounded-lg bg-card shadow-sm ring-1 ring-border lg:self-start">
				{/* 좁은 화면에서는 공고 버튼·배지가 제목 아래로 접히도록 wrap 한다. */}
				<header className="flex flex-wrap items-center gap-3 border-border border-b p-4">
					<button
						className="cursor-pointer rounded-lg border border-border bg-background px-3 py-2 font-bold text-sm"
						onClick={onBack}
						type="button"
					>
						목록
					</button>
					<div className="min-w-0 flex-1">
						<h1 className="m-0 truncate font-extrabold text-lg">
							{jobPost?.title ?? "공고 채팅"}
						</h1>
						<ChatCounterpartName name={counterpartName} />
						<p className="mt-1 mb-0 truncate text-muted-foreground text-xs">
							{jobPost?.industryCategory ?? "공고"} ·{" "}
							{jobPost?.region ?? "지역 확인"}
						</p>
					</div>
					<ChatJobPostLink jobPost={jobPost} />
					<ChatRoomStateBadge
						counterpartLeft={counterpartLeft}
						isBlocked={room.isBlocked}
					/>
					<Badge tone={realtimeStatus === "connected" ? "success" : "neutral"}>
						{getRealtimeStatusLabel(realtimeStatus)}
					</Badge>
				</header>
				<ChatSafetyNotice
					chatRoomId={room.id}
					isBlocked={room.isBlocked}
					isBlockPending={blockMutation.isPending}
					isJobSeeker={isJobSeeker}
					onBlock={() =>
						blockMutation.mutate({ blockedUserId, chatRoomId: room.id })
					}
				/>
				<div className="flex min-h-[420px] flex-col gap-3 p-4">
					<ChatMessageList
						counterpartName={counterpartName}
						currentUserId={currentUserId}
						isResponding={respondContactRevealMutation.isPending}
						isSendBlocked={counterpartLeft}
						messages={messages}
						onRespond={handleRespondContact}
						typingUserIds={typingUserIds}
						viewerIsEmployer={!isJobSeeker}
					/>
				</div>
				<ChatComposer
					attachmentDraft={attachmentDraft}
					attachmentInputRef={attachmentInputRef}
					disabledNotice={composerDisabledNotice}
					isAttachmentSubmitting={isAttachmentSubmitting}
					isComposerSubmitting={isComposerSubmitting}
					message={message}
					onAttachmentChange={handleAttachmentChange}
					onClearAttachment={clearAttachmentDraft}
					onMessageChange={setMessage}
					onSubmit={handleSubmit}
				/>
				{errorMessage ? (
					<div className="border-border border-t px-4 py-3 font-semibold text-red-600 text-sm">
						{errorMessage}
					</div>
				) : null}
			</main>
			<aside className="min-w-0">
				<div className="sticky top-20 grid gap-4">
					<Card className="rounded-lg" pad="lg" tone="outline">
						<h2 className="m-0 font-extrabold text-lg">공고 조건</h2>
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
					</Card>
					<Card className="rounded-lg" pad="lg" tone="outline">
						<h2 className="m-0 font-extrabold text-lg">면접 일정</h2>
						{/* 구직자에게는 제안 폼이 없고, 구직자가 나간 방에서는 구인자에게도 감춘다. */}
						{isJobSeeker || counterpartLeft ? null : (
							<InterviewProposalForm
								interviewAt={interviewAt}
								isPending={proposeInterviewMutation.isPending}
								locationNote={locationNote}
								onLocationNoteChange={setLocationNote}
								onScheduledAtChange={setInterviewAt}
								onSubmit={handleInterviewSubmit}
							/>
						)}
						{scheduleErrorMessage ? (
							<p className="mt-3 mb-0 font-semibold text-red-600 text-xs">
								{scheduleErrorMessage}
							</p>
						) : null}
						{schedules.length === 0 ? (
							<p className="mt-3 mb-0 text-muted-foreground text-sm leading-relaxed">
								아직 제안된 면접 일정이 없어요. 채팅에서 가능한 시간을
								조율해보세요.
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
													schedule.status === "confirmed"
														? "success"
														: "pending"
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
													disabled={setInterviewStatusMutation.isPending}
													onClick={() =>
														setScheduleStatus(schedule.id, "confirmed")
													}
													size="md"
													variant="primary"
												>
													확정
												</Button>
												<Button
													disabled={setInterviewStatusMutation.isPending}
													onClick={() =>
														setScheduleStatus(schedule.id, "declined")
													}
													size="md"
													variant="secondary"
												>
													거절
												</Button>
											</div>
										) : null}
										{schedule.status === "confirmed" ? (
											<div className="mt-3 grid grid-cols-2 gap-2">
												<Button
													disabled={setInterviewStatusMutation.isPending}
													onClick={() =>
														setScheduleStatus(schedule.id, "completed")
													}
													size="md"
													variant="secondary"
												>
													완료
												</Button>
												<Button
													disabled={setInterviewStatusMutation.isPending}
													onClick={() =>
														setScheduleStatus(schedule.id, "canceled")
													}
													size="md"
													variant="secondary"
												>
													취소
												</Button>
											</div>
										) : null}
									</div>
								))}
							</div>
						)}
						<ContactRevealAction
							employerVerifiedPhone={employerVerifiedPhone}
							isJobSeeker={isJobSeeker}
							isRequesting={requestContactRevealMutation.isPending}
							isSendBlocked={counterpartLeft}
							onRequest={() =>
								requestContactRevealMutation.mutate({ chatRoomId: room.id })
							}
						/>
					</Card>
					<ReviewSidebarCard
						canCreateReview={canCreateReview}
						errorMessage={reviewErrorMessage}
						existingReview={existingReview}
						isLoading={reviewListQuery.isLoading}
						isSubmitting={createReviewMutation.isPending}
						isVisible={isJobSeeker && Boolean(eligibleSchedule)}
						onSubmit={handleReviewSubmit}
						successMessage={reviewSuccessMessage}
					/>
				</div>
			</aside>
		</div>
	);
}
