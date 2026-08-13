# 사업자 문서 비공개 버킷 전환 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 사업자 문서(사업자등록증 등)를 공개 버킷에서 비공개 버킷(`GCS_PRIVATE_BUCKET`)으로 옮기고, 조회를 매 요청 세션 검증(웹 라우트 → oRPC 프로시저 → 60초 서명 URL 302)으로 바꿔 URL 유출을 무의미하게 한다.

**Architecture:** 업로드는 지금처럼 브라우저가 서명 PUT URL로 GCS에 직접 올리되 대상만 비공개 버킷으로 바꾼다(프로덕션에서 버킷 미설정 시 업로드 거부 = default-deny). 조회는 `objectUrl`을 웹 앱 경로(`/bambi/business-documents/{id}`)로 바꾸고, 그 라우트가 매 요청 쿠키를 포워딩해 oRPC 프로시저(`createBusinessDocumentViewUrl`)를 호출 — 프로시저가 본인·운영자 인가 후 TTL 60초 서명 GET URL을 돌려주면 302 리다이렉트한다. API(oRPC)는 apps/server(Fastify)에서 돌고 web은 오리진이 달라서, 웹 라우트가 DB·GCS를 직접 만지지 않고 프로시저를 경유한다(기존 SSR 헤더 포워딩 인프라 재사용). 운영자 삭제 프로시저와 심사 화면 삭제 버튼을 추가한다.

**Tech Stack:** Next.js 라우트 핸들러, oRPC(@orpc/client의 `client` — `apps/web/src/utils/orpc.ts`), Drizzle, @google-cloud/storage V4 서명 URL(signBlob 키리스), shadcn(base-ui) AlertDialog.

**스펙:** `docs/superpowers/specs/2026-08-13-business-doc-private-bucket-design.md`

## Global Constraints

- 브랜치: `worktree-business-doc-private-bucket` (워크트리 `C:\Users\user\projects\bambi-app\.claude\worktrees\business-doc-private-bucket`). 모든 경로는 이 워크트리 기준.
- **서브에이전트는 git 명령(커밋·stash 포함) 금지** — 커밋은 컨트롤러가 순차 수행.
- `pnpm db:push` 금지. DB 스키마 변경 없음(마이그레이션 없음).
- `packages/api/test/routers/bambi` 스위트 **실행 금지**(dev DB 삭제 사고) — 파일 갱신만 하고 돌리지 않는다. services 테스트만 실행.
- 빌드·dev 서버 기동 금지. 검증은 ultracite(경로 인자 필수) + vitest(워크트리 안에서) + `check-types`.
- web UI는 shadcn(base-ui) 컴포넌트만, 인라인 style 금지, `cn()` 사용, base-ui는 `asChild`가 아니라 `render` prop.
- 키 규칙(비공개 버킷 전 서비스 공통): `seeker/{userId}/…`(예약), `employer/{orgId}/{userId}/{uuid}-{정규화 파일명}`.
- 서명 read URL TTL **60초**, 서명 PUT TTL 기존 5분 유지.
- pnpm 필터명: web/server는 scope 없음(`--filter web`), api는 `--filter @bambi-app/api`.

---

### Task 1: 기반 계층 — env·gcs·bambi-storage + services 테스트

**Files:**
- Modify: `packages/env/src/server.ts` (GCS_PUBLIC_BUCKET 아래에 1줄 추가)
- Modify: `packages/api/src/services/gcs.ts`
- Modify: `packages/api/src/services/bambi-storage.ts`
- Test: `packages/api/test/services/bambi-storage.test.ts`

**Interfaces:**
- Consumes: 기존 `env`, `getStorageClient`(gcs.ts 내부), `buildLocalObjectUrl`(bambi-storage.ts 내부), `normalizeFileNameForStorage`.
- Produces (뒤 태스크가 의존하는 정확한 시그니처):
  - gcs.ts: `isPrivateBucketConfigured(): boolean`, `shouldUsePrivateBucket(): boolean`, `isProductionStorageRuntime(): boolean`, `createPrivateSignedUploadUrl(input: SignedUploadUrlInput): Promise<string>`, `createPrivateSignedReadUrl(input: { download: boolean; fileName: string; storageKey: string }): Promise<string>`, `deletePrivateObjects(storageKeys: string[]): Promise<void>`
  - bambi-storage.ts: `isOwnedBusinessDocumentKey({ organizationId, storageKey, userId }): boolean`(시그니처 유지, 규칙만 교체), `createBusinessDocumentUploadIntent(...)`(시그니처 유지), `resolveBusinessDocumentViewUrl({ category, download, fileName, storageKey }): Promise<string>`, `getBusinessDocumentViewPath(documentId: string): string`
  - `getBusinessDocumentObjectUrl`는 **제거**된다(호출부는 Task 2·3에서 함께 교체).

- [ ] **Step 1: 실패하는 테스트 추가**

`packages/api/test/services/bambi-storage.test.ts`의 import에 새 심볼을 추가하고 describe 블록 2개를 추가한다:

