import type { ReactNode } from "react";
import { Alert, Linking, Text } from "react-native";
import { isSafeLinkHref } from "@/src/lib/me-messages";

const INLINE = /\[([^\]]+)\]\(([^)]+)\)|\*\*([^*]+)\*\*|`([^`]+)`/g;
export function SupportManualInline({
	text,
	onAnchor,
}: {
	text: string;
	onAnchor: (slug: string) => void;
}) {
	const parts: ReactNode[] = [];
	let cursor = 0;
	for (const match of text.matchAll(INLINE)) {
		const start = match.index;
		parts.push(text.slice(cursor, start));
		const [, label, href, bold, code] = match;
		if (label && href) {
			const internal = href.startsWith("#");
			const safe = internal || isSafeLinkHref(href);
			parts.push(
				<Text
					className={safe ? "text-accent underline" : undefined}
					key={start}
					onPress={
						safe
							? () => {
									if (internal) {
										onAnchor(href.slice(1));
										return;
									}
									Linking.openURL(href).catch(() =>
										Alert.alert("링크를 열 수 없어요", "주소를 확인해 주세요.")
									);
								}
							: undefined
					}
				>
					{label}
				</Text>
			);
		} else if (bold) {
			parts.push(
				<Text className="font-bold" key={start}>
					{bold}
				</Text>
			);
		} else {
			parts.push(
				<Text className="font-mono" key={start}>
					{code}
				</Text>
			);
		}
		cursor = start + match[0].length;
	}
	parts.push(text.slice(cursor));
	return <Text>{parts}</Text>;
}
