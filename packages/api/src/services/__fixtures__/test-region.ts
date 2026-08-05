import { randomUUID } from "node:crypto";

import { db } from "@bambi-app/db";
import { region } from "@bambi-app/db/schema/bambi";
import { eq } from "drizzle-orm";

export interface TestRegion {
	code: string;
	label: string;
}

// 목록·피드 테스트는 공개 전역 조회를 돌리므로, 병렬 픽스처가 섞이지 않으려면 그 픽스처만
// 가진 지역이 필요하다. 지역이 코드(FK)로 바뀐 뒤로는 문자열을 지어낼 수 없어 일회용 시/도
// 행을 실제로 만든다 — 코드는 varchar(10)이라 uuid 앞 10자리를 쓴다.
export const createTestRegion = async (): Promise<TestRegion> => {
	const code = randomUUID().replaceAll("-", "").slice(0, 10);
	const label = `테스트-${code}`;

	await db.insert(region).values({ code, label, sortOrder: 0 });

	return { code, label };
};

// 공고가 FK로 잡고 있으므로 반드시 공고를 지운 뒤에 부른다.
export const deleteTestRegion = async (code: string): Promise<void> => {
	await db.delete(region).where(eq(region.code, code));
};