```ts
const {
	createBusinessDocumentUploadIntent,
	getBusinessDocumentViewPath,
	isOwnedBusinessDocumentKey,
	isOwnedChatAttachmentKey,
	isOwnedEditorMediaKey,
} = await import("@/services/bambi-storage");
```

```ts
describe("business document private key ownership", () => {
	const ORG_ID = "org_1";

	it("employer/{orgId}/{userId}/ 프리픽스의 키만 소유로 인정한다", () => {
		expect(
			isOwnedBusinessDocumentKey({
				organizationId: ORG_ID,
				storageKey: `employer/${ORG_ID}/${OWNER_ID}/8f0c-doc.pdf`,
				userId: OWNER_ID,
			})
		).toBe(true);

		expect(
			isOwnedBusinessDocumentKey({
				organizationId: ORG_ID,
				storageKey: `employer/${ORG_ID}/user_other/8f0c-doc.pdf`,
				userId: OWNER_ID,
			})
		).toBe(false);

		expect(
			isOwnedBusinessDocumentKey({
				organizationId: "org_2",
				storageKey: `employer/${ORG_ID}/${OWNER_ID}/8f0c-doc.pdf`,
				userId: OWNER_ID,
			})
		).toBe(false);
	});

	it("옛 공개 버킷 규칙(bambi-business-documents/)과 상위 경로 탈출은 거절한다", () => {
		expect(
			isOwnedBusinessDocumentKey({
				organizationId: ORG_ID,
				storageKey: `bambi-business-documents/${ORG_ID}/${OWNER_ID}/8f0c-doc.pdf`,
				userId: OWNER_ID,
			})
		).toBe(false);

		expect(
			isOwnedBusinessDocumentKey({
				organizationId: ORG_ID,
				storageKey: `employer/${ORG_ID}/${OWNER_ID}/../../../etc/passwd`,
				userId: OWNER_ID,
			})
		).toBe(false);
	});
});

describe("business document upload intent (비프로덕션 = 로컬 폴백)", () => {
	it("서버가 employer/{orgId}/{userId}/ 키를 정하고 로컬 업로드 URL을 내린다", async () => {
		const intent = await createBusinessDocumentUploadIntent({
			actorUserId: OWNER_ID,
			byteSize: 1024,
			category: "pdf",
			fileName: "사업자 등록증.pdf",
			mimeType: "application/pdf",
			organizationId: "org_1",
		});

		expect(intent.storageKey.startsWith(`employer/org_1/${OWNER_ID}/`)).toBe(
			true
		);
		expect(
			isOwnedBusinessDocumentKey({
				organizationId: "org_1",
				storageKey: intent.storageKey,
				userId: OWNER_ID,
			})
		).toBe(true);
		// NODE_ENV=test는 프로덕션이 아니므로 GCS 대신 로컬 플레이스홀더 URL이어야 한다.
		expect(intent.uploadUrl.startsWith("/bambi/local-chat-attachments?")).toBe(
			true
		);
	});
});

describe("business document view path", () => {
	it("문서 id 기반 앱 조회 경로를 만든다", () => {
		expect(getBusinessDocumentViewPath("doc_1")).toBe(
			"/bambi/business-documents/doc_1"
		);
	});
});
```

- [ ] **Step 2: 실패 확인**

워크트리 루트에서:

```bash
pnpm --filter @bambi-app/api exec vitest run test/services/bambi-storage.test.ts
```

Expected: FAIL — `getBusinessDocumentViewPath` export 없음 / 프리픽스 불일치.

- [ ] **Step 3: `packages/env/src/server.ts` 수정**

`GCS_PUBLIC_BUCKET` 줄 바로 아래에 추가:

```ts
			// 민감 서류(사업자등록증 등) 전용 비공개 버킷. 공개 버킷과 달리 프로덕션 부팅
			// 가드를 두지 않는 대신, 미설정 상태로 사업자 문서 업로드를 시도하면 그 시점에
			// 에러로 거부한다(default-deny) — 공개 버킷으로 새는 폴백은 두지 않는다.
			GCS_PRIVATE_BUCKET: z.string().min(1).optional(),
```

- [ ] **Step 4: `packages/api/src/services/gcs.ts` 수정**

서명 로직을 버킷 인자 헬퍼로 뽑고 private 함수를 추가한다. 기존 export 시그니처는 전부 유지.

```ts
const SIGNED_READ_URL_TTL_MS = 60 * 1000;
```

`requirePublicBucket` 아래에:

```ts
export const isPrivateBucketConfigured = (): boolean =>
	Boolean(env.GCS_PRIVATE_BUCKET);

// 조회 라우트·업로드 인텐트가 "프로덕션인가"를 물을 때 env를 직접 들지 않도록 한 곳에 둔다.
export const isProductionStorageRuntime = (): boolean =>
	env.NODE_ENV === "production";

export const shouldUsePrivateBucket = (): boolean =>
	isProductionStorageRuntime() && isPrivateBucketConfigured();

const requirePrivateBucket = (): string => {
	const bucketName = env.GCS_PRIVATE_BUCKET;

	if (!bucketName) {
		// 사업자 문서 업로드 경로에서 이 에러가 그대로 올라간다 — 공개 버킷 폴백 금지.
		throw new Error(
			"GCS_PRIVATE_BUCKET 환경 변수가 설정되지 않았습니다. 민감 서류는 비공개 버킷 없이는 업로드할 수 없습니다."
		);
	}

	return bucketName;
};
```

