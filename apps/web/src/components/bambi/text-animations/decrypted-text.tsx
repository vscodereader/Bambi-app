"use client";

import { cn } from "@bambi-app/ui/lib/utils";
import { useEffect, useState } from "react";

const SCRAMBLE_POOL = "가나다라마바사아자차카타파하0123456789";
const SCRAMBLE_INTERVAL_MS = 60;
// 글자 하나가 제자리를 찾기까지 거치는 스크램블 횟수.
const SCRAMBLE_STEPS_PER_CHAR = 3;

// React Bits DecryptedText를 배너용으로 줄인 것. 앞에서부터 한 글자씩 확정되고 나머지는
// 무작위 글자로 남는다. 확정된 뒤에는 타이머를 멈춰 8칸이 동시에 돌아도 부담이 없다.
export function DecryptedText({
	className,
	text,
}: {
	className?: string;
	text: string;
}) {
	const [tick, setTick] = useState(0);
	const totalTicks = text.length * SCRAMBLE_STEPS_PER_CHAR;

	useEffect(() => {
		setTick(0);
		const timer = setInterval(() => {
			setTick((current) => {
				if (current >= totalTicks) {
					clearInterval(timer);
					return current;
				}
				return current + 1;
			});
		}, SCRAMBLE_INTERVAL_MS);

		return () => clearInterval(timer);
	}, [totalTicks]);

	const settledCount = Math.floor(tick / SCRAMBLE_STEPS_PER_CHAR);
	const rendered = [...text]
		.map((char, index) => {
			if (index < settledCount || char === " ") {
				return char;
			}
			const poolIndex = (tick + index) % SCRAMBLE_POOL.length;
			return SCRAMBLE_POOL[poolIndex];
		})
		.join("");

	// 스크램블 중인 글자는 실제 문구가 아니라 무작위 글자다. 보조기술·복사에는 원문을 준다.
	return (
		<span className={cn("inline-block", className)}>
			<span className="sr-only">{text}</span>
			<span aria-hidden="true">{rendered}</span>
		</span>
	);
}
