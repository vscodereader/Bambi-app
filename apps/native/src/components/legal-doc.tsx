// 밤비 — 약관·개인정보 처리방침 등 법적 문서 공용 레이아웃 프리미티브(web
// components/bambi/legal-doc.tsx의 native 이식). 컴포넌트 이름·props를 web과 똑같이 맞춰
// 페이지 JSX를 문구 수정 없이 그대로 옮길 수 있게 한다.
//
// web과 다른 점은 색 상속뿐이다 — RN은 View를 건너 Text 색이 내려가지 않으므로, web에서
// 섹션 컨테이너가 주던 text-muted-foreground를 각 Text가 직접 들고 있다.

import { cn } from "heroui-native";
import type { ReactNode } from "react";
import { ScrollView, Text, View } from "react-native";

// 화면 컨테이너(BambiScreen)는 페이지가 감싼다.
export function LegalDoc({
	title,
	effectiveDate,
	intro,
	children,
}: {
	title: string;
	effectiveDate: string;
	intro?: ReactNode;
	children: ReactNode;
}) {
	return (
		<View className="gap-8">
			<View className="gap-2">
				<Text className="font-bold text-3xl text-foreground" selectable>
					{title}
				</Text>
				<Text className="text-muted text-sm" selectable>
					시행일 {effectiveDate}
				</Text>
			</View>
			{intro ? <View className="gap-3">{intro}</View> : null}
			<View className="gap-10">{children}</View>
		</View>
	);
}

export function LegalSection({
	heading,
	children,
}: {
	heading: string;
	children: ReactNode;
}) {
	return (
		<View className="gap-3">
			<Text className="font-bold text-foreground text-lg" selectable>
				{heading}
			</Text>
			<View className="gap-3">{children}</View>
		</View>
	);
}

// 조문 소제목(제N조 등)용 중간 제목.
export function LegalSubheading({ children }: { children: ReactNode }) {
	return (
		<Text className="pt-2 font-bold text-base text-foreground" selectable>
			{children}
		</Text>
	);
}

export function LegalParagraph({
	children,
	className,
}: {
	children: ReactNode;
	className?: string;
}) {
	return (
		<Text className={cn("text-muted text-sm leading-6", className)} selectable>
			{children}
		</Text>
	);
}

// 들여쓴 항목 목록(가·나·다, ①②③, a·b·c 등 마커는 텍스트에 직접 포함)이라 별도 불릿을
// 그리지 않고 세로로 나열만 한다.
export function LegalList({ items }: { items: ReactNode[] }) {
	return (
		<View className="gap-1.5">
			{items.map((item, index) => (
				<Text
					className="text-muted text-sm leading-6"
					// biome-ignore lint/suspicious/noArrayIndexKey: 정적 법령 문구 목록이라 순서 불변
					key={index}
					selectable
				>
					{item}
				</Text>
			))}
		</View>
	);
}

// 개인정보 위탁·보존기간·국외이전 등 표. 열 수는 head 길이를 따른다. 셀 너비를 고정하고
// 가로 스크롤에 태운다 — 최대 5열짜리 국외이전 표를 폰 폭에 균등 분배하면 열당 70px이라
// 글자가 한 자씩 쪼개진다. 첫 열은 항목명이라 조금 좁게 잡고 강조색을 준다.
export function LegalTable({
	head,
	rows,
}: {
	head: string[];
	rows: string[][];
}) {
	return (
		<View className="overflow-hidden rounded-lg border border-border">
			<ScrollView horizontal>
				<View>
					<View className="flex-row bg-muted/20">
						{head.map((label, index) => (
							<Text
								className={cn(
									"px-4 py-3 font-bold text-foreground text-sm",
									index === 0 ? "w-32" : "w-44"
								)}
								key={label}
								selectable
							>
								{label}
							</Text>
						))}
					</View>
					{rows.map((row) => (
						<View
							className="flex-row border-border border-t"
							key={row.join("|")}
						>
							{row.map((cell, index) => (
								<Text
									className={cn(
										"px-4 py-3 text-sm",
										index === 0 ? "w-32 text-foreground" : "w-44 text-muted"
									)}
									key={cell}
									selectable
								>
									{cell}
								</Text>
							))}
						</View>
					))}
				</View>
			</ScrollView>
		</View>
	);
}
