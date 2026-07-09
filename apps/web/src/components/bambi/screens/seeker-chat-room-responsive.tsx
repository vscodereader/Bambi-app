"use client";

import { Button as UiButton } from "@bambi-app/ui/components/button";
import { Input } from "@bambi-app/ui/components/input";
import { cn } from "@bambi-app/ui/lib/utils";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
	type ReactNode,
	useCallback,
	useEffect,
	useMemo,
	useRef,
	useState,
} from "react";
import { SEEKER_CONTENT_WIDTH } from "@/lib/bambi/layout";
import {
	connectBambiChatSocket,
	emitBambiChatTypingStarted,
	emitBambiChatTypingStopped,
	joinBambiChatRoom,
	leaveBambiChatRoom,
} from "@/lib/bambi-chat-realtime";
import { interviewStatusLabels, jobStatusLabels } from "@/lib/bambi-options";
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
	Message,
	PaperclipIcon,
	ShieldIcon,
	XIcon,
} from "../icons";
import { ReviewForm } from "../review-form";

interface SeekerChatRoomResponsiveProps {
	onBack: () => void;
	onReveal: () => void;
	roomId: string;
}

const formatDateTime = (value: Date | string): string =>
	new Intl.DateTimeFormat("ko-KR", {
		dateStyle: "medium",
		timeStyle: "short",
	}).format(new Date(value));

const formatPay = (amount?: number, unit?: string): string => {
	if (!(amount && unit)) {
		return "채팅으로 확인";
	}
	return `${unit} ${amount.toLocaleString("ko-KR")}원`;
};

const ACCEPTED_ATTACHMENT_MIME_TYPES = [
	"image/jpeg",
	"image/png",
	"image/webp",
	"application/pdf",
] as const;
const IMAGE_ATTACHMENT_MAX_BYTES = 8 * 1024 * 1024;
const PDF_ATTACHMENT_MAX_BYTES = 10 * 1024 * 1024;

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

	const maxBytes =
		file.type === "application/pdf"
			? PDF_ATTACHMENT_MAX_BYTES
			: IMAGE_ATTACHMENT_MAX_BYTES;

	if (file.size > maxBytes) {
		return file.type === "application/pdf"
			? "PDF는 10 MB 이하만 첨부할 수 있어요."
			: "이미지는 8 MB 이하만 첨부할 수 있어요.";
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

	if ("code" in error && error.code === "FORBIDDEN") {
		return "권한이 없거나 차단된 채팅방입니다.";
	}

	return "요청을 처리하지 못했어요. 잠시 후 다시 시도해 주세요.";
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
	senderUserId: string;
}

interface ChatMessageListProps {
	currentUserId: string;
	messages: ChatMessageItem[];
	typingUserIds: string[];
}