기존 `createSignedUploadUrl` 본문을 버킷 인자 헬퍼로 바꾸고 public/private 두 export가 이를 공유:

```ts
const createSignedUploadUrlForBucket = async (
	bucketName: string,
	{ byteSize, mimeType, storageKey }: SignedUploadUrlInput
): Promise<string> => {
	const [signedUrl] = await getStorageClient()
		.bucket(bucketName)
		.file(storageKey)
		.getSignedUrl({
			action: "write",
			contentType: mimeType,
			expires: Date.now() + SIGNED_UPLOAD_URL_TTL_MS,
			extensionHeaders: { "content-length": String(byteSize) },
			version: "v4",
		});

	return signedUrl;
};

export const createSignedUploadUrl = (
	input: SignedUploadUrlInput
): Promise<string> => createSignedUploadUrlForBucket(requirePublicBucket(), input);

export const createPrivateSignedUploadUrl = (
	input: SignedUploadUrlInput
): Promise<string> =>
	createSignedUploadUrlForBucket(requirePrivateBucket(), input);

// 조회는 매번 앱 라우트의 세션 검증을 거친 직후에만 발급되므로 60초면 충분하다 —
// 길게 주면 유출된 URL의 소지자 사용 창만 넓어진다.
export const createPrivateSignedReadUrl = async ({
	download,
	fileName,
	storageKey,
}: {
	download: boolean;
	fileName: string;
	storageKey: string;
}): Promise<string> => {
	const [signedUrl] = await getStorageClient()
		.bucket(requirePrivateBucket())
		.file(storageKey)
		.getSignedUrl({
			action: "read",
			expires: Date.now() + SIGNED_READ_URL_TTL_MS,
			version: "v4",
			// 서명 URL은 302로 이동한 크로스 오리진 응답이라 <a download>가 안 먹는다.
			// 다운로드 의도는 Content-Disposition으로 GCS가 강제하게 한다.
			...(download
				? {
						responseDisposition: `attachment; filename*=UTF-8''${encodeURIComponent(fileName)}`,
					}
				: {}),
		});

	return signedUrl;
};
```

`deletePublicObjects` 아래에 같은 allSettled 패턴으로:

```ts
export const deletePrivateObjects = async (
	storageKeys: string[]
): Promise<void> => {
	if (!isPrivateBucketConfigured() || storageKeys.length === 0) {
		return;
	}

	const bucket = getStorageClient().bucket(requirePrivateBucket());

	await Promise.allSettled(
		storageKeys.map((storageKey) =>
			bucket.file(storageKey).delete({ ignoreNotFound: true })
		)
	);
};
```

- [ ] **Step 5: `packages/api/src/services/bambi-storage.ts` 수정**

import 교체:

```ts
import {
	createPrivateSignedReadUrl,
	createPrivateSignedUploadUrl,
	createSignedUploadUrl,
	getPublicObjectUrl,
	isProductionStorageRuntime,
	isPublicBucketConfigured,
	shouldUsePrivateBucket,
} from "./gcs";
```

(`shouldUsePublicBucket` import는 제거 — 이 파일의 유일한 사용처였던 사업자 문서 흐름이 private으로 옮겨간다.)

키 규칙 교체 — 기존 `BUSINESS_DOCUMENT_KEY_ROOT`/`buildBusinessDocumentKeyPrefix`를 다음으로 대체:

```ts
// 비공개 버킷(bambi-storage-private) 키 규칙 — 전 서비스 공통:
//   seeker/{userId}/…            구직자 민감 파일(아직 미사용, 규칙만 예약)
//   employer/{orgId}/{userId}/…  구인자 민감 파일(사업자 문서가 첫 사용자)
// 구인자 파일은 조직이 소유 경계(DB organizationId)라 키에 조직 경계를 드러내
// 조직 단위 일괄 정리·감사가 프리픽스만으로 가능하게 한다.
const PRIVATE_EMPLOYER_KEY_ROOT = "employer";

const buildBusinessDocumentKeyPrefix = ({
	organizationId,
	userId,
}: {
	organizationId: string;
	userId: string;
}): string => `${PRIVATE_EMPLOYER_KEY_ROOT}/${organizationId}/${userId}/`;
```

(`isOwnedBusinessDocumentKey`는 프리픽스 빌더를 그대로 쓰므로 본문 무변경 — 규칙만 따라 바뀐다.)

`getBusinessDocumentObjectUrl`를 **삭제**하고 그 자리에:

```ts
export const getBusinessDocumentViewPath = (documentId: string): string =>
	`/bambi/business-documents/${documentId}`;

// 조회 URL은 매 요청 인가를 통과한 뒤에만 만들어진다(onboarding.createBusinessDocumentViewUrl).
// 프로덕션+버킷 구성 시 60초 서명 GET, 그 외(dev)는 로컬 플레이스홀더 라우트.
export const resolveBusinessDocumentViewUrl = async ({
	category,
	download,
	fileName,
	storageKey,
}: {
	category: ChatMediaCategory;
	download: boolean;
	fileName: string;
	storageKey: string;
}): Promise<string> =>
	shouldUsePrivateBucket()
		? await createPrivateSignedReadUrl({ download, fileName, storageKey })
		: buildLocalObjectUrl({ category, fileName, storageKey });
```

