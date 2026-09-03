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
		include: ["test/**/*.test.ts"],
	},
});
