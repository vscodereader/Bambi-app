"use client";

import Image from "next/image";
import { Badge, Card } from "./ds";

interface EmployerListingPreviewProps {
	companyName: string;
	coverImageUrl?: string;
	location: string;
	pay: string;
	title: string;
}

const getInitials = (value: string): string =>
	Array.from(value.trim()).slice(0, 2).join("") || "검증";

export function EmployerListingPreview({
	companyName,
	coverImageUrl,
	location,
	pay,
	title,
}: EmployerListingPreviewProps) {
	const displayCompanyName = companyName.trim() || "검증 업체";

	return (
		<Card className="rounded-lg" pad="md" tone="outline">
			<div className="mb-3 flex items-center justify-between gap-3">
				<h2 className="m-0 font-extrabold text-sm">목록 노출 미리보기</h2>
				<Badge tone="pending">대표 이미지 반영</Badge>
			</div>
			<div className="flex items-start gap-3 rounded-lg border border-border bg-secondary/40 p-3">
				{coverImageUrl ? (
					<Image
						alt={`${displayCompanyName} 대표 이미지 미리보기`}
						className="size-14 shrink-0 rounded-md border border-border object-cover"
						height={56}
						src={coverImageUrl}
						unoptimized
						width={56}
					/>
				) : (
					<div className="flex size-14 shrink-0 items-center justify-center rounded-md bg-coral-50 font-extrabold text-coral-700 text-sm">
						{getInitials(displayCompanyName)}
					</div>
				)}
				<div className="min-w-0 flex-1">
					<h3 className="m-0 line-clamp-2 font-extrabold text-sm">
						{displayCompanyName} {title || "공고 제목"}
					</h3>
					<div className="mt-1 flex flex-wrap gap-2 text-muted-foreground text-xs">
						<span>{location || "지역"}</span>
						<strong className="text-foreground">{pay || "급여"}</strong>
					</div>
					<p className="mt-2 mb-0 text-muted-foreground text-xs">
						대표 이미지는 스페셜/추천 채용 카드와 전체 공고 row에 함께 사용돼요.
					</p>
				</div>
			</div>
		</Card>
	);
}
