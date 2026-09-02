// 로그인 없이 부를 수 있는 경로의 봇 방어용 슬라이딩 윈도 카운터. 무제한 호출을 그대로
// 두면 인증 건 표가 부풀고 계정 존재 여부를 두드려 볼 수 있다. web의 게스트 라우트
// (/api/guest)와 api의 레이트리밋 미들웨어가 함께 쓴다 — env·db에 의존하지 않는 순수 모듈로 유지한다.
// ponytail: 인스턴스 로컬 메모리 — 프로세스별 카운터다(web·server가 각자 센다).
// 수평 확장하면 Redis/DB 카운터로.

import { UNKNOWN_CLIENT_IP } from "./client-ip";

const buckets = new Map<string, number[]>();

// 키가 무한히 쌓이지 않게, 버킷 수가 이 값을 넘으면 만료 항목을 한 번 쓸어낸다.
const SWEEP_THRESHOLD = 5000;

const sweep = (cutoff: number) => {
	for (const [key, hits] of buckets) {
		const alive = hits.filter((time) => time > cutoff);
		if (alive.length === 0) {
			buckets.delete(key);
		} else {
			buckets.set(key, alive);
		}
	}
};

// 카운터를 비운다. 버킷이 모듈 수준이라 한 테스트의 호출이 다음 테스트로 새는데,
// 프로시저를 여러 번 부르는 스위트는 그 누적만으로 한도에 닿아 엉뚱하게 429로 깨진다.
export function resetRateLimits() {
	buckets.clear();
}

// 허용되면 true(호출 1회 기록), 한도 초과면 false.
export function takeRateLimit({
	key,
	limit,
	now,
	windowMs,
}: {
	key: string;
	limit: number;
	now: number;
	windowMs: number;
}): boolean {
	const cutoff = now - windowMs;
	if (buckets.size > SWEEP_THRESHOLD) {
		sweep(cutoff);
	}
	const hits = (buckets.get(key) ?? []).filter((time) => time > cutoff);
	if (hits.length >= limit) {
		buckets.set(key, hits);
		return false;
	}
	hits.push(now);
	buckets.set(key, hits);
	return true;
}

// 허용 처리 직후의 후속 작업이 실패했을 때 해당 호출 기록 한 건만 되돌린다. 동일 키의
// 다른 정상 호출까지 지우지 않도록 예약 시각과 일치하는 마지막 항목 하나만 제거한다.
export function releaseRateLimit({ key, now }: { key: string; now: number }) {
	const hits = buckets.get(key);
	if (!hits) {
		return;
	}
	const index = hits.lastIndexOf(now);
	if (index === -1) {
		return;
	}
	hits.splice(index, 1);
	if (hits.length === 0) {
		buckets.delete(key);
	} else {
		buckets.set(key, hits);
	}
}

// ── 공개(비로그인) 경로의 IP 기반 한도 정책 ──────────────────────────────────────
// api의 레이트리밋 미들웨어(packages/api/src/index.ts)와 web의 게스트 인증 라우트
// (/api/guest)가 같은 표를 본다. 정책이 한 곳에 모여 있어야 "본인인증 한 번에 두 엔드포인트를
// 지나는" 흐름에서 한쪽만 먼저 막히는 일이 없다.

export const PUBLIC_RATE_LIMIT_WINDOW_MS = 60 * 60 * 1000;

// 기본 한도. 계정 복구처럼 대상 계정을 두드려 볼 수 있는 경로는 이 값을 유지한다.
export const DEFAULT_PUBLIC_RATE_LIMIT = 10;

// 본인인증 관련 경로의 한도. KCP 인증창은 한 번 열 때마다 새 인증 건이 필요하고,
// 통신사 선택 실패·앱 인증 타임아웃·모바일 리디렉션 이탈로 재시도가 잦다. 게다가 가정·
// 사무실·통신사 NAT 뒤에서는 여러 사람이 같은 공인 IP를 쓴다. 인증 건 발급 자체는 UUID와
// 행 하나라 과금이 없고(과금은 KCP 창을 실제로 완료해야 발생한다) 표가 부푸는 정도가
// 위험의 전부이므로, 봇 방어는 유지하면서 실사용을 막지 않는 선까지 올린다.
export const IDENTITY_RATE_LIMIT = 30;

// web의 게스트 인증 라우트가 쓰는 버킷 이름(프로시저 경로가 없는 REST 라우트라 상수로 준다).
export const GUEST_VERIFY_RATE_LIMIT_SCOPE = "guest-verify";

// 라우터 구조가 바뀌어도 따라오도록 프로시저 이름(경로의 마지막 조각)으로 찾는다.
const RATE_LIMIT_OVERRIDES: Record<string, number> = {
	[GUEST_VERIFY_RATE_LIMIT_SCOPE]: IDENTITY_RATE_LIMIT,
	// native 게스트 흐름의 앞 단계(startIdentityVerification 30/h)·웹 /api/guest(guest-verify 30/h)와 티어를 맞춘다.
	issueGuestToken: IDENTITY_RATE_LIMIT,
	startIdentityVerification: IDENTITY_RATE_LIMIT,
};

