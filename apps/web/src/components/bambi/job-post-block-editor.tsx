"use client";

import { Button } from "@bambi-app/ui/components/button";
import { Label } from "@bambi-app/ui/components/label";
import { ArrowDown, ArrowUp, Plus, Trash2 } from "lucide-react";

import {
	createEmptyDescriptionBlock,
	DESCRIPTION_BLOCK_MAX_COUNT,
	type JobDescriptionBlockFormValue,
	type JobDescriptionBlockType,
} from "@/lib/bambi-job-form";

interface JobPostBlockEditorProps {
	blocks: JobDescriptionBlockFormValue[];
	error?: string;
	onChange: (blocks: JobDescriptionBlockFormValue[]) => void;
}

const blockTypeLabels = {
	bullet_list: "목록",
	callout: "강조",
	heading: "제목",
	paragraph: "문단",
} as const satisfies Record<JobDescriptionBlockType, string>;

const blockTypeOrder: JobDescriptionBlockType[] = [
	"paragraph",
	"heading",
	"bullet_list",
	"callout",
];

const textareaClassName =
	"min-h-24 w-full min-w-0 rounded-none border border-input bg-background px-3 py-2 text-sm outline-none transition-colors focus-visible:border-ring focus-visible:ring-1 focus-visible:ring-ring/50";

export function JobPostBlockEditor({
	blocks,
	error,
	onChange,
}: JobPostBlockEditorProps) {
	const isFull = blocks.length >= DESCRIPTION_BLOCK_MAX_COUNT;

	const addBlock = (type: JobDescriptionBlockType) => {
		// 제출 검증(getDescriptionBlockError)과 같은 상한. 추가 시점에 막지 않으면
		// 상한을 넘겨 채운 뒤 제출할 때야 거부당한다.
		if (isFull) {
			return;
		}

		onChange([...blocks, createEmptyDescriptionBlock(type)]);
	};

	const updateBlockText = (id: string, text: string) => {
		onChange(
			blocks.map((block) => (block.id === id ? { ...block, text } : block))
		);
	};

	const removeBlock = (id: string) => {
		onChange(blocks.filter((block) => block.id !== id));
	};

	const moveBlock = (index: number, direction: -1 | 1) => {
		const nextIndex = index + direction;

		if (nextIndex < 0 || nextIndex >= blocks.length) {
			return;
		}

		const nextBlocks = [...blocks];
		const current = nextBlocks[index];
		const target = nextBlocks[nextIndex];

		if (!(current && target)) {
			return;
		}

		nextBlocks[index] = target;
		nextBlocks[nextIndex] = current;
		onChange(nextBlocks);
	};

	return (
		<section aria-label="블록형 상세 편집기" className="space-y-3">
			<div className="flex flex-wrap items-center gap-2">
				<span className="font-medium text-sm">블록형 상세 설명</span>
				{blockTypeOrder.map((type) => (
					<Button
						disabled={isFull}
						key={type}
						onClick={() => addBlock(type)}
						size="sm"
						type="button"
						variant="outline"
					>
						<Plus />
						{blockTypeLabels[type]}
					</Button>
				))}
			</div>
			{isFull ? (
				<p className="text-muted-foreground text-xs">
					상세 블록은 최대 {DESCRIPTION_BLOCK_MAX_COUNT}개까지 등록할 수
					있습니다.
				</p>
			) : null}
			{blocks.length === 0 ? (
				<p className="border border-dashed p-3 text-muted-foreground text-sm">
					블록을 추가하면 기본 상세 설명 뒤에 함께 공개됩니다.
				</p>
			) : (
				<div className="space-y-3">
					{blocks.map((block, index) => {
						const fieldId = `description-block-${block.id}`;

						return (
							<div className="space-y-2 border p-3" key={block.id}>
								<div className="flex items-center justify-between gap-2">
									<Label htmlFor={fieldId}>
										{blockTypeLabels[block.type]} {index + 1}
									</Label>
									<div className="flex items-center gap-1">
										<Button
											aria-label="블록 위로 이동"
											disabled={index === 0}
											onClick={() => moveBlock(index, -1)}
											size="icon-xs"
											title="블록 위로 이동"
											type="button"
											variant="ghost"
										>
											<ArrowUp />
										</Button>
										<Button
											aria-label="블록 아래로 이동"
											disabled={index === blocks.length - 1}
											onClick={() => moveBlock(index, 1)}
											size="icon-xs"
											title="블록 아래로 이동"
											type="button"
											variant="ghost"
										>
											<ArrowDown />
										</Button>
										<Button
											aria-label="블록 삭제"
											onClick={() => removeBlock(block.id)}
											size="icon-xs"
											title="블록 삭제"
											type="button"
											variant="destructive"
										>
											<Trash2 />
										</Button>
									</div>
								</div>
								<textarea
									className={textareaClassName}
									id={fieldId}
									maxLength={800}
									onChange={(event) =>
										updateBlockText(block.id, event.target.value)
									}
									value={block.text}
								/>
							</div>
						);
					})}
				</div>
			)}
			{error ? <p className="text-destructive text-xs">{error}</p> : null}
		</section>
	);
}
