"use client";

import { cn } from "@bambi-app/ui/lib/utils";
import { motion } from "motion/react";

// React Bits BlurText를 배너용으로 줄인 것. 원본의 IntersectionObserver를 걷어내고
// 마운트 시 1회만 재생한다 — 슬롯이 8칸 동시에 떠도 각자 한 번씩만 돌고 멈춘다.
export function BlurText({
	className,
	text,
}: {
	className?: string;
	text: string;
}) {
	const words = text.split(" ");

	return (
		<span className={cn("flex flex-wrap justify-center gap-x-1", className)}>
			{words.map((word, index) => (
				<motion.span
					animate={{ filter: "blur(0px)", opacity: 1, y: 0 }}
					initial={{ filter: "blur(10px)", opacity: 0, y: -12 }}
					// biome-ignore lint/suspicious/noArrayIndexKey: 같은 단어가 반복될 수 있어 값으로 키를 못 만든다
					key={`${word}-${index}`}
					transition={{ delay: index * 0.12, duration: 0.5 }}
				>
					{word}
				</motion.span>
			))}
		</span>
	);
}
