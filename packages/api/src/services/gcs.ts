import { env } from "@bambi-app/env/server";
import { Storage } from "@google-cloud/storage";

const SIGNED_UPLOAD_URL_TTL_MS = 5 * 60 * 1000;
const SIGNED_READ_URL_TTL_MS = 60 * 1000;
const PUBLIC_OBJECT_BASE_URL = "https://storage.googleapis.com";

export interface SignedUploadUrlInput {
	byteSize: number;
	mimeType: string;
	storageKey: string;
}

let storageClient: null | Storage = null;

// 자격 증명은 ADC(Application Default Credentials)가 해결한다.
// 로컬은 `gcloud auth application-default login --impersonate-service-account=...`,
// Cloud Run은 런타임 서비스 계정. 어느 쪽도 JSON 키를 두지 않는다.
const getStorageClient = (): Storage => {
	storageClient ??= new Storage(
		env.GCP_PROJECT_ID ? { projectId: env.GCP_PROJECT_ID } : {}
	);

	return storageClient;
};

export const getPublicBucketName = (): string | undefined =>
	env.GCS_PUBLIC_BUCKET;

export const isPublicBucketConfigured = (): boolean =>
	Boolean(env.GCS_PUBLIC_BUCKET);

// 개발 환경은 운영용 버킷 이름이 복사되어 있어도 ADC가 없을 수 있다.
// 로컬 플레이스홀더 업로드를 유지하고 실제 GCS 업로드는 운영에서만 사용한다.
export const shouldUsePublicBucket = (): boolean =>
	env.NODE_ENV === "production" && isPublicBucketConfigured();

const requirePublicBucket = (): string => {
	const bucketName = env.GCS_PUBLIC_BUCKET;

	if (!bucketName) {
		throw new Error("GCS_PUBLIC_BUCKET 환경 변수가 설정되지 않았습니다.");
	}

	return bucketName;
};

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

export const getPublicObjectUrl = (storageKey: string): string =>
	`${PUBLIC_OBJECT_BASE_URL}/${requirePublicBucket()}/${storageKey}`;

// 서명에 Content-Type과 Content-Length를 묶는다. 클라이언트가 선언한 값과 실제
// 업로드가 다르면 GCS가 거부하므로, 용량·타입 정책이 서버 검증을 넘어 GCS에서도 강제된다.
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
): Promise<string> =>
	createSignedUploadUrlForBucket(requirePublicBucket(), input);

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

// 서버가 바이트를 직접 올리는 uploadPublicObject와 프리픽스로 기존 객체를 찾는
// findPublicObjectUrl은 크롤 이미지 미러링 전용이었고, 수집 이미지를 DB에 base64로 담기로
// 하면서 유일한 호출자가 사라져 걷어냈다. 서버 업로드가 다시 필요해지면 되살릴 것 —
// 사람이 올리는 미디어는 브라우저가 서명 URL로 직접 올린다(createSignedUploadUrl).

// 공고·미디어 삭제는 DB가 정본이므로, 객체 삭제 실패가 API 실패로 번지지 않게 한다.
// (이미 지워졌거나 애초에 업로드되지 않은 키가 섞여 들어올 수 있다.)
export const deletePublicObjects = async (
	storageKeys: string[]
): Promise<void> => {
	if (!isPublicBucketConfigured() || storageKeys.length === 0) {
		return;
	}

	const bucket = getStorageClient().bucket(requirePublicBucket());

	await Promise.allSettled(
		storageKeys.map((storageKey) =>
			bucket.file(storageKey).delete({ ignoreNotFound: true })
		)
	);
};

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
