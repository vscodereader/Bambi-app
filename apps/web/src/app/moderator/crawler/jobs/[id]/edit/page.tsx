"use client";

import { use } from "react";
import { CrawledImageEditor } from "@/components/bambi/crawled-image-editor/crawled-image-editor";

export default function CrawledJobImageEditPage({
	params,
}: {
	params: Promise<{ id: string }>;
}) {
	const { id } = use(params);
	return <CrawledImageEditor postId={id} />;
}
