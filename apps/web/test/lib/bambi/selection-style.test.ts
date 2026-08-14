import { describe, expect, it } from "vitest";
import {
	SELECTED_JOB_CARD_CLASS,
	SELECTED_TAG_CLASS,
} from "@/lib/bambi/selection-style";

const DISALLOWED_SELECTED_BG_RE = /\bbg-(?:ink|coral|primary|white\/)/;

describe("selected visual styles", () => {
	it("keeps selected tags on the base surface and uses border emphasis", () => {
		expect(SELECTED_TAG_CLASS).toContain("border-coral-500");
		expect(SELECTED_TAG_CLASS).toContain("bg-card");
		expect(SELECTED_TAG_CLASS).not.toMatch(DISALLOWED_SELECTED_BG_RE);
	});

	it("keeps selected job cards on the base surface and uses border emphasis", () => {
		expect(SELECTED_JOB_CARD_CLASS).toContain("border-coral-500");
		expect(SELECTED_JOB_CARD_CLASS).toContain("bg-card");
		expect(SELECTED_JOB_CARD_CLASS).not.toMatch(DISALLOWED_SELECTED_BG_RE);
	});
});
