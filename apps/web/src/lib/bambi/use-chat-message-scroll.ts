"use client";

import { useCallback, useRef, useState } from "react";
import { isScrolledToBottom } from "./chat-room-messages";

/**
 * 채팅방 메시지 영역의 내부 스크롤 동작(문서가 아니라 이 영역만 스크롤한다).
 *
 * - `syncScroll(messages)`를 목록 변화에 맞춰 useLayoutEffect로 걸면, 새 메시지가 붙을 때
 *   하단으로 따라 내린다. 단 사용자가 위로 올려 과거를 읽는 중이면 자리를 지킨다.
 * - `captureOlderAnchor()`를 앞쪽 페이지를 붙이기 직전에 부르면, 늘어난 높이만큼 되밀어
 *   "이전 메시지 더 보기"의 스크롤 점프를 막는다.
 * - `stickToBottom()`은 본인 전송처럼 무조건 하단으로 내려야 할 때 쓴다.
 * - `resetKey`(방 id)가 바뀌면 읽던 자리를 물려받지 않고 하단부터 다시 시작한다.
 */
export function useChatMessageScroll(resetKey: string): {
	captureOlderAnchor: () => void;
	handleScroll: () => void;
	scrollRef: React.RefObject<HTMLDivElement | null>;
	stickToBottom: () => void;
	syncScroll: (messages: readonly unknown[]) => void;
} {
	const scrollRef = useRef<HTMLDivElement | null>(null);
	const stickToBottomRef = useRef(true);
	const olderAnchorRef = useRef<null | number>(null);
	const [trackedKey, setTrackedKey] = useState(resetKey);

	// 방을 갈아탈 때의 상태 되돌리기 — effect보다 렌더 중 조정이 한 프레임 빠르다.
	if (trackedKey !== resetKey) {
		setTrackedKey(resetKey);
		stickToBottomRef.current = true;
		olderAnchorRef.current = null;
	}

	const syncScroll = useCallback((messages: readonly unknown[]) => {
		const element = scrollRef.current;

		if (!(element && messages.length > 0)) {
			return;
		}

		const olderAnchor = olderAnchorRef.current;

		if (olderAnchor !== null) {
			olderAnchorRef.current = null;
			element.scrollTop += element.scrollHeight - olderAnchor;
			return;
		}

		if (stickToBottomRef.current) {
			element.scrollTop = element.scrollHeight;
		}
	}, []);

	const handleScroll = useCallback(() => {
		const element = scrollRef.current;

		if (element) {
			stickToBottomRef.current = isScrolledToBottom(element);
		}
	}, []);

	const captureOlderAnchor = useCallback(() => {
		olderAnchorRef.current = scrollRef.current?.scrollHeight ?? null;
	}, []);

	const stickToBottom = useCallback(() => {
		stickToBottomRef.current = true;
	}, []);

	return {
		captureOlderAnchor,
		handleScroll,
		scrollRef,
		stickToBottom,
		syncScroll,
	};
}