`createBusinessDocumentUploadIntent`의 `uploadUrl` 분기 교체:

```ts
		uploadUrl: isProductionStorageRuntime()
			? // 버킷 미설정이면 createPrivateSignedUploadUrl 내부 requirePrivateBucket이
				// throw 한다 — 공개 버킷·로컬 폴백 없이 업로드를 거부한다(default-deny).
				await createPrivateSignedUploadUrl({ byteSize, mimeType, storageKey })
			: buildLocalObjectUrl({
					category,
					fileName: fileName.trim(),
					storageKey,
				}),
```

- [ ] **Step 6: 테스트 통과 확인**

```bash
pnpm --filter @bambi-app/api exec vitest run test/services/bambi-storage.test.ts
```

Expected: PASS (기존 chat/editor 키 테스트 포함 전부).

이 시점에 `check-types`는 아직 깨진다(onboarding·moderation이 삭제된 `getBusinessDocumentObjectUrl`를 import) — Task 2·3에서 해소되므로 여기서는 돌리지 않는다.

---

### Task 2: onboarding 라우터 — 인텐트·응답·조회 프로시저·삭제 교체

**Files:**
- Modify: `packages/api/src/routers/bambi/onboarding.ts`

**Interfaces:**
- Consumes (Task 1): `resolveBusinessDocumentViewUrl`, `getBusinessDocumentViewPath`, `deletePrivateObjects`(gcs), 기존 `isOwnedBusinessDocumentKey`·`createBusinessDocumentUploadIntent`(시그니처 무변경).
- Consumes (기존): `requireAdminProfile`(`../../services/bambi-authz`), `employerBusinessDocument`, `db`, `ORPCError`, `protectedProcedure`, `z`.
- Produces: 프로시저 `createBusinessDocumentViewUrl` — input `{ documentId: string; download?: boolean }`, output `{ url: string }`. 웹 라우트(Task 4)와 라우터 테스트(Task 5)가 이 이름·모양에 의존한다.

- [ ] **Step 1: import 정리**

- `getBusinessDocumentObjectUrl` import 제거, 같은 자리(`../../services/bambi-storage`)에 `getBusinessDocumentViewPath`, `resolveBusinessDocumentViewUrl` 추가.
- gcs import의 `deletePublicObjects` → `deletePrivateObjects` (이 파일에서 사업자 문서 삭제가 유일한 사용처인지 확인 — 다른 사용처가 있으면 둘 다 유지).
- `requireAdminProfile`를 `../../services/bambi-authz`에서 추가 import (기존 bambi-authz import 문에 합류).

- [ ] **Step 2: 응답 매퍼 교체**

`toBusinessDocumentResponse`(351행 부근)의 `objectUrl` 값을 교체:

```ts
	objectUrl: getBusinessDocumentViewPath(document.id),
```

(함수는 동기 유지 — 서명은 조회 프로시저가 담당하므로 목록 응답에서 async가 필요 없다.)

- [ ] **Step 3: 조회 프로시저 추가**

input 스키마들 옆(179행 `deleteBusinessDocumentInput` 근처)에:

```ts
const businessDocumentViewInput = z.object({
	documentId: z.string().min(1),
	download: z.boolean().default(false),
});
```

`deleteBusinessDocument` 프로시저 정의 앞에 추가:

```ts
	// 목록 응답에는 앱 경로(/bambi/business-documents/{id})만 실린다. 실제 파일 위치는
	// 이 프로시저가 매 호출 인가를 통과한 요청에만 내려준다 — 서명 URL(60초)이 응답·캐시에
	// 상주하지 않으므로 URL 유출·공유가 무의미하다.
	createBusinessDocumentViewUrl: protectedProcedure
		.input(businessDocumentViewInput)
		.handler(async ({ context, input }) => {
			const userId = context.session.user.id;
			const [document] = await db
				.select()
				.from(employerBusinessDocument)
				.where(eq(employerBusinessDocument.id, input.documentId))
				.limit(1);

			if (!document) {
				throw new ORPCError("NOT_FOUND", {
					message: "Business document was not found.",
				});
			}

			// 소유 축은 "올린 본인"(createdByUserId)이다. 같은 조직의 다른 멤버도 볼 수 없고,
			// 본인이 아니면 운영자(admin)만 통과한다(심사 화면).
			if (document.createdByUserId !== userId) {
				await requireAdminProfile(context.session);
			}

			return {
				url: await resolveBusinessDocumentViewUrl({
					category: document.category,
					download: input.download,
					fileName: document.fileName,
					storageKey: document.storageKey,
				}),
			};
		}),
```

- [ ] **Step 4: 삭제 경로 교체**

`deleteBusinessDocument` 핸들러 말미(708행 부근):

