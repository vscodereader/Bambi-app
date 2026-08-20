import { Badge } from "@bambi-app/ui/components/badge";
import { cn } from "@bambi-app/ui/lib/utils";
import Image from "next/image";

interface Props {
	grade: { name: string; color: string | null; iconUrl?: string | null } | null;
}

export function GradeIcon({
	className,
	iconUrl,
	name,
}: {
	className?: string;
	iconUrl?: string | null;
	name: string;
}) {
	return iconUrl ? (
		<Image
			alt={`${name} 등급 아이콘`}
			className={cn("size-6 shrink-0 object-contain", className)}
			height={24}
			src={iconUrl}
			unoptimized
			width={24}
		/>
	) : null;
}

// 작성자명·회원 옆 등급 뱃지. 등급 없음(게스트·미산정)이면 렌더하지 않는다.
// v1은 shadcn secondary 톤으로 통일한다(인라인 style·raw hex 금지 규칙 준수).
// color 컬럼은 보존하되 색 구동 스타일은 frontend-design 후속에서 토큰으로 매핑한다.
export function GradeBadge({ grade }: Props) {
	if (!grade) {
		return null;
	}
	return (
		<Badge className="gap-1" variant="secondary">
			<GradeIcon
				className="h-full max-h-full w-auto"
				iconUrl={grade.iconUrl}
				name={grade.name}
			/>
			{grade.name}
		</Badge>
	);
}
