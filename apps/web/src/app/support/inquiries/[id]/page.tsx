"use client";

import { useParams } from "next/navigation";
import { InquiryThread } from "@/components/bambi/support/inquiry-thread";

export default function SupportInquiryDetailPage() {
	// Next 16에서 클라이언트 컴포넌트의 params prop은 Promise다.
	// 기존 상세 페이지(seeker/community/[board]/[postId])와 동일하게 useParams를 쓴다.
	const params = useParams<{ id: string }>();

	return <InquiryThread inquiryId={params.id} />;
}