```ts
			await deletePrivateObjects([document.storageKey]);
```

- [ ] **Step 5: 타입 확인**

```bash
pnpm --filter @bambi-app/api run check-types
```

Expected: moderation.ts의 `getBusinessDocumentObjectUrl` 에러만 남음(Task 3 해소 대상). Task 3와 병렬 실행 중이면 이 스텝은 생략하고 Task 5의 일괄 검증에 맡긴다.

---

### Task 3: moderation 라우터 — 심사 응답 교체 + 운영자 삭제 프로시저

**Files:**
- Modify: `packages/api/src/routers/bambi/moderation.ts`

**Interfaces:**
- Consumes (Task 1): `getBusinessDocumentViewPath`(bambi-storage), `deletePrivateObjects`(gcs).
- Consumes (기존): `adminProcedure`(이미 49행에서 import됨), `employerBusinessDocument`, `db`, `ORPCError`, `z`, `eq`.
- Produces: 프로시저 `deleteBusinessDocument` — input `{ documentId: string }`, output `{ id: string }`. 심사 화면(Task 4)과 라우터 테스트(Task 5)가 의존.

- [ ] **Step 1: import 교체**

- `getBusinessDocumentObjectUrl` import 제거 → `getBusinessDocumentViewPath` 추가(`../../services/bambi-storage`).
- gcs import에 `deletePrivateObjects` 추가(기존 `deletePublicObjects`는 이 파일의 다른 사용처가 있으면 유지).

- [ ] **Step 2: listEmployers 응답 교체**

3119행 부근:

```ts
					objectUrl: getBusinessDocumentViewPath(document.id),
```

- [ ] **Step 3: 운영자 삭제 프로시저 추가**

`listEmployers` 프로시저 정의가 끝나는 3132행 부근(다음 프로시저 `listPendingTeamInvitations` 앞)에 추가:

```ts
	// 운영자의 부적절 서류 제거 수단. 구인자 본인 삭제(onboarding.deleteBusinessDocument)와
	// 달리 조직 verificationStatus 전이를 하지 않는다 — 심사 판정은 별도 반려 플로우가 담당.
	deleteBusinessDocument: adminProcedure
		.input(z.object({ documentId: z.string().min(1) }))
		.handler(async ({ input }) => {
			const [document] = await db
				.select({
					id: employerBusinessDocument.id,
					storageKey: employerBusinessDocument.storageKey,
				})
				.from(employerBusinessDocument)
				.where(eq(employerBusinessDocument.id, input.documentId))
				.limit(1);

			if (!document) {
				throw new ORPCError("NOT_FOUND", {
					message: "Business document was not found.",
				});
			}

			await db
				.delete(employerBusinessDocument)
				.where(eq(employerBusinessDocument.id, document.id));
			await deletePrivateObjects([document.storageKey]);

			return { id: document.id };
		}),
```

- [ ] **Step 4: 타입 확인**

```bash
pnpm --filter @bambi-app/api run check-types
```

Expected: PASS (Task 2도 끝났다면). 병렬 실행 중이면 Task 5의 일괄 검증에 맡긴다.

---

### Task 4: web — 조회 라우트·로컬 라우트·두 화면·매뉴얼 + web 테스트

**Files:**
- Create: `apps/web/src/app/bambi/business-documents/[documentId]/route.ts`
- Modify: `apps/web/src/app/bambi/local-chat-attachments/route.ts` (프리픽스 상수 1곳)
- Modify: `apps/web/src/components/bambi/business-document-uploader.tsx` (다운로드 링크 1곳)
- Modify: `apps/web/src/app/moderator/employers/page.tsx` (다운로드 링크 + 삭제 버튼·확인 다이얼로그)
- Modify: `docs/manual/moderator-manual.md` (업소 관리 절에 서류 삭제 1항목)
- Test: `apps/web/test/app/bambi/business-documents-route.test.ts` (신규)

**Interfaces:**
- Consumes: `client`(`@/utils/orpc` — SSR 분기가 요청 헤더를 통째로 API 서버에 포워딩하므로 라우트 핸들러에서 그대로 세션이 전달된다), 프로시저 `client.bambi.onboarding.createBusinessDocumentViewUrl({ documentId, download })`(Task 2), `orpc.bambi.moderation.deleteBusinessDocument`(Task 3), `ORPCError`(`@orpc/client`).
- Produces: 웹 경로 `GET /bambi/business-documents/{documentId}[?download=1]` — 302(서명 URL) / 401 / 403 / 404.

- [ ] **Step 1: 실패하는 라우트 테스트 작성**

`apps/web/test/app/bambi/business-documents-route.test.ts` (테스트 컨벤션: `test/` 미러 구조, `@/` alias):

```ts
import { ORPCError } from "@orpc/client";
import { beforeEach, describe, expect, it, vi } from "vitest";

const createBusinessDocumentViewUrl = vi.fn();

vi.mock("@/utils/orpc", () => ({
	client: {
		bambi: {
			onboarding: {
				createBusinessDocumentViewUrl: (input: unknown) =>
					createBusinessDocumentViewUrl(input),
			},
		},
	},
}));

const { GET } = await import(
	"@/app/bambi/business-documents/[documentId]/route"
);

const buildRequest = (search = "") =>
	new Request(`http://localhost:23001/bambi/business-documents/doc_1${search}`);

