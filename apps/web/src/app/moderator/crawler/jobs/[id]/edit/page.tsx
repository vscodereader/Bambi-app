"use client";

import { use } from "react";
import { CrawledImageEditor } from "@/components/bambi/crawled-image-editor/crawled-image-editor";
import {
	crawledJobListHref,
	parseCrawledJobListState,
} from "@/lib/bambi/crawled-job-management";

export default function CrawledJobImageEditPage({
	params,
	searchParams,
}: {
	params: Promise<{ id: string }>;
	searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
	const { id } = use(params);
	const query = use(searchParams);
	const normalized = new URLSearchParams();
	const returnPage = query.returnPage;
	const returnStatus = query.returnStatus;
	if (typeof returnPage === "string") {
		normalized.set("returnPage", returnPage);
	}
	if (typeof returnStatus === "string") {
		normalized.set("returnStatus", returnStatus);
	}
	const returnHref = crawledJobListHref(
		parseCrawledJobListState(normalized, "return")
	);
	return <CrawledImageEditor postId={id} returnHref={returnHref} />;
}
