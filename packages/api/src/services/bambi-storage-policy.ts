export const EDITOR_MEDIA_KEY_ROOT = "bambi-editor-media";
export const JOB_POST_MEDIA_KEY_ROOT = "bambi-job-post-media";
export const CHAT_ATTACHMENT_KEY_ROOT = "bambi-chat";
export const EMPLOYER_PRIVATE_KEY_ROOT = "employer";
export const LOCAL_EDITOR_MEDIA_PATH = "/bambi/local-editor-media";
export const LOCAL_JOB_MEDIA_PATH = "/bambi/local-job-media";
export const LOCAL_PRIVATE_MEDIA_PATH = "/bambi/local-chat-attachments";

export const editorMediaKeyPrefix = (userId: string): string =>
	`${EDITOR_MEDIA_KEY_ROOT}/${userId}/`;

export const jobPostMediaKeyPrefix = (organizationId: string): string =>
	`${JOB_POST_MEDIA_KEY_ROOT}/${organizationId}/`;

export const localJobPostMediaKeyPrefix = (organizationId: string): string =>
	`${jobPostMediaKeyPrefix(organizationId)}local/`;

export const isEditorMediaStorageKey = (storageKey: string): boolean =>
	storageKey.startsWith(`${EDITOR_MEDIA_KEY_ROOT}/`);

export const isLocalJobPostMediaStorageKey = (storageKey: string): boolean => {
	const segments = storageKey.split("/");
	return segments[0] === JOB_POST_MEDIA_KEY_ROOT && segments[2] === "local";
};

export const isJobPostMediaStorageKey = (storageKey: string): boolean =>
	storageKey.startsWith(`${JOB_POST_MEDIA_KEY_ROOT}/`);

export const buildLocalMediaUrl = (
	pathname: string,
	storageKey: string,
	fileName?: string
): string =>
	`${pathname}?${new URLSearchParams({
		...(fileName ? { fileName } : {}),
		key: storageKey,
	}).toString()}`;