const buildContext = (documentId = "doc_1") => ({
	params: Promise.resolve({ documentId }),
});

describe("business document view route", () => {
	beforeEach(() => {
		createBusinessDocumentViewUrl.mockReset();
	});

	it("인가 통과 시 서명 URL로 302 리다이렉트하고 캐시를 금지한다", async () => {
		createBusinessDocumentViewUrl.mockResolvedValue({
			url: "https://storage.googleapis.com/bambi-storage-private/employer/o/u/k",
		});

		const response = await GET(buildRequest() as never, buildContext());

		expect(createBusinessDocumentViewUrl).toHaveBeenCalledWith({
			documentId: "doc_1",
			download: false,
		});
		expect(response.status).toBe(302);
		expect(response.headers.get("location")).toBe(
			"https://storage.googleapis.com/bambi-storage-private/employer/o/u/k"
		);
		expect(response.headers.get("cache-control")).toBe("no-store");
	});

	it("download=1이면 다운로드 의도를 프로시저에 전달한다", async () => {
		createBusinessDocumentViewUrl.mockResolvedValue({ url: "https://gcs/x" });

		await GET(buildRequest("?download=1") as never, buildContext());

		expect(createBusinessDocumentViewUrl).toHaveBeenCalledWith({
			documentId: "doc_1",
			download: true,
		});
	});

	it("dev 로컬 상대 URL도 웹 오리진 기준 절대 URL로 302 한다", async () => {
		createBusinessDocumentViewUrl.mockResolvedValue({
			url: "/bambi/local-chat-attachments?category=pdf&fileName=a.pdf&key=k",
		});

		const response = await GET(buildRequest() as never, buildContext());

		expect(response.status).toBe(302);
		expect(response.headers.get("location")).toBe(
			"http://localhost:23001/bambi/local-chat-attachments?category=pdf&fileName=a.pdf&key=k"
		);
	});

	it.each([
		["UNAUTHORIZED", 401],
		["FORBIDDEN", 403],
		["NOT_FOUND", 404],
	] as const)("프로시저 %s 에러를 %i로 매핑한다", async (code, status) => {
		createBusinessDocumentViewUrl.mockRejectedValue(new ORPCError(code));

		const response = await GET(buildRequest() as never, buildContext());

		expect(response.status).toBe(status);
	});

	it("알 수 없는 실패는 500으로 응답한다", async () => {
		createBusinessDocumentViewUrl.mockRejectedValue(new Error("boom"));

		const response = await GET(buildRequest() as never, buildContext());

		expect(response.status).toBe(500);
	});
});
```

- [ ] **Step 2: 실패 확인**

```bash
pnpm --filter web exec vitest run test/app/bambi/business-documents-route.test.ts
```

Expected: FAIL — 라우트 모듈 없음.

- [ ] **Step 3: 조회 라우트 구현**

`apps/web/src/app/bambi/business-documents/[documentId]/route.ts`:

```ts
import { ORPCError } from "@orpc/client";
import { type NextRequest, NextResponse } from "next/server";
import { client } from "@/utils/orpc";

const ERROR_STATUS: Record<string, number> = {
	FORBIDDEN: 403,
	NOT_FOUND: 404,
	UNAUTHORIZED: 401,
};

// 사업자 문서 조회 관문. 목록 응답에는 이 경로만 실리고, 실제 파일 위치(60초 서명 URL)는
// 매 요청 oRPC 프로시저의 세션·소유(올린 본인 또는 운영자) 검증을 통과해야만 나온다 —
// 이 URL이 유출·공유돼도 세션 없이는 무용지물이다. client의 SSR 분기가 들어온 요청
// 헤더(쿠키 포함)를 API 서버로 통째로 포워딩하므로 세션이 그대로 전달된다.
export async function GET(
	request: NextRequest,
	{ params }: { params: Promise<{ documentId: string }> }
) {
	const { documentId } = await params;
	const download = request.nextUrl.searchParams.get("download") === "1";

	try {
		const { url } = await client.bambi.onboarding.createBusinessDocumentViewUrl(
			{ documentId, download }
		);

		return NextResponse.redirect(new URL(url, request.nextUrl.origin), {
			headers: { "cache-control": "no-store" },
			status: 302,
		});
	} catch (error) {
		const status =
			error instanceof ORPCError ? (ERROR_STATUS[error.code] ?? 500) : 500;

		return new Response("문서를 열 수 없습니다.", { status });
	}
}
```

주의: 테스트가 `new Request(...)`를 `NextRequest` 자리에 넘긴다. `request.nextUrl`이 일반 `Request`에는 없으므로, 구현에서 `request.nextUrl` 대신 `new URL(request.url)`을 쓰면 테스트와 런타임 모두에서 동작한다:

```ts
	const requestUrl = new URL(request.url);
	const download = requestUrl.searchParams.get("download") === "1";
	// … new URL(url, requestUrl.origin)
