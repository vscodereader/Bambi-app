"use client";

import { useParams } from "next/navigation";
import { CommunityCrawledTopicDetailScreen } from "@/components/bambi/screens/community-crawled-topic-detail";

// 정적 세그먼트 crawled가 형제 [board]보다 우선하므로 순수 글 라우팅과 충돌하지 않는다.
// 입장 게이트·사이드 배너는 community/layout.tsx가 감싼다(순수 글 상세와 동일).
export default function SeekerCommunityCrawledPage() {
	const params = useParams<{ id: string }>();

	return <CommunityCrawledTopicDetailScreen topicId={params.id} />;
}
