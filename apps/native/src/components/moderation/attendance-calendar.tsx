import { getKstDateString } from "@bambi-app/api/services/bambi-attendance";
import { useQuery } from "@tanstack/react-query";
import { Button } from "heroui-native";
import { useState } from "react";
import { Text, View } from "react-native";
import { orpc } from "@/src/lib/orpc";

export function AttendanceCalendar({ userId }: { userId: string }) {
	const [month, setMonth] = useState(() =>
		getKstDateString(new Date()).slice(0, 7)
	);
	const query = useQuery(
		orpc.bambi.attendance.adminGetMonth.queryOptions({
			input: { userId, month },
		})
	);
	const [year, monthNumber] = month.split("-").map(Number);
	const count = new Date(Date.UTC(year ?? 0, monthNumber ?? 1, 0)).getUTCDate();
	const blanks = Array.from(
		{
			length: new Date(
				Date.UTC(year ?? 0, (monthNumber ?? 1) - 1, 1)
			).getUTCDay(),
		},
		(_, index) => `blank-${index}`
	);
	const move = (delta: number) =>
		setMonth(
			new Date(Date.UTC(year ?? 0, (monthNumber ?? 1) - 1 + delta, 1))
				.toISOString()
				.slice(0, 7)
		);
	return (
		<View className="gap-3">
			<Text className="font-bold text-foreground">출석 달력 (한국 날짜)</Text>
			<View className="flex-row items-center justify-between">
				<Button onPress={() => move(-1)} size="sm" variant="secondary">
					<Button.Label>이전 달</Button.Label>
				</Button>
				<Text className="text-foreground">{month}</Text>
				<Button onPress={() => move(1)} size="sm" variant="secondary">
					<Button.Label>다음 달</Button.Label>
				</Button>
			</View>
			{query.isError ? (
				<Button onPress={() => query.refetch()} variant="secondary">
					<Button.Label>달력 다시 불러오기</Button.Label>
				</Button>
			) : (
				<View className="flex-row flex-wrap">
					{"일월화수목금토".split("").map((label) => (
						<Text
							className="w-[14.285%] py-2 text-center text-muted text-xs"
							key={label}
						>
							{label}
						</Text>
					))}
					{blanks.map((key) => (
						<View className="w-[14.285%]" key={key} />
					))}
					{Array.from({ length: count }, (_, index) => index + 1).map((day) => {
						const attended = query.data?.attendedDates.includes(
							`${month}-${String(day).padStart(2, "0")}`
						);
						return (
							<View
								className={`w-[14.285%] rounded-lg py-3 ${attended ? "bg-accent/15" : "bg-background"}`}
								key={day}
							>
								<Text
									accessibilityLabel={`${day}일 ${attended ? "출석" : "출석 기록 없음"}`}
									className={`text-center ${attended ? "font-bold text-accent" : "text-muted"}`}
								>
									{day}
									{attended ? " ✓" : ""}
								</Text>
							</View>
						);
					})}
				</View>
			)}
		</View>
	);
}