```

이 형태를 최종본으로 한다(`NextRequest` 타입 import 불필요, 파라미터 타입은 `Request`).

- [ ] **Step 4: 테스트 통과 확인**

```bash
pnpm --filter web exec vitest run test/app/bambi/business-documents-route.test.ts
```

Expected: PASS.

- [ ] **Step 5: 로컬 플레이스홀더 라우트 프리픽스 갱신**

`apps/web/src/app/bambi/local-chat-attachments/route.ts` 6행:

```ts
// 비공개 버킷 키 규칙의 구인자 루트(employer/{orgId}/{userId}/…)를 따른다.
const BUSINESS_DOCUMENT_KEY_PREFIX = "employer/";
```

- [ ] **Step 6: 업로더 다운로드 링크 갱신**

`apps/web/src/components/bambi/business-document-uploader.tsx` 다운로드 anchor(255행 부근)의 href만 교체:

```tsx
										href={`${document.objectUrl}?download=1`}
```

(`download={document.fileName}` 속성은 dev 동일 오리진에서 여전히 유효하므로 유지. 새 창 보기 anchor는 무변경 — objectUrl 값 자체가 앱 경로로 바뀐다.)

- [ ] **Step 7: 심사 화면 — 다운로드 링크 + 운영자 삭제 버튼**

`apps/web/src/app/moderator/employers/page.tsx`:

1. import 추가: `Trash2`(lucide-react), AlertDialog 계열(`@bambi-app/ui/components/alert-dialog`):

```ts
import {
	AlertDialog,
	AlertDialogAction,
	AlertDialogCancel,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogTitle,
} from "@bambi-app/ui/components/alert-dialog";
import { Download, Trash2 } from "lucide-react";
```

2. 컴포넌트 상태·뮤테이션 추가(`decide` 아래):

```ts
	const [pendingDeleteDocumentId, setPendingDeleteDocumentId] = useState<
		string | null
	>(null);
	const deleteDocument = useMutation(
		orpc.bambi.moderation.deleteBusinessDocument.mutationOptions({
			onSuccess: async () => {
				toast.success("서류를 삭제했어요.");
				await queryClient.invalidateQueries({
					queryKey: orpc.bambi.moderation.listEmployers.key(),
				});
			},
			onError: (error) => toast.error(error.message),
		})
	);
```

3. 문서 li 안의 다운로드 anchor href 교체 + 삭제 버튼 추가(187행 부근). 기존 anchor를 감싸는 행 컨테이너로 바꾼다:

```tsx
												<li className="min-w-0" key={document.id}>
													<ChatAttachmentPreview
														attachment={document}
														mine={false}
													/>
													<div className="mt-2 flex gap-2">
														<a
															className={buttonVariants({
																className: "flex-1",
																size: "sm",
																variant: "outline",
															})}
															download={document.fileName}
															href={`${document.objectUrl}?download=1`}
														>
															<Download aria-hidden />
															다운로드
														</a>
														<Button
															aria-label={`${document.fileName} 삭제`}
															disabled={deleteDocument.isPending}
															onClick={() =>
																setPendingDeleteDocumentId(document.id)
															}
															size="sm"
															type="button"
															variant="outline"
														>
															<Trash2 aria-hidden />
														</Button>
													</div>
												</li>
```

4. 페이지 루트(최상위 `</div>` 직전)에 확인 다이얼로그(업로더의 controlled-open 패턴과 동일):

```tsx
			<AlertDialog
				onOpenChange={(open) => {
					if (!open) {
						setPendingDeleteDocumentId(null);
					}
				}}
				open={pendingDeleteDocumentId !== null}
			>
				<AlertDialogContent>
					<AlertDialogHeader>
						<AlertDialogTitle>이 서류를 삭제하시겠습니까?</AlertDialogTitle>
						<AlertDialogDescription>
							파일이 저장소에서 함께 제거되며 되돌릴 수 없습니다. 업소 인증
							상태는 바뀌지 않습니다 — 판정이 필요하면 반려를 사용하세요.
						</AlertDialogDescription>
					</AlertDialogHeader>
					<AlertDialogFooter>
						<AlertDialogCancel>취소</AlertDialogCancel>
						<AlertDialogAction
							onClick={() => {
								if (pendingDeleteDocumentId) {
									deleteDocument.mutate({
										documentId: pendingDeleteDocumentId,
									});
								}
								setPendingDeleteDocumentId(null);
							}}
						>
							삭제
						</AlertDialogAction>
					</AlertDialogFooter>
				</AlertDialogContent>
			</AlertDialog>
