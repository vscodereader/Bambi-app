import {
	type JobDescriptionBlock,
	type JobDescriptionBlockType,
	jobDescriptionBlockTypes,
} from "@bambi-app/api/services/bambi-job-description-blocks";
import { Input, TextField } from "heroui-native";
import { Pressable, Text, View } from "react-native";

import {
	addJobBlock,
	canAddJobBlock,
	jobDescriptionBlockTypeLabels,
	moveJobBlock,
	removeJobBlock,
	updateJobBlockText,
	updateJobBlockType,
} from "@/src/lib/employer/job-description-blocks";

interface Props {
	blocks: JobDescriptionBlock[];
	error?: null | string;
	onChange: (next: JobDescriptionBlock[]) => void;
}

function TypeChoice({
	onSelect,
	value,
}: {
	onSelect: (type: JobDescriptionBlockType) => void;
	value: JobDescriptionBlockType;
}) {
	return (
		<View className="flex-row flex-wrap gap-2">
			{jobDescriptionBlockTypes.map((type) => {
				const isSelected = type === value;

				return (
					<Pressable
						className={`rounded-full border px-3 py-2 active:opacity-75 ${
							isSelected
								? "border-accent bg-accent"
								: "border-border bg-background"
						}`}
						key={type}
						onPress={() => onSelect(type)}
					>
						<Text
							className={
								isSelected
									? "font-semibold text-accent-foreground text-sm"
									: "font-semibold text-foreground text-sm"
							}
						>
							{jobDescriptionBlockTypeLabels[type]}
						</Text>
					</Pressable>
				);
			})}
		</View>
	);
}

export function JobDescriptionBlockEditor({ blocks, error, onChange }: Props) {
	return (
		<View className="gap-3">
			<View className="gap-1">
				<Text className="font-semibold text-foreground text-sm" selectable>
					상세설명 블록 (선택)
				</Text>
				<Text className="text-muted text-xs" selectable>
					문단·소제목·목록·강조로 상세설명을 구성할 수 있어요. 최대 12개.
				</Text>
			</View>

			{blocks.map((block, index) => (
				<View
					className="gap-2 rounded-lg border border-border p-3"
					key={block.id}
				>
					<TypeChoice
						onSelect={(type) =>
							onChange(updateJobBlockType(blocks, block.id, type))
						}
						value={block.type}
					/>
					<TextField>
						<Input
							multiline
							onChangeText={(text) =>
								onChange(updateJobBlockText(blocks, block.id, text))
							}
							placeholder="블록 내용"
							value={block.text}
						/>
					</TextField>
					<View className="flex-row gap-2">
						<Pressable
							accessibilityLabel="블록 위로 이동"
							className="rounded-lg border border-border bg-background px-3 py-2 active:opacity-75"
							disabled={index === 0}
							onPress={() => onChange(moveJobBlock(blocks, block.id, "up"))}
						>
							<Text className="text-foreground text-sm">위로</Text>
						</Pressable>
						<Pressable
							accessibilityLabel="블록 아래로 이동"
							className="rounded-lg border border-border bg-background px-3 py-2 active:opacity-75"
							disabled={index === blocks.length - 1}
							onPress={() => onChange(moveJobBlock(blocks, block.id, "down"))}
						>
							<Text className="text-foreground text-sm">아래로</Text>
						</Pressable>
						<Pressable
							accessibilityLabel="블록 삭제"
							className="ml-auto rounded-lg border border-border bg-background px-3 py-2 active:opacity-75"
							onPress={() => onChange(removeJobBlock(blocks, block.id))}
						>
							<Text className="text-danger-soft-foreground text-sm dark:text-danger">
								삭제
							</Text>
						</Pressable>
					</View>
				</View>
			))}

			{error ? (
				<Text className="text-danger text-xs" selectable>
					{error}
				</Text>
			) : null}

			<Pressable
				className={`items-center rounded-lg border border-border bg-background py-3 active:opacity-75 ${
					canAddJobBlock(blocks) ? "" : "opacity-40"
				}`}
				disabled={!canAddJobBlock(blocks)}
				onPress={() => onChange(addJobBlock(blocks))}
			>
				<Text className="font-semibold text-foreground text-sm">블록 추가</Text>
			</Pressable>
		</View>
	);
}
