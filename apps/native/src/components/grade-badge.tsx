import { Image, Text, View } from "react-native";

import { isAbsoluteIconUrl } from "@/src/lib/me-attendance";

// 운영자가 등급마다 자유 hex를 넣는 컬럼이라(bambi_member_grade.color, nullable) 값이
// 뭐든 올 수 있다 — 형식이 맞는 값만 인라인 style로 흘린다.
const HEX_COLOR_PATTERN = /^#[0-9a-f]{3,8}$/i;

const isHexColor = (value: null | string | undefined): value is string =>
	typeof value === "string" && HEX_COLOR_PATTERN.test(value);

interface Props {
	grade: null | {
		color?: null | string;
		iconUrl?: null | string;
		name: string;
	};
}

/**
 * 등급 배지 — 웹 GradeBadge(apps/web/src/components/bambi/grade-badge.tsx)의 native 이식.
 *
 * Pill(bambi-screen.tsx)을 재사용하지 않는다: Pill은 <Text> 한 노드라 안에 <Image>·<View>를
 * 넣으면 Android에서 인라인 배치가 무너진다. Chip도 Pressable이라 터치를 삼켜 금지다.
 * grade가 null이면 아무것도 그리지 않는 계약(웹과 동일) — "등급 없음" 폴백은 호출부가 정한다.
 */
export function GradeBadge({ grade }: Props) {
	if (!grade) {
		return null;
	}

	const iconUri = isAbsoluteIconUrl(grade.iconUrl) ? grade.iconUrl : null;
	// hex를 글자·배경색에 바로 쓰면 다크 테마 대비가 통제 불능이라(웹도 color를 렌더하지 않고
	// 보존만 한다) 점 하나에만 칠하고 나머지는 토큰 그대로 둔다. 아이콘이 있으면 중복 장식이라 생략.
	const dotColor =
		iconUri === null && isHexColor(grade.color) ? grade.color : null;

	return (
		<View
			accessibilityLabel={`${grade.name} 등급`}
			accessible
			className="flex-row items-center gap-1.5 self-start rounded-full bg-accent/15 px-2.5 py-1"
		>
			{/* 부모가 접근성 단일 노드라 아이콘·점은 따로 읽히지 않는다(라벨 중복 방지). */}
			{iconUri ? (
				<Image
					className="size-5"
					resizeMode="contain"
					source={{ uri: iconUri }}
				/>
			) : null}
			{dotColor ? (
				<View
					className="size-2 rounded-full"
					style={{ backgroundColor: dotColor }}
				/>
			) : null}
			<Text className="font-semibold text-accent-soft-foreground text-xs dark:text-accent">
				{grade.name}
			</Text>
		</View>
	);
}
