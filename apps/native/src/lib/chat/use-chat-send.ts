import { generateChatMessageId } from "@bambi-app/api/services/bambi-chat-message-id";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useRef, useState } from "react";

import { orpc } from "@/src/lib/orpc";

import {
	isImageMimeType,
	type PickedAttachment,
	validatePickedAttachment,
} from "./chat-attachment-picker";
import { chatMutationErrorMessage } from "./chat-errors";
import {
	createOptimisticImageMessage,
	createOptimisticTextMessage,
	dropSettledOptimistic,
	type OptimisticChatMessage,
} from "./chat-optimistic";
import { CHAT_MESSAGE_PAGE_SIZE } from "./chat-types";

const MAX_SEND_ATTEMPTS = 3;

export { MAX_SEND_ATTEMPTS };

/**
 * 텍스트·첨부 전송과 낙관적 메시지 상태. id는 클라이언트가 만들어 보내므로(서버 멱등키)
 * 재전송이 중복 말풍선을 만들지 않는다. 서버 행이 캐시에 들어오면 같은 id의 낙관적
 * 항목을 걷어낸다(dropSettledOptimistic).
 */
export function useChatSend({
	currentUserId,
	onError,
	roomId,
}: {
	currentUserId: string;
	onError: (message: string) => void;
	roomId: string;
}): {
	discardFailed: (id: string) => void;
	isUploading: boolean;
	optimistic: OptimisticChatMessage[];
	retry: (id: string) => void;
	sendAttachment: (picked: PickedAttachment, body: string) => Promise<void>;
	sendText: (body: string) => void;
} {
	const queryClient = useQueryClient();
	const [optimistic, setOptimistic] = useState<OptimisticChatMessage[]>([]);
	const [isUploading, setIsUploading] = useState(false);
	// 재전송용 원본(첨부는 picked를 다시 올려야 한다).
	const pendingAttachmentsRef = useRef(
		new Map<string, { body: string; picked: PickedAttachment }>()
	);
	const onErrorRef = useRef(onError);

	useEffect(() => {
		onErrorRef.current = onError;
	}, [onError]);

	const roomKey = orpc.bambi.chats.getById.key({ input: { id: roomId } });
	const invalidateRoom = useCallback(
		() =>
			queryClient
				.invalidateQueries({ queryKey: roomKey })
				.catch(() => undefined),
		[queryClient, roomKey]
	);

	// 서버 최신 페이지가 갱신될 때마다 도착한 낙관적 항목을 정리한다. 렌더 중 getQueryData로
	// 읽으면 구독이 아니라 다른 useQuery의 리렌더에 얹혀야만 도니, 같은 키를 useQuery로 구독한다
	// (관찰자만 추가, 네트워크 추가 없음).
	const serverMessages = useQuery(
		orpc.bambi.chats.getById.queryOptions({
			input: { id: roomId, limit: CHAT_MESSAGE_PAGE_SIZE },
		})
	).data?.messages;

	useEffect(() => {
		if (!serverMessages) {
			return;
		}
		setOptimistic((current) => {
			const next = dropSettledOptimistic(current, serverMessages);
			return next.length === current.length ? current : next;
		});
	}, [serverMessages]);

	const markFailed = useCallback((id: string) => {
		setOptimistic((current) =>
			current.map((item) =>
				item.id === id ? { ...item, sendStatus: "failed" as const } : item
			)
		);
	}, []);

	const markSending = useCallback((id: string) => {
		setOptimistic((current) =>
			current.map((item) =>
				item.id === id
					? {
							...item,
							attempts: item.attempts + 1,
							sendStatus: "sending" as const,
						}
					: item
			)
		);
	}, []);

	const sendMessageMutation = useMutation(
		orpc.bambi.chats.sendMessage.mutationOptions({
			onError: (error, variables) => {
				if (variables.messageId) {
					markFailed(variables.messageId);
				}
				onErrorRef.current(chatMutationErrorMessage(error));
			},
			onSuccess: () => invalidateRoom(),
		})
	);
	const createUploadMutation = useMutation(
		orpc.bambi.chats.createAttachmentUpload.mutationOptions()
	);
	const sendMediaMutation = useMutation(
		orpc.bambi.chats.sendMediaMessage.mutationOptions({
			onSuccess: () => invalidateRoom(),
		})
	);

	const sendText = useCallback(
		(body: string) => {
			const trimmed = body.trim();

			if (!trimmed) {
				return;
			}

			const id = generateChatMessageId();
			setOptimistic((current) => [
				...current,
				createOptimisticTextMessage({
					body: trimmed,
					chatRoomId: roomId,
					id,
					senderUserId: currentUserId,
				}),
			]);
			sendMessageMutation.mutate({
				body: trimmed,
				chatRoomId: roomId,
				messageId: id,
			});
		},
		[currentUserId, roomId, sendMessageMutation]
	);

	const uploadAndSend = useCallback(
		async (id: string, picked: PickedAttachment, body: string) => {
			setIsUploading(true);
			try {
				// 서명이 content-length에 묶여 있어 피커가 준 size가 아니라 실제 blob 크기를 쓴다.
				const blob = await (await fetch(picked.uri)).blob();
				const resolved = { ...picked, byteSize: blob.size };
				const validation = validatePickedAttachment(resolved);

				if (!validation.ok) {
					throw new Error(validation.message);
				}

				const intent = await createUploadMutation.mutateAsync({
					byteSize: resolved.byteSize,
					chatRoomId: roomId,
					fileName: resolved.fileName,
					mimeType: resolved.mimeType,
				});

				if (!intent.uploadUrl.startsWith("https://")) {
					// 서버 GCS 미구성(dev)이면 local:// 플레이스홀더가 온다 — 올리지 않고 멈춘다.
					throw new Error(
						"지금은 파일을 보낼 수 없어요. 잠시 후 다시 시도해 주세요."
					);
				}

				const response = await fetch(intent.uploadUrl, {
					body: blob,
					headers: { "Content-Type": intent.mimeType },
					method: "PUT",
				});

				if (!response.ok) {
					throw new Error(
						"파일 업로드에 실패했어요. 잠시 후 다시 시도해 주세요."
					);
				}

				const trimmed = body.trim();
				await sendMediaMutation.mutateAsync({
					body: trimmed || undefined,
					byteSize: intent.byteSize,
					chatRoomId: roomId,
					fileName: intent.fileName,
					messageId: id,
					mimeType: intent.mimeType,
					storageKey: intent.storageKey,
					textMessageId: trimmed ? generateChatMessageId() : undefined,
				});
				pendingAttachmentsRef.current.delete(id);
			} catch (error) {
				markFailed(id);
				onErrorRef.current(
					error instanceof Error && !("code" in error)
						? error.message
						: chatMutationErrorMessage(error)
				);
			} finally {
				setIsUploading(false);
			}
		},
		[createUploadMutation, markFailed, roomId, sendMediaMutation]
	);

	const sendAttachment = useCallback(
		async (picked: PickedAttachment, body: string) => {
			const validation = validatePickedAttachment(picked);

			if (!validation.ok) {
				onErrorRef.current(validation.message);
				return;
			}

			const id = generateChatMessageId();
			pendingAttachmentsRef.current.set(id, { body, picked });
			setOptimistic((current) => [
				...current,
				isImageMimeType(picked.mimeType)
					? createOptimisticImageMessage({
							chatRoomId: roomId,
							id,
							localImageUri: picked.uri,
							senderUserId: currentUserId,
						})
					: {
							...createOptimisticTextMessage({
								body: `${picked.fileName} 보내는 중`,
								chatRoomId: roomId,
								id,
								senderUserId: currentUserId,
							}),
						},
			]);
			await uploadAndSend(id, picked, body);
		},
		[currentUserId, roomId, uploadAndSend]
	);

	const retry = useCallback(
		(id: string) => {
			const item = optimistic.find((candidate) => candidate.id === id);

			if (item?.sendStatus !== "failed" || item.attempts >= MAX_SEND_ATTEMPTS) {
				return;
			}

			markSending(id);
			const pending = pendingAttachmentsRef.current.get(id);

			if (pending) {
				uploadAndSend(id, pending.picked, pending.body).catch(() => undefined);
				return;
			}

			sendMessageMutation.mutate({
				body: item.body,
				chatRoomId: roomId,
				messageId: id,
			});
		},
		[markSending, optimistic, roomId, sendMessageMutation, uploadAndSend]
	);

	const discardFailed = useCallback((id: string) => {
		pendingAttachmentsRef.current.delete(id);
		setOptimistic((current) => current.filter((item) => item.id !== id));
	}, []);

	return {
		discardFailed,
		isUploading,
		// 같은 라우트로 방을 바꿔도 컴포넌트가 재사용돼 state가 유지되므로, 노출은 현재 방 것만.
		// 내부 state는 그대로 둬 A로 돌아오면 실패 메시지 retry가 가능하다.
		optimistic: optimistic.filter((item) => item.chatRoomId === roomId),
		retry,
		sendAttachment,
		sendText,
	};
}
