import { cn } from "heroui-native";
import { useState } from "react";
import { Alert, Image, Linking, Text, View } from "react-native";

import {
	directMessageBodyToText,
	type MessageInline,
	parseDirectMessageBody,
} from "@/src/lib/me-messages";

// 핸들러가 없는 스킴·잘못된 주소면 openURL이 reject한다 — 잡지 않으면 unhandled rejection이
// 되고 사용자는 아무 반응도 못 본다. 스킴 화이트리스트는 파서(isSafeLinkHref)가 이미 걸렀다.
const openLink = (href: string) => {
	Linking.openURL(href).catch(() => {
		Alert.alert("링크를 열 수 없어요", "주소를 확인한 뒤 다시 시도해 주세요.");
	});
};

// 문단 안에는 View를 넣을 수 없다(RN Text 자식 제약) — 마크는 전부 중첩 Text로 그린다.
// 링크 조각만 따로 onPress를 받는다(문단 전체를 누르게 하면 롱프레스 선택과 경합한다).
function BodyInline({ inline }: { inline: MessageInline }) {
	const { href } = inline;

	return (
		<Text
			className={cn(
				inline.bold && "font-semibold",
				inline.italic && "italic",
				inline.strike && "line-through",
				href && "text-accent-soft-foreground underline dark:text-accent"
			)}
			onPress={href ? () => openLink(href) : undefined}
			style={
				inline.fontSize
					? { fontSize: inline.fontSize, lineHeight: inline.fontSize * 1.5 }
					: undefined
			}
		>
			{inline.text}
		</Text>
	);
}

function BodyImage({ alt, src }: { alt: string; src: string }) {
	// doc attrs에 width/height가 없어(수집 상세와 달리 서버 메타가 없다) 비율을 모르면 RN
	// Image 높이가 0이 된다. 4:3으로 그려 두고 onLoad 실측으로 고친다.
	const [aspectRatio, setAspectRatio] = useState(4 / 3);

	return (
		<Image
			accessibilityLabel={alt || "쪽지 이미지"}
			className="w-full rounded-lg"
			onLoad={(event) => {
				const { height, width } = event.nativeEvent.source;

				if (width > 0 && height > 0) {
					setAspectRatio(width / height);
				}
			}}
			resizeMode="contain"
			source={{ uri: src }}
			style={{ aspectRatio }}
		/>
	);
}

/**
 * 쪽지 본문(Tiptap doc JSON) 렌더러. 웹 PostBodyViewer는 에디터를 뷰어로 재사용하지만
 * native에는 에디터가 없어 문단·리스트·링크·이미지 서브셋만 RN 프리미티브로 그린다.
 * doc이 아니면(옛 평문 본문·형식 오류) 평문 한 장으로 폴백한다.
 */
export function MessageBody({ body }: { body: string }) {
	const blocks = parseDirectMessageBody(body);

	if (!blocks || blocks.length === 0) {
		return (
			<Text className="text-foreground text-sm leading-6" selectable>
				{directMessageBodyToText(body)}
			</Text>
		);
	}

	return (
		<View className="gap-2">
			{blocks.map((block, index) => {
				if (block.type === "image") {
					return (
						// biome-ignore lint/suspicious/noArrayIndexKey: 블록 목록은 불변 문자열(body)에서 파생돼 순서가 바뀌거나 중간 삽입이 없다
						<BodyImage alt={block.alt} key={index} src={block.src} />
					);
				}

				const inlines = block.inlines.map((inline, inlineIndex) => (
					// biome-ignore lint/suspicious/noArrayIndexKey: 위와 같다 — 한 문단의 인라인 런은 body가 바뀔 때만 다시 만들어진다
					<BodyInline inline={inline} key={inlineIndex} />
				));

				if (block.type === "listItem") {
					return (
						// biome-ignore lint/suspicious/noArrayIndexKey: 위와 같다
						<View className="flex-row gap-2" key={index}>
							<Text className="w-5 text-muted text-sm leading-6">
								{block.marker}
							</Text>
							<Text
								className="flex-1 text-foreground text-sm leading-6"
								selectable
							>
								{inlines}
							</Text>
						</View>
					);
				}

				return (
					<Text
						className={cn(
							"text-foreground leading-6",
							block.quoted && "border-accent border-l-2 pl-3 italic",
							block.type === "heading" ? "font-bold text-lg" : "text-sm",
							block.type === "codeBlock" &&
								"rounded-lg bg-muted/10 p-2 font-mono"
						)}
						// biome-ignore lint/suspicious/noArrayIndexKey: 위와 같다
						key={index}
						selectable
					>
						{inlines}
					</Text>
				);
			})}
		</View>
	);
}