function ChatMessageList({
	currentUserId,
	messages,
	typingUserIds,
}: ChatMessageListProps) {
	if (messages.length === 0) {
		return (
			<div className="m-auto text-center text-muted-foreground text-sm">
				아직 메시지가 없어요. 안전하게 첫 메시지를 보내보세요.
			</div>
		);
	}

	return (
		<>
			{messages.map((chatMessage) => {
				const mine = chatMessage.senderUserId === currentUserId;
				const attachments = chatMessage.attachments ?? [];

				return (
					<div
						className={mine ? "flex justify-end" : "flex justify-start"}
						key={chatMessage.id}
					>
						<div
							className={
								mine
									? "max-w-[78%] rounded-lg bg-coral-500 px-4 py-2 text-white"
									: "max-w-[78%] rounded-lg bg-secondary px-4 py-2 text-foreground"
							}
						>
							{attachments.length === 0 ? (
								<p className="m-0 whitespace-pre-wrap text-sm leading-relaxed">
									{chatMessage.body}
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
								{formatDateTime(chatMessage.createdAt)}
							</p>
						</div>
					</div>
				);
			})}
			{typingUserIds.length > 0 ? (
				<div className="flex justify-start">
					<div className="max-w-[78%] rounded-lg border border-coral-200 px-4 py-2 font-semibold text-coral-700 text-xs">
						상대가 입력 중이에요
					</div>
				</div>
			) : null}
		</>
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
	return (
		<div className="border-border border-t">
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
					className="inline-flex size-11 flex-none cursor-pointer items-center justify-center rounded-lg border border-border bg-background text-muted-foreground focus-within:ring-2 focus-within:ring-coral-100 hover:text-foreground"
					title="파일 첨부"
				>
					<input
						accept={ACCEPTED_ATTACHMENT_MIME_TYPES.join(",")}
						className="sr-only"
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
					className="h-11 min-w-0 flex-1 rounded-lg border border-border bg-background px-4 text-sm outline-none focus-visible:ring-2 focus-visible:ring-coral-100"
					id="chat-message"
					onChange={(event) => onMessageChange(event.target.value)}
					placeholder="메시지를 입력하세요"
					value={message}
				/>
				<Button
					disabled={
						isComposerSubmitting ||
						attachmentDraft?.status === "error" ||
						!(message.trim() || attachmentDraft)
					}
					rightIcon={<Message />}
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
	onSubmit: (input: { body: string; rating: number }) => void;
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

export function SeekerChatRoomResponsive({
	onBack,
	onReveal,
	roomId,
}: SeekerChatRoomResponsiveProps) {
	const queryClient = useQueryClient();
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
					<Button onClick={() => roomQuery.refetch()} variant="secondary">
						다시 시도
					</Button>
				</Card>
			</div>
		);
	}

	const { counterpartName, currentUserId, jobPost, messages, room, schedules } =
		roomQuery.data;
	const isJobSeeker = currentUserId === room.jobSeekerUserId;
	const isAttachmentSubmitting =
		createAttachmentUploadMutation.isPending ||
		sendMediaMessageMutation.isPending;
	const isComposerSubmitting =
		sendMessageMutation.isPending || isAttachmentSubmitting;
	const confirmedSchedule = schedules.find(
		(schedule) => schedule.status === "confirmed"
	);
	const reviewEligibleSchedule = schedules.find(
		(schedule) =>
			schedule.status === "confirmed" || schedule.status === "completed"
	);
	const existingReview = reviewListQuery.data?.find(
		(item) => item.chatRoomId === room.id
	);
	const canCreateReview =
		isJobSeeker &&
		Boolean(reviewEligibleSchedule) &&
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
	const handleAttachmentChange = (
		event: React.ChangeEvent<HTMLInputElement>
	) => {
		const file = event.target.files?.[0];
		event.target.value = "";

		if (!file) {
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
		rating,
	}: {
		body: string;
		rating: number;
	}) => {
		createReviewMutation.mutate({
			body,
			chatRoomId: room.id,
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
				<header className="flex items-center gap-3 border-border border-b p-4">
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
					<Badge tone={room.isBlocked ? "danger" : "success"}>
						{room.isBlocked ? "차단됨" : "대화 가능"}
					</Badge>
					<Badge tone={realtimeStatus === "connected" ? "success" : "neutral"}>
						{getRealtimeStatusLabel(realtimeStatus)}
					</Badge>
				</header>
				<div className="border-coral-100 border-b bg-coral-50 px-4 py-3 text-coral-700">
					<div className="flex items-center gap-2 font-extrabold text-sm">
						<span className="inline-flex size-4">
							<ShieldIcon />
						</span>
						면접 확정 전 연락처 보호 중
					</div>
					<p className="mt-1 mb-0 text-xs leading-relaxed">
						외부 연락처 공유 유도나 조건 불일치는 신고할 수 있어요.
					</p>
				</div>
				<div className="flex min-h-[420px] flex-col gap-3 p-4">
					<ChatMessageList
						currentUserId={currentUserId}
						messages={messages}
						typingUserIds={typingUserIds}
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
						{isJobSeeker ? null : (
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
						<Button
							block
							className="mt-4 shadow-none"
							disabled={!confirmedSchedule}
							onClick={onReveal}
							size="md"
							variant={confirmedSchedule ? "primary" : "secondary"}
						>
							연락처 공개하기
						</Button>
					</Card>
					<ReviewSidebarCard
						canCreateReview={canCreateReview}
						errorMessage={reviewErrorMessage}
						existingReview={existingReview}
						isLoading={reviewListQuery.isLoading}
						isSubmitting={createReviewMutation.isPending}
						isVisible={isJobSeeker && Boolean(reviewEligibleSchedule)}
						onSubmit={handleReviewSubmit}
						successMessage={reviewSuccessMessage}
					/>
				</div>
			</aside>
		</div>
	);
}