```

(구현 전 `packages/ui/src/components/alert-dialog.tsx`의 실제 export 구성을 확인하고, `AlertDialogAction`/`AlertDialogCancel`이 없거나 시그니처가 다르면 업로더(`business-document-uploader.tsx` 322행 이하)의 실사용 패턴을 그대로 복제한다.)

- [ ] **Step 8: 운영자 매뉴얼 갱신**

`docs/manual/moderator-manual.md`의 업소 관리(사업자 인증 심사) 절에서 서류 확인을 설명하는 목록에 한 항목 추가:

```markdown
- 서류 카드의 휴지통 버튼으로 부적절한 서류(무관한 파일, 과도한 개인정보 노출본 등)를 삭제할 수 있습니다. 삭제해도 업소 인증 상태는 바뀌지 않으므로, 판정이 필요하면 반려를 사용하세요. 서류 열람·다운로드 링크는 로그인한 본인(제출자)과 운영자에게만 동작합니다.
```

(절 제목이 다르면 사업자 서류 심사를 다루는 가장 가까운 절에 넣는다.)

- [ ] **Step 9: web 테스트 일괄 확인**

```bash
pnpm --filter web exec vitest run test/app/bambi/business-documents-route.test.ts
```

Expected: PASS.

---

### Task 5: 라우터 테스트 갱신 + 일괄 검증 (순차, 병렬 금지)

**Files:**
- Modify: `packages/api/test/routers/bambi/business-documents.test.ts` (갱신만, **실행 금지**)
- Modify: 검증 중 발견된 회귀 파일들

**Interfaces:**
- Consumes: Task 1–4의 모든 산출물.

- [ ] **Step 1: 라우터 테스트 파일 갱신 (실행하지 않는다)**

`packages/api/test/routers/bambi/business-documents.test.ts`를 읽고:

1. `objectUrl` 기대값을 `/bambi/business-documents/${document.id}` 형태로 교체.
2. storageKey 픽스처가 옛 규칙(`bambi-business-documents/...`)을 쓰면 `employer/{orgId}/{userId}/...`로 교체 (`isOwnedBusinessDocumentKey` 검증 경로가 있으므로 규칙과 맞춰야 한다).
3. 파일의 기존 픽스처·헬퍼 패턴을 그대로 따라 두 케이스 추가:
   - `createBusinessDocumentViewUrl`: 올린 본인 → `{ url }` 반환(비프로덕션이라 `/bambi/local-chat-attachments?` 프리픽스), 같은 조직 다른 멤버 → FORBIDDEN, 운영자 → 성공, 없는 문서 → NOT_FOUND.
   - `moderation.deleteBusinessDocument`: 운영자 → 행 삭제 확인, 비운영자 → FORBIDDEN, 없는 문서 → NOT_FOUND.

이 스위트는 dev DB를 지우는 사고 이력 때문에 **절대 실행하지 않는다**. 타입 정합은 Step 3의 `check-types`가 잡는다.

- [ ] **Step 2: 린트**

워크트리 루트에서 (ultracite는 경로 인자가 없으면 0개 파일을 검사한다 — 반드시 경로를 준다):

```bash
pnpm dlx ultracite fix packages/env/src/server.ts packages/api/src/services/gcs.ts packages/api/src/services/bambi-storage.ts packages/api/src/routers/bambi/onboarding.ts packages/api/src/routers/bambi/moderation.ts packages/api/test/services/bambi-storage.test.ts packages/api/test/routers/bambi/business-documents.test.ts apps/web/src/app/bambi/business-documents apps/web/src/app/bambi/local-chat-attachments/route.ts apps/web/src/components/bambi/business-document-uploader.tsx apps/web/src/app/moderator/employers/page.tsx apps/web/test/app/bambi/business-documents-route.test.ts
```

Expected: 오류 0 (자동 수정 허용).

- [ ] **Step 3: 타입 체크**

```bash
pnpm --filter @bambi-app/api run check-types
pnpm --filter web run check-types
```

Expected: 둘 다 PASS. (web은 워크트리의 자체 `.next` 기준이라 메인 리포의 낡은 `.next` 오탐 이슈 없음.)

- [ ] **Step 4: 테스트 실행 (허용 범위만)**

```bash
pnpm --filter @bambi-app/api exec vitest run test/services/bambi-storage.test.ts
pnpm --filter web exec vitest run test/app/bambi/business-documents-route.test.ts
```

Expected: 전부 PASS. `test/routers/bambi`는 실행 금지.

- [ ] **Step 5: 스펙 대비 최종 점검**

스펙의 각 요구가 코드에 있는지 훑는다: 키 규칙(employer 3단), default-deny 업로드, 60초 서명 GET, 매 요청 세션 검증 라우트, 본인-또는-운영자 인가, 운영자 삭제(상태 전이 없음), dev 로컬 폴백, 배포 체크리스트는 코드 밖(무변경 확인).

---

## Workflow 병렬 실행 매핑 (컨트롤러용)

- **Phase 1 (단독):** Task 1 → 컨트롤러 커밋 `feat: 비공개 버킷 기반 계층(env·gcs·storage) 추가`
- **Phase 2 (병렬 3):** Task 2 ∥ Task 3 ∥ Task 4 — 파일 교집합 없음. 각 태스크의 중간 `check-types` 스텝은 병렬 중 생략(Task 5로 이월). → 컨트롤러 커밋(태스크별 1커밋, 순차)
- **Phase 3 (단독):** Task 5 → 컨트롤러 커밋 `test: 사업자 문서 라우터 테스트 갱신 및 검증`
- 서브에이전트 공통 지침: git 명령 금지, graphify query 우선, 워크트리 절대 경로 사용, 스펙·플랜 파일 경로 전달.
