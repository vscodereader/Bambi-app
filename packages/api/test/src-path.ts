import path from "node:path";

/** packages/api/src 기준 상대 경로를 절대 경로로 만든다(소스를 텍스트로 읽는 테스트용). */
export const srcPath = (rel: string) =>
	path.join(import.meta.dirname, "../src", rel);
