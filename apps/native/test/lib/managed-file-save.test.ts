import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
	createFile: vi.fn(),
	deleteExisting: vi.fn(),
	deleteStored: vi.fn(),
	directoryExists: true,
	fileExists: true,
	fileSize: 3,
	FileClass: null as unknown as new (
		uri: string,
		name?: string
	) => {
		delete: () => void;
		exists: boolean;
		name: string;
		size: number;
		uri: string;
		write: (bytes: Uint8Array) => void;
	},
	getStored: vi.fn(),
	list: vi.fn(),
	os: "android",
	pickDirectory: vi.fn(),
	setStored: vi.fn(),
	write: vi.fn(),
}));

vi.mock("expo-file-system", () => {
	class MockFile {
		exists = state.fileExists;
		name: string;
		size = state.fileSize;
		uri: string;
		constructor(uri: string, name = "보고서.csv") {
			this.name = name;
			this.uri = uri;
		}
		delete = state.deleteExisting;
		write = state.write;
	}
	class MockDirectory {
		exists = state.directoryExists;
		uri: string;
		constructor(uri: string) {
			this.uri = uri;
		}
		static pickDirectoryAsync = state.pickDirectory;
		createFile = state.createFile;
		list = state.list;
	}
	state.FileClass = MockFile;
	return { Directory: MockDirectory, File: MockFile };
});
vi.mock("expo-secure-store", () => ({
	deleteItemAsync: state.deleteStored,
	getItemAsync: state.getStored,
	setItemAsync: state.setStored,
}));
vi.mock("react-native", () => ({
	Platform: {
		get OS() {
			return state.os;
		},
	},
}));

import {
	forgetManagedSaveDirectory,
	saveManagedFile,
} from "../../src/lib/managed-file";

const input = {
	fileName: "보고서.csv",
	mimeType: "text/csv",
	bytes: new Uint8Array([1, 2, 3]),
};

describe("Android managed file save", () => {
	beforeEach(async () => {
		vi.clearAllMocks();
		Object.assign(state, {
			os: "android",
			directoryExists: true,
			fileExists: true,
			fileSize: 3,
		});
		state.getStored.mockResolvedValue(null);
		state.deleteStored.mockResolvedValue(undefined);
		state.setStored.mockResolvedValue(undefined);
		state.list.mockReturnValue([]);
		state.pickDirectory.mockResolvedValue({
			exists: true,
			uri: "content://provider/tree/download",
			createFile: state.createFile,
			list: state.list,
		});
		state.createFile.mockReturnValue(
			new state.FileClass("content://provider/document/report")
		);
		await forgetManagedSaveDirectory();
	});

	it("asks for a folder once, creates the file and verifies written bytes", async () => {
		expect(await saveManagedFile(input)).toEqual({
			status: "saved",
			uri: "content://provider/document/report",
		});
		expect(state.pickDirectory).toHaveBeenCalledOnce();
		expect(state.setStored).toHaveBeenCalledWith(
			"bambi.managed-save-directory.v1",
			"content://provider/tree/download"
		);
		expect(state.createFile).toHaveBeenCalledWith("보고서.csv", "text/csv");
		expect(state.write).toHaveBeenCalledWith(input.bytes);
	});

	it("restores the selected folder without opening the picker", async () => {
		state.getStored.mockResolvedValue("content://provider/tree/download");
		expect((await saveManagedFile(input)).status).toBe("saved");
		expect(state.pickDirectory).not.toHaveBeenCalled();
	});

	it("replaces an existing file with the same sanitized name", async () => {
		state.list.mockReturnValue([
			new state.FileClass("content://provider/document/old", "보고서.csv"),
		]);
		expect((await saveManagedFile(input)).status).toBe("saved");
		expect(state.deleteExisting).toHaveBeenCalledOnce();
	});

	it("never writes when the user cancels folder selection", async () => {
		state.pickDirectory.mockRejectedValue(new Error("cancelled"));
		expect(await saveManagedFile(input)).toEqual({ status: "cancelled" });
		expect(state.write).not.toHaveBeenCalled();
	});

	it("does not report success for truncated output", async () => {
		state.createFile.mockReturnValue(
			Object.assign(new state.FileClass("content://provider/document/report"), {
				size: 1,
			})
		);
		expect((await saveManagedFile(input)).status).toBe("failed");
	});

	it("handles permission denial and full storage", async () => {
		state.write.mockImplementationOnce(() => {
			throw new Error("permission denied");
		});
		expect((await saveManagedFile(input)).status).toBe("failed");
	});

	it("does not open the folder picker on excluded platforms", async () => {
		state.os = "ios";
		expect((await saveManagedFile(input)).status).toBe("failed");
		expect(state.pickDirectory).not.toHaveBeenCalled();
	});
});
