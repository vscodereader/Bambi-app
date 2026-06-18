const KST_OFFSET_MS = 9 * 60 * 60 * 1000;
const DATETIME_LOCAL_PATTERN =
	/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?$/;

const readUtcPartsAsKst = (date: Date) => {
	const kstDate = new Date(date.getTime() + KST_OFFSET_MS);

	return {
		day: kstDate.getUTCDate(),
		hour: kstDate.getUTCHours(),
		minute: kstDate.getUTCMinutes(),
		month: kstDate.getUTCMonth() + 1,
		second: kstDate.getUTCSeconds(),
		year: kstDate.getUTCFullYear(),
	};
};

export const parseKstDatetimeLocal = (value: string): Date | null => {
	const match = DATETIME_LOCAL_PATTERN.exec(value);

	if (!match) {
		return null;
	}

	const [, yearText, monthText, dayText, hourText, minuteText, secondText] =
		match;
	const year = Number(yearText);
	const month = Number(monthText);
	const day = Number(dayText);
	const hour = Number(hourText);
	const minute = Number(minuteText);
	const second = Number(secondText ?? "0");

	if (
		month < 1 ||
		month > 12 ||
		day < 1 ||
		day > 31 ||
		hour > 23 ||
		minute > 59 ||
		second > 59
	) {
		return null;
	}

	const utcTime = Date.UTC(year, month - 1, day, hour, minute, second);
	const date = new Date(utcTime - KST_OFFSET_MS);
	const parts = readUtcPartsAsKst(date);

	if (
		parts.year !== year ||
		parts.month !== month ||
		parts.day !== day ||
		parts.hour !== hour ||
		parts.minute !== minute ||
		parts.second !== second
	) {
		return null;
	}

	return date;
};
