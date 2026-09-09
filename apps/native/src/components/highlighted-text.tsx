import { Text } from "react-native";

export function HighlightedText({
	text,
	terms = [],
}: {
	text: string;
	terms?: readonly string[];
}) {
	const ranges: { start: number; end: number }[] = [];
	for (const term of terms) {
		if (!term) {
			continue;
		}
		let start = text.indexOf(term);
		while (start >= 0) {
			ranges.push({ start, end: start + term.length });
			start = text.indexOf(term, start + term.length);
		}
	}
	const merged: { start: number; end: number }[] = [];
	for (const range of ranges.sort((a, b) => a.start - b.start)) {
		const previous = merged.at(-1);
		if (previous && range.start <= previous.end) {
			previous.end = Math.max(previous.end, range.end);
		} else {
			merged.push({ ...range });
		}
	}
	let offset = 0;
	const parts = merged.map((range) => {
		const plain = text.slice(offset, range.start);
		offset = range.end;
		return (
			<Text key={range.start}>
				{plain}
				<Text className="bg-warning/20 font-bold text-warning">
					{text.slice(range.start, range.end)}
				</Text>
			</Text>
		);
	});
	return (
		<Text>
			{parts}
			{text.slice(offset)}
		</Text>
	);
}
