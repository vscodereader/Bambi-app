import { beforeEach, describe, expect, it, vi } from "vitest";

const gcsMocks = vi.hoisted(() => ({
	createPrivateSignedReadUrl: vi.fn(),
	createPrivateSignedUploadUrl: vi.fn(),
	createSignedUploadUrl: vi.fn(),
	getPublicObjectUrl: vi.fn(),
}));

vi.mock("@/services/gcs", () => ({
	...gcsMocks,
	isProductionStorageRuntime: () => false,
	isPublicBucketConfigured: () => true,
	shouldUsePrivateBucket: () => false,
}));

import {
	createBusinessDocumentUploadIntent,
	resolveBusinessDocumentViewUrl,
} from "@/services/bambi-storage";

describe("business document local storage fallback", () => {
	beforeEach(() => {
		gcsMocks.createPrivateSignedReadUrl.mockClear();
		gcsMocks.createPrivateSignedUploadUrl.mockClear();
		gcsMocks.createSignedUploadUrl.mockClear();
		gcsMocks.getPublicObjectUrl.mockClear();
	});

	it("uses the local upload flow when not running in production", async () => {
		const intent = await createBusinessDocumentUploadIntent({
			actorUserId: "user-1",
			byteSize: 1024,
			category: "image",
			fileName: "business-license.png",
			mimeType: "image/png",
			organizationId: "organization-1",
		});

		expect(intent.uploadUrl).toContain("/bambi/local-chat-attachments?");
		expect(intent.uploadUrl).toContain(
			`key=${encodeURIComponent(intent.storageKey)}`
		);
		await expect(
			resolveBusinessDocumentViewUrl({
				category: intent.category,
				download: false,
				fileName: intent.fileName,
				storageKey: intent.storageKey,
			})
		).resolves.toContain("/bambi/local-chat-attachments?");
		expect(gcsMocks.createPrivateSignedReadUrl).not.toHaveBeenCalled();
		expect(gcsMocks.createPrivateSignedUploadUrl).not.toHaveBeenCalled();
		expect(gcsMocks.createSignedUploadUrl).not.toHaveBeenCalled();
		expect(gcsMocks.getPublicObjectUrl).not.toHaveBeenCalled();
	});
});
