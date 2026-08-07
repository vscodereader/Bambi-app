import { beforeEach, describe, expect, it, vi } from "vitest";

const gcsMocks = vi.hoisted(() => ({
	createSignedUploadUrl: vi.fn(),
	getPublicObjectUrl: vi.fn(),
}));

vi.mock("./gcs", () => ({
	...gcsMocks,
	isPublicBucketConfigured: () => true,
	shouldUsePublicBucket: () => false,
}));

import {
	createBusinessDocumentUploadIntent,
	getBusinessDocumentObjectUrl,
} from "./bambi-storage";

describe("business document local storage fallback", () => {
	beforeEach(() => {
		gcsMocks.createSignedUploadUrl.mockClear();
		gcsMocks.getPublicObjectUrl.mockClear();
	});

	it("uses the local upload flow when the public bucket is disabled at runtime", async () => {
		const intent = await createBusinessDocumentUploadIntent({
			actorUserId: "user-1",
			byteSize: 1024,
			category: "image",
			fileName: "business-license.png",
			mimeType: "image/png",
			organizationId: "organization-1",
		});

		expect(intent.uploadUrl).toBe(`local://upload/${intent.storageKey}`);
		expect(
			getBusinessDocumentObjectUrl({
				category: intent.category,
				fileName: intent.fileName,
				storageKey: intent.storageKey,
			})
		).toContain("/bambi/local-chat-attachments?");
		expect(gcsMocks.createSignedUploadUrl).not.toHaveBeenCalled();
		expect(gcsMocks.getPublicObjectUrl).not.toHaveBeenCalled();
	});
});
