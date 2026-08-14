import { Badge } from "@bambi-app/ui/components/badge";

interface Props {
	grade: { name: string; color: string | null } | null;
}

// 작성자명·회원 옆 등급 뱃지. 등급 없음(게스트·미산정)이면 렌더하지 않는다.
// v1은 shadcn secondary 톤으로 통일한다(인라인 style·raw hex 금지 규칙 준수).
// color 컬럼은 보존하되 색 구동 스타일은 frontend-design 후속에서 토큰으로 매핑한다.
export function GradeBadge({ grade }: Props) {
	if (!grade) {
		return null;
	}
	return <Badge variant="secondary">{grade.name}</Badge>;
}
