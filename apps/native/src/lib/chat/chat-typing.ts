// 상대 타이핑 표시 상태 — userId → 만료 시각(ms). stopped 이벤트가 유실돼도 TTL로 꺼진다.
export type TypingState = Readonly<Record<string, number>>;

export const TYPING_TTL_MS = 5000;

export const applyTypingStarted = (
	state: TypingState,
	userId: string,
	now: number
): TypingState => ({ ...state, [userId]: now + TYPING_TTL_MS });

export const applyTypingStopped = (
	state: TypingState,
	userId: string
): TypingState => {
	if (!(userId in state)) {
		return state;
	}

	return Object.fromEntries(
		Object.entries(state).filter(([key]) => key !== userId)
	);
};

/** 만료된 항목을 제거한다. 바뀐 게 없으면 같은 참조를 돌려 리렌더를 피한다. */
export const pruneTyping = (state: TypingState, now: number): TypingState => {
	const alive = Object.entries(state).filter(
		([, expiresAt]) => expiresAt > now
	);

	if (alive.length === Object.keys(state).length) {
		return state;
	}

	return Object.fromEntries(alive);
};

export const typingUserIds = (state: TypingState, now: number): string[] =>
	Object.entries(state)
		.filter(([, expiresAt]) => expiresAt > now)
		.map(([userId]) => userId);
