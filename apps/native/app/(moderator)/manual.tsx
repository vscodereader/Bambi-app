import {
	githubSlug,
	parseManual,
} from "@bambi-app/api/services/bambi-manual-parse";
import { Asset } from "expo-asset";
import { File } from "expo-file-system";
import { useEffect, useRef, useState } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import type { KeyboardAwareScrollViewRef } from "react-native-keyboard-controller";

import {
	BambiHeader,
	BambiScreen,
	StateCard,
} from "@/src/components/bambi-screen";
import { ManualInline } from "@/src/components/moderation/manual-inline";

const MANUAL_ASSET = require("../../../../docs/manual/moderator-manual.md");
const HEADING_PREFIX = /^#{1,3}\s+/;
const TABLE_DIVIDER = /^\s*\|?[\s:|-]+\|\s*$/;
const lineClassName = (line: string) => {
	if (line.startsWith("### ")) {
		return "mt-3 font-semibold text-foreground";
	}
	if (line.startsWith("## ")) {
		return "mt-4 font-bold text-foreground text-lg";
	}
	if (line.startsWith("# ")) {
		return "font-extrabold text-foreground text-xl";
	}
	return "text-foreground text-sm leading-6";
};

export default function ModeratorManualScreen() {
	const scroll = useRef<KeyboardAwareScrollViewRef>(null);
	const anchors = useRef(new Map<string, number>());
	const jumpTo = (slug: string) =>
		scroll.current?.scrollTo({
			y: anchors.current.get(slug) ?? 0,
			animated: true,
		});
	const [content, setContent] = useState<string | null>(null);
	const [error, setError] = useState(false);
	useEffect(() => {
		let active = true;
		Asset.fromModule(MANUAL_ASSET)
			.downloadAsync()
			.then((asset) => {
				if (!asset.localUri) {
					throw new Error("매뉴얼 자산 경로가 없습니다.");
				}
				return new File(asset.localUri).text();
			})
			.then((text) => {
				if (active) {
					setContent(text);
				}
			})
			.catch(() => {
				if (active) {
					setError(true);
				}
			});
		return () => {
			active = false;
		};
	}, []);
	let body = (
		<Text className="text-muted text-sm">매뉴얼을 불러오고 있어요.</Text>
	);
	if (error) {
		body = (
			<StateCard
				description="앱을 다시 시작한 뒤 시도해 주세요."
				title="매뉴얼을 열지 못했어요"
			/>
		);
	}
	if (content) {
		const manual = parseManual(content);
		body = (
			<View className="gap-2">
				<Text className="font-bold text-foreground">목차</Text>
				{manual.headings.map((heading) => (
					<Pressable
						key={heading.slug}
						onPress={() =>
							scroll.current?.scrollTo({
								y: anchors.current.get(heading.slug) ?? 0,
								animated: true,
							})
						}
					>
						<Text className="py-1 text-accent">{heading.text}</Text>
					</Pressable>
				))}
				{manual.markdown.split("\n").map((line, index) => {
					if (TABLE_DIVIDER.test(line)) {
						return null;
					}
					if (line.trim().startsWith("|")) {
						return (
							<ScrollView
								horizontal
								// biome-ignore lint/suspicious/noArrayIndexKey: immutable source document line
								key={`table-${index}`}
							>
								<View className="flex-row border border-border">
									{line
										.trim()
										.replace(/^\||\|$/g, "")
										.split("|")
										.map((cell, cellIndex) => (
											<Text
												className="w-48 border-border border-r p-2 text-foreground text-sm"
												// biome-ignore lint/suspicious/noArrayIndexKey: immutable table columns
												key={`cell-${cellIndex}`}
											>
												<ManualInline onAnchor={jumpTo} text={cell.trim()} />
											</Text>
										))}
								</View>
							</ScrollView>
						);
					}
					return (
						<Text
							className={lineClassName(line)}
							// biome-ignore lint/suspicious/noArrayIndexKey: immutable manual source lines never reorder in place
							key={`${index}-${line.slice(0, 12)}`}
							onLayout={(event) => {
								if (line.startsWith("##")) {
									anchors.current.set(
										githubSlug(line.replace(HEADING_PREFIX, "")),
										event.nativeEvent.layout.y
									);
								}
							}}
							selectable
						>
							<ManualInline
								onAnchor={jumpTo}
								text={line.replace(HEADING_PREFIX, "")}
							/>
						</Text>
					);
				})}
			</View>
		);
	}
	return (
		<BambiScreen scrollViewRef={scroll}>
			<BambiHeader
				description="저장소의 최신 운영자 매뉴얼 원문을 앱에서 확인합니다."
				title="운영자 매뉴얼"
			/>
			{body}
		</BambiScreen>
	);
}
