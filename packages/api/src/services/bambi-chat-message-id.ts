const BYTE = 256;
const TIMESTAMP_BYTES = 6;
// UUIDv7의 7번째 바이트는 0111xxxx(version 7), 9번째 바이트는 10xxxxxx(variant).
const VERSION_7_BASE = 112;
const VERSION_RANDOM_SPAN = 16;
const VARIANT_BASE = 128;
const VARIANT_RANDOM_SPAN = 64;

// Hermes(React Native)에는 globalThis.crypto가 없다. 이 id는 보안 토큰이 아니라
// 정렬 가능한 멱등키라, 웹크립토가 없을 때만 Math.random으로 채운다(서버·브라우저는
// 항상 crypto 경로). 앞 48비트 타임스탬프 + 74비트 난수라 충돌은 무시할 수 있다.
const fillRandomBytes = (bytes: Uint8Array): void => {
	const webCrypto = (
		globalThis as {
			crypto?: { getRandomValues?: (bytes: Uint8Array) => void };
		}
	).crypto;

	if (typeof webCrypto?.getRandomValues === "function") {
		webCrypto.getRandomValues(bytes);
		return;
	}

	for (let index = 0; index < bytes.length; index += 1) {
		bytes[index] = Math.floor(Math.random() * BYTE);
	}
};

/**
 * 채팅 메시지 id의 단일 진실원 — UUIDv7.
 * 앞 48비트가 Unix ms 타임스탬프라 id 자체가 생성 시간순으로 정렬된다.
 * 클라이언트가 전송 전에 id를 만들어 보내고 서버는 PK 충돌로 재시도를
 * 흡수하므로(멱등성), 브라우저·Node 양쪽에서 동작해야 한다 —
 * crypto.getRandomValues만 사용한다.
 * 정렬의 정본은 여전히 DB createdAt이다. id의 타임스탬프는 클라이언트
 * 시계라 신뢰하지 않고, 동시각 타이브레이커·중복 판별·커서 구성에만 쓴다.
 */
export const generateChatMessageId = (): string => {
	const bytes = new Uint8Array(16);
	fillRandomBytes(bytes);

	let timestamp = Date.now();
	for (let index = TIMESTAMP_BYTES - 1; index >= 0; index -= 1) {
		bytes[index] = timestamp % BYTE;
		timestamp = Math.floor(timestamp / BYTE);
	}
	bytes[6] = VERSION_7_BASE + ((bytes[6] ?? 0) % VERSION_RANDOM_SPAN);
	bytes[8] = VARIANT_BASE + ((bytes[8] ?? 0) % VARIANT_RANDOM_SPAN);

	let hex = "";
	for (const byte of bytes) {
		hex += byte.toString(16).padStart(2, "0");
	}
	return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
};