// 프록시 헤더가 아예 없는 환경(로컬·컨테이너 직접 호출·헬스체크)은 모든 호출자가
// UNKNOWN_CLIENT_IP 버킷 하나를 공유한다. 여기에 1인 기준 한도를 그대로 적용하면 몇 명이
// 전체를 잠가 버리므로 배수를 준다 — 무제한은 아니다(봇이 헤더를 지울 수는 없으니,
// 프로덕션에서 이 버킷에 들어오는 건 내부 트래픽뿐이다).
export const UNKNOWN_IP_LIMIT_MULTIPLIER = 20;

// ── 로그인 채팅 발신 경로의 계정 기반 한도 ────────────────────────────────────────
// 채팅 발신은 계정이 있어야 닿는 경로라 버킷 축은 IP가 아니라 userId다(수다방 회원 글쓰기와
// 같은 규칙). 한도가 없으면 인증을 통과한 계정 하나가 방 하나에 초당 수십 건을 밀어 넣어
// 메시지·알림 행과 소켓/SSE 팬아웃을 무제한으로 만들 수 있다.

export const CHAT_SEND_RATE_LIMIT_WINDOW_MS = 60 * 1000;

export type ChatSendAction =
	| "createAttachmentUpload"
	| "proposeInterview"
	| "requestContactReveal"
	| "respondContactReveal"
	| "revealContact"
	| "sendMediaMessage"
	| "sendMessage"
	| "startFromJobPost";

// 1분 한도. 대화의 자연스러운 속도는 막지 않고(사람이 1분에 20건 이상 보내지 않는다),
// 비용이 큰 동작(외부 서명·방 개설·연락처 흐름)일수록 낮춘다.
const CHAT_SEND_RATE_LIMITS: Record<ChatSendAction, number> = {
	createAttachmentUpload: 20,
	proposeInterview: 5,
	requestContactReveal: 5,
	respondContactReveal: 5,
	revealContact: 5,
	sendMediaMessage: 20,
	sendMessage: 20,
	startFromJobPost: 10,
};

export function resolveChatSendRateLimit({
	action,
	userId,
}: {
	action: ChatSendAction;
	userId: string;
}): { key: string; limit: number; windowMs: number } {
	return {
		// 동작별로 따로 센다 — 메시지를 활발히 주고받는 중에 면접 제안이 막히면 안 된다.
		key: `chats.${action}:${userId}`,
		limit: CHAT_SEND_RATE_LIMITS[action],
		windowMs: CHAT_SEND_RATE_LIMIT_WINDOW_MS,
	};
}

// ── 장수명 연결(SSE·socket.io) 개시 한도 ─────────────────────────────────────────
// 연결 자체가 인스턴스 동시 슬롯을 하나씩 점유하고, 개시마다 세션 조회가 붙는다. 인증만
// 통과하면 개수 제한이 없어 스크립트로 수천 개를 열 수 있었다 — IP 기준으로 "새로 여는
// 속도"를 제한한다(이미 열린 스트림 수 상한은 구독 레지스트리가 따로 건다).
export const REALTIME_CONNECT_RATE_LIMIT_WINDOW_MS = 60 * 1000;

// 탭 여러 개·새로고침·모바일 네트워크 전환으로 정상 사용자도 분당 몇 번은 다시 연다.
// 재연결 폭주(배포 직후)까지 감안해 넉넉히 잡되, 무한 루프는 끊는다.
export const REALTIME_CONNECT_RATE_LIMIT = 30;

export function resolveRealtimeConnectRateLimit({
	clientIp,
	scope,
}: {
	clientIp: string;
	scope: string;
}): { key: string; limit: number; windowMs: number } {
	return {
		key: `realtime.${scope}:${clientIp}`,
		limit:
			clientIp === UNKNOWN_CLIENT_IP
				? REALTIME_CONNECT_RATE_LIMIT * UNKNOWN_IP_LIMIT_MULTIPLIER
				: REALTIME_CONNECT_RATE_LIMIT,
		windowMs: REALTIME_CONNECT_RATE_LIMIT_WINDOW_MS,
	};
}

export function resolvePublicRateLimit({
	clientIp,
	scope,
}: {
	clientIp: string;
	scope: string;
}): { key: string; limit: number; windowMs: number } {
	const name = scope.split(".").at(-1) ?? scope;
	const base = RATE_LIMIT_OVERRIDES[name] ?? DEFAULT_PUBLIC_RATE_LIMIT;
	return {
		// 버킷 키에 경로를 넣어 프로시저마다 따로 센다. 한 흐름이 여러 프로시저를 순서대로
		// 부르므로(발급 → 아이디 찾기 → 재설정) 한 버킷을 공유하면 정상 사용자가 먼저 막힌다.
		key: `${scope}:${clientIp}`,
		limit:
			clientIp === UNKNOWN_CLIENT_IP
				? base * UNKNOWN_IP_LIMIT_MULTIPLIER
				: base,
		windowMs: PUBLIC_RATE_LIMIT_WINDOW_MS,
	};
}
