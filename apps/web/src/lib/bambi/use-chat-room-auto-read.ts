"use client";

import { useCallback, useEffect, useRef } from "react";

// 읽음 기준선 합치기 지연. 수신이 몰려도 markRead는 이 창 안에서 최신 기준선 하나로 접힌다.
const MARK_READ_COALESCE_MS = 300;

interface ChatRoomAutoReadInput {
	chatRoomId: string;
	// 실패를 알 수 있어야 같은 기준선을 다시 시도할 수 있다(mutateAsync).
	markRead: (input: {
		chatRoomId: string;
		upToMessageId: string;
	}) => Promise<unknown>;
}

interface ChatRoomAutoRead {
	queueMarkRead: (messageId: null | string) => void;
	/**
	 * "보고 있는 방인데 안 읽음이 남아 있다"는 신호(chat:unread:updated)를 받았을 때의
	 * 재주장. 이미 보낸 기준선이어도 봉인을 풀어 같은 기준선으로 다시 쏜다.
	 */
	reassertMarkRead: () => void;
}

/**
 * 보고 있는 방의 자동 읽음. 기준은 "탭 활성(visibilityState === visible) + 이 방 화면
 * 표시 중"이다. 백그라운드 탭에서는 목록 핀을 그대로 두고, 탭으로 돌아온 순간 밀린
 * 기준선 하나로 읽음 처리한다.
 *
 * 기준선은 언제나 마지막으로 알게 된 메시지 하나뿐이라(id 목록이 아니다), 수신이 몰려도
 * 요청은 합쳐진다 — 예약이 걸려 있으면 기준선만 갈아 끼우고 발화 시점에 최신 값을 읽는다.
 * 방 id를 기준선과 함께 들고 있어, 방을 갈아탄 뒤 밀린 발화가 남의 방으로 새지 않는다.
 */
export function useChatRoomAutoRead({
	chatRoomId,
	markRead,
}: ChatRoomAutoReadInput): ChatRoomAutoRead {
	const latestRef = useRef<null | { chatRoomId: string; messageId: string }>(
		null
	);
	const sentMessageIdRef = useRef<null | string>(null);
	const timerRef = useRef<null | number>(null);

	const flushSoon = useCallback(() => {
		if (timerRef.current !== null) {
			return;
		}

		timerRef.current = window.setTimeout(() => {
			timerRef.current = null;
			const latest = latestRef.current;

			if (!latest || sentMessageIdRef.current === latest.messageId) {
				return;
			}

			sentMessageIdRef.current = latest.messageId;
			markRead({
				chatRoomId: latest.chatRoomId,
				upToMessageId: latest.messageId,
			}).catch(() => {
				// 실패한 기준선을 "보냈다"로 남겨 두면 같은 기준선으로는 두 번 다시
				// 시도하지 않는다 — 핀이 1에 걸린 채 다음 새 메시지가 올 때까지 안 꺼진다.
				// 되돌려 두면 탭 복귀·방 재조회 같은 다음 신호가 그대로 재시도한다.
				if (sentMessageIdRef.current === latest.messageId) {
					sentMessageIdRef.current = null;
				}
			});
		}, MARK_READ_COALESCE_MS);
	}, [markRead]);

	const queueMarkRead = useCallback(
		(messageId: null | string) => {
			if (!messageId) {
				return;
			}

			latestRef.current = { chatRoomId, messageId };

			if (document.visibilityState === "visible") {
				flushSoon();
			}
		},
		[chatRoomId, flushSoon]
	);

	/**
	 * 이 방의 안 읽음이 아직 0이 아니라는 신호를 받았을 때 쓴다. 기준선이 같아도 다시
	 * 보내야 하므로 봉인(sentMessageIdRef)만 풀고 평소 경로로 흘린다 — markRead 성공이
	 * 안 읽음 0 신호를 만들므로 루프는 돌지 않는다. 기준선이 다른 방 것이면(방 전환 직후)
	 * 남의 방으로 새지 않도록 그냥 넘긴다.
	 */
	const reassertMarkRead = useCallback(() => {
		if (latestRef.current?.chatRoomId !== chatRoomId) {
			return;
		}

		sentMessageIdRef.current = null;

		if (document.visibilityState === "visible") {
			flushSoon();
		}
	}, [chatRoomId, flushSoon]);

	useEffect(() => {
		const handleVisibilityChange = () => {
			if (document.visibilityState === "visible") {
				flushSoon();
			}
		};

		document.addEventListener("visibilitychange", handleVisibilityChange);

		return () => {
			document.removeEventListener("visibilitychange", handleVisibilityChange);
		};
	}, [flushSoon]);

	useEffect(
		() => () => {
			if (timerRef.current !== null) {
				window.clearTimeout(timerRef.current);
				timerRef.current = null;
			}
		},
		[]
	);

	return { queueMarkRead, reassertMarkRead };
}
