import { useThemeColor } from "heroui-native";
import { View } from "react-native";
import Svg, { Circle, Path } from "react-native-svg";

// 웹 ds.tsx의 Logo에서 아이콘 타일만 이식한 것. 워드마크는 호출부가 자체 텍스트로
// 붙이므로 여기서는 그리지 않는다. 웹 md 타일과 두 가지가 다르다 — radius는 임의 px
// 금지 규칙 때문에 rounded-[10.8px] 대신 가장 가까운 스케일 토큰 rounded-xl(12px)로
// 대체했고, shadow-lg는 옮기지 않았다(RN 그림자는 iOS·Android 구현이 갈려 36px 타일에서
// 얻는 것이 적다).
export function BambiLogo() {
	// 글리프는 코랄 타일 위에 얹히므로 전경 토큰을 그대로 쓴다. 흰색 hex를 박아 두면
	// global.css의 --accent-foreground가 바뀔 때 타일만 따라가고 글리프는 남는다.
	const glyph = useThemeColor("accent-foreground");

	return (
		<View
			// 옆에 "밤비알바 로그인" 텍스트가 붙는 장식 요소라 스크린리더가 두 번 읽지
			// 않게 가린다(웹 원본의 aria-hidden과 같은 의도). iOS와 Android가 각각 다른
			// prop을 보므로 둘 다 필요하다.
			accessibilityElementsHidden
			className="h-9 w-9 items-center justify-center rounded-xl bg-accent"
			importantForAccessibility="no-hide-descendants"
		>
			{/* 웹 md 사이즈의 글리프(20.16px)를 반올림한 값. */}
			<Svg height={20} viewBox="0 0 24 24" width={20}>
				<Path
					d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"
					fill={glyph}
				/>
				<Circle cx="16.5" cy="8" fill={glyph} r="1.15" />
			</Svg>
		</View>
	);
}
