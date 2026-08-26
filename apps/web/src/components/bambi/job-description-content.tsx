import {
	type JobDescriptionBlock,
	resolveJobDescriptionContent,
} from "@bambi-app/api/services/bambi-job-description-blocks";

const BULLET_ITEM_SEPARATOR = /\n+/;

function DescriptionBlock({ block }: { block: JobDescriptionBlock }) {
	if (block.type === "heading") {
		return <h3 className="m-0 font-extrabold text-lg">{block.text}</h3>;
	}

	if (block.type === "bullet_list") {
		const itemOccurrences = new Map<string, number>();
		const items = block.text
			.split(BULLET_ITEM_SEPARATOR)
			.map((item) => item.trim())
			.filter((item) => item.length > 0)
			.map((text) => {
				const occurrence = (itemOccurrences.get(text) ?? 0) + 1;
				itemOccurrences.set(text, occurrence);
				return { key: `${block.id}-${text}-${occurrence}`, text };
			});

		return (
			<ul className="m-0 flex list-disc flex-col gap-1 pl-5 text-[15px] leading-relaxed">
				{items.map((item) => (
					<li key={item.key}>{item.text}</li>
				))}
			</ul>
		);
	}

	if (block.type === "callout") {
		return (
			<p className="m-0 whitespace-pre-line border border-coral-200 bg-coral-50 p-3 text-[15px] text-coral-800 leading-relaxed">
				{block.text}
			</p>
		);
	}

	return (
		<p className="m-0 whitespace-pre-line text-[15px] text-foreground leading-relaxed">
			{block.text}
		</p>
	);
}

export function JobDescriptionContent({
	description,
	descriptionBlocks,
}: {
	description: string;
	descriptionBlocks: JobDescriptionBlock[];
}) {
	const content = resolveJobDescriptionContent({
		description,
		descriptionBlocks,
	});

	return (
		<div className="flex flex-col gap-4">
			{content.showDescription ? (
				<p className="m-0 whitespace-pre-line text-[15px] text-foreground leading-relaxed">
					{content.description}
				</p>
			) : null}
			{content.blocks.map((block) => (
				<DescriptionBlock block={block} key={block.id} />
			))}
		</div>
	);
}
