import { ORPCError } from "@orpc/server";

export const BULK_MODERATION_TARGET_LIMIT = 50;

export interface BulkModerationFailure {
	code: string;
	message: string;
	targetId: string;
}

export interface BulkModerationResult {
	failed: number;
	failures: BulkModerationFailure[];
	succeeded: number;
	total: number;
}

interface ExecuteBulkModerationInput {
	processTarget: (targetId: string) => Promise<void>;
	targetIds: readonly string[];
}

const formatFailure = (
	targetId: string,
	error: unknown
): BulkModerationFailure => {
	if (error instanceof ORPCError) {
		return {
			code: error.code,
			message: error.message,
			targetId,
		};
	}

	if (error instanceof Error) {
		return {
			code: "INTERNAL_SERVER_ERROR",
			message: error.message,
			targetId,
		};
	}

	return {
		code: "INTERNAL_SERVER_ERROR",
		message: "Unknown bulk moderation failure.",
		targetId,
	};
};

export const executeBulkModeration = async ({
	processTarget,
	targetIds,
}: ExecuteBulkModerationInput): Promise<BulkModerationResult> => {
	if (targetIds.length === 0) {
		throw new ORPCError("BAD_REQUEST", {
			message: "Bulk moderation requires at least one target.",
		});
	}

	if (targetIds.length > BULK_MODERATION_TARGET_LIMIT) {
		throw new ORPCError("BAD_REQUEST", {
			message: `Bulk moderation supports up to ${BULK_MODERATION_TARGET_LIMIT} targets.`,
		});
	}

	const failures: BulkModerationFailure[] = [];
	let succeeded = 0;

	for (const targetId of targetIds) {
		try {
			await processTarget(targetId);
			succeeded += 1;
		} catch (error) {
			failures.push(formatFailure(targetId, error));
		}
	}

	return {
		failed: failures.length,
		failures,
		succeeded,
		total: targetIds.length,
	};
};
