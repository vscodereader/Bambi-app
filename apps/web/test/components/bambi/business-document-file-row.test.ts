import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { srcPath } from "../../src-path";

const rowSource = readFileSync(
	srcPath("components/bambi/business-document-file-row.tsx"),
	"utf8"
);
const uploaderSource = readFileSync(
	srcPath("components/bambi/business-document-uploader.tsx"),
	"utf8"
);
const moderatorSource = readFileSync(
	srcPath("app/moderator/employers/page.tsx"),
	"utf8"
);

describe("business document file rows", () => {
	it("reuses one file row for saved, staged, and moderated documents", () => {
		expect(uploaderSource).toContain("<BusinessDocumentFileRow");
		expect(uploaderSource).toContain("<StagedBusinessDocumentRow");
		expect(moderatorSource).toContain("<BusinessDocumentFileRow");
		expect(moderatorSource).not.toContain("ChatAttachmentPreview");
	});

	it("opens and downloads both image and PDF files with separate actions", () => {
		expect(rowSource).toContain('document.category === "image"');
		expect(rowSource).toContain("<ImageIcon");
		expect(rowSource).toContain("<FileText");
		expect(rowSource).toContain('target="_blank"');
		expect(rowSource).toContain("download={document.fileName}");
		expect(rowSource).toContain("{actions}");
	});

	it("uses local object URLs for staged files and releases them", () => {
		expect(uploaderSource).toContain("URL.createObjectURL(file)");
		expect(uploaderSource).toContain("URL.revokeObjectURL(nextObjectUrl)");
		expect(uploaderSource).toContain("downloadUrl={objectUrl}");
		expect(uploaderSource).toContain("viewUrl={objectUrl}");
	});

	it("keeps document grids single-column until the desktop breakpoint", () => {
		const gridClass = "grid grid-cols-1 gap-2 md:grid-cols-2";
		expect(uploaderSource.match(new RegExp(gridClass, "g"))).toHaveLength(2);
		expect(moderatorSource).toContain(
			'ul className="grid grid-cols-1 gap-3 md:grid-cols-2"'
		);
		expect(moderatorSource).not.toContain("lg:grid-cols-3");
	});

	it("disables only repeated approval for verified employers", () => {
		expect(moderatorSource).toContain(
			'employer.verificationStatus === "verified"'
		);
		expect(moderatorSource).toContain(
			"disabled={decide.isPending || !canReject}"
		);
	});
});
