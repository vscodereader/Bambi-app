import { Button, Input, TextField } from "heroui-native";
import { useState } from "react";
import { Pressable, Text, View } from "react-native";

const KST_OFFSET_MS = 9 * 60 * 60 * 1000;
export function PopupDateTimePicker({
	value,
	onChange,
	kind,
	allowUnset = true,
}: {
	value: string;
	onChange: (value: string) => void;
	kind: "start" | "end";
	allowUnset?: boolean;
}) {
	const [open, setOpen] = useState(false);
	const initial = new Date(
		(value ? new Date(value).getTime() : Date.now()) + KST_OFFSET_MS
	);
	const [month, setMonth] = useState(
		() => new Date(Date.UTC(initial.getUTCFullYear(), initial.getUTCMonth(), 1))
	);
	const [day, setDay] = useState(initial.getUTCDate());
	const [hour, setHour] = useState(String(initial.getUTCHours()));
	const [minute, setMinute] = useState(String(initial.getUTCMinutes()));
	const year = month.getUTCFullYear();
	const monthIndex = month.getUTCMonth();
	const count = new Date(Date.UTC(year, monthIndex + 1, 0)).getUTCDate();
	const blanks = Array.from(
		{ length: new Date(Date.UTC(year, monthIndex, 1)).getUTCDay() },
		(_, index) => `blank-${index}`
	);
	const commit = () => {
		let date = new Date(
			Date.UTC(year, monthIndex, day, Number(hour) - 9, Number(minute))
		);
		if (kind === "start" && date.getTime() < Date.now()) {
			date = new Date(Math.ceil(Date.now() / 60_000) * 60_000);
		}
		onChange(date.toISOString());
		setOpen(false);
	};
	return (
		<View className="gap-2">
			<Text className="text-foreground text-sm">
				{kind === "start" ? "시작 일시" : "종료 일시"} (한국 시간)
			</Text>
			<Button onPress={() => setOpen(!open)} size="sm" variant="secondary">
				<Button.Label>
					{value
						? new Date(value).toLocaleString("ko-KR", {
								timeZone: "Asia/Seoul",
							})
						: "설정 안 함"}
				</Button.Label>
			</Button>
			{open ? (
				<View className="gap-3 rounded-lg border border-border p-3">
					<View className="flex-row items-center justify-between">
						<Button
							onPress={() => {
								setMonth(new Date(Date.UTC(year, monthIndex - 1, 1)));
								setDay(1);
							}}
							size="sm"
							variant="ghost"
						>
							<Button.Label>이전 달</Button.Label>
						</Button>
						<Text className="text-foreground">
							{year}년 {monthIndex + 1}월
						</Text>
						<Button
							onPress={() => {
								setMonth(new Date(Date.UTC(year, monthIndex + 1, 1)));
								setDay(1);
							}}
							size="sm"
							variant="ghost"
						>
							<Button.Label>다음 달</Button.Label>
						</Button>
					</View>
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
						{Array.from({ length: count }, (_, index) => index + 1).map(
							(candidate) => (
								<Pressable
									accessibilityLabel={`${candidate}일`}
									accessibilityRole="button"
									className={`w-[14.285%] rounded-lg py-3 ${day === candidate ? "bg-accent" : "bg-background"}`}
									key={candidate}
									onPress={() => setDay(candidate)}
								>
									<Text
										className={`text-center ${day === candidate ? "text-accent-foreground" : "text-foreground"}`}
									>
										{candidate}
									</Text>
								</Pressable>
							)
						)}
					</View>
					<View className="flex-row gap-2">
						<TextField className="flex-1">
							<Input
								accessibilityLabel="시"
								keyboardType="number-pad"
								maxLength={2}
								onChangeText={setHour}
								placeholder="시"
								value={hour}
							/>
						</TextField>
						<TextField className="flex-1">
							<Input
								accessibilityLabel="분"
								keyboardType="number-pad"
								maxLength={2}
								onChangeText={setMinute}
								placeholder="분"
								value={minute}
							/>
						</TextField>
					</View>
					<Button
						isDisabled={
							!(
								hour &&
								minute &&
								Number.isInteger(Number(hour)) &&
								Number.isInteger(Number(minute))
							) ||
							Number(hour) < 0 ||
							Number(hour) > 23 ||
							Number(minute) < 0 ||
							Number(minute) > 59
						}
						onPress={commit}
					>
						<Button.Label>일시 적용</Button.Label>
					</Button>
					{allowUnset ? (
						<Button
							onPress={() => {
								onChange("");
								setOpen(false);
							}}
							size="sm"
							variant="ghost"
						>
							<Button.Label>설정 안 함</Button.Label>
						</Button>
					) : null}
				</View>
			) : null}
		</View>
	);
}
