import { defineConfig } from "vitest/config";

// native 순수 함수(src/lib/chat/*)만 node 환경에서 검증한다. RN 컴포넌트는 렌더 테스트를
// 두지 않는다(라이브러리 추가 금지) — 로직을 훅 밖 순수 함수로 빼서 여기서 덮는다.
// tsconfig paths "@/*" → "./*"와 같은 축.
export default defineConfig({
	resolve: {
		alias: { "@": import.meta.dirname },
	},
	root: import.meta.dirname,
	test: {
		// 콜로케이션(src/lib/*.test.ts)과 미러 구조(test/**) 둘 다 실행한다 — include가
		// test/**뿐이면 src 옆에 둔 스위트가 조용히 빠져 통과 착시가 생긴다.
		include: ["{src,test}/**/*.test.ts"],
	},
});
