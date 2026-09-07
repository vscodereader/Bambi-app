// SSE 프레임 파서. 훅(notification-stream.ts)과 분리해 둔 이유는 테스트다 — vitest는 node
// 환경이라 react-native·expo/fetch를 못 읽어서, 훅 파일에 같이 두면 파서 테스트가 모듈 로드
// 단계에서 통째로 죽는다.
export interface SseFrame {
	data: string;
	event: string;
}

const FRAME_SEPARATOR = /\r?\n\r?\n/;
const LINE_SEPARATOR = /\r?\n/;

// 완성된 프레임(빈 줄로 끝난 것)만 돌려주고 잘린 꼬리는 rest로 되돌려 다음 청크에 이어 붙인다.
// event가 없는 프레임은 SSE 규약대로 "message"다.
export function parseSseChunk(buffer: string): {
	frames: SseFrame[];
	rest: string;
} {
	const parts = buffer.split(FRAME_SEPARATOR);
	const rest = parts.pop() ?? "";
	const frames: SseFrame[] = [];

	for (const part of parts) {
		let event = "message";
		const data: string[] = [];

		for (const line of part.split(LINE_SEPARATOR)) {
			if (line.startsWith(":") || line.length === 0) {
				continue;
			}
			if (line.startsWith("event:")) {
				event = line.slice("event:".length).trim();
			} else if (line.startsWith("data:")) {
				data.push(line.slice("data:".length).trimStart());
			}
		}

		if (data.length > 0) {
			frames.push({ data: data.join("\n"), event });
		}
	}

	return { frames, rest };
}
