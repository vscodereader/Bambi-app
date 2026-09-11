import {
	createContext,
	type ReactNode,
	useCallback,
	useContext,
	useMemo,
	useRef,
} from "react";
import { View as NativeView, type View } from "react-native";

export type CoachmarkTargetName = "chats" | "me" | "search";

export interface CoachmarkTargetRect {
	height: number;
	width: number;
	x: number;
	y: number;
}

interface CoachmarkTargetsContextValue {
	measure: (name: CoachmarkTargetName) => Promise<CoachmarkTargetRect | null>;
	register: (name: CoachmarkTargetName, target: View | null) => void;
}

const CoachmarkTargetsContext =
	createContext<CoachmarkTargetsContextValue | null>(null);

export function CoachmarkTargetProvider({ children }: { children: ReactNode }) {
	const targets = useRef(new Map<CoachmarkTargetName, View>());
	const register = useCallback(
		(name: CoachmarkTargetName, target: View | null) => {
			if (target) {
				targets.current.set(name, target);
			} else {
				targets.current.delete(name);
			}
		},
		[]
	);
	const measure = useCallback(
		(name: CoachmarkTargetName) =>
			new Promise<CoachmarkTargetRect | null>((resolve) => {
				const target = targets.current.get(name);
				if (!target) {
					resolve(null);
					return;
				}
				target.measureInWindow((x, y, width, height) => {
					resolve(width > 0 && height > 0 ? { height, width, x, y } : null);
				});
			}),
		[]
	);
	const value = useMemo(() => ({ measure, register }), [measure, register]);
	return (
		<CoachmarkTargetsContext.Provider value={value}>
			{children}
		</CoachmarkTargetsContext.Provider>
	);
}

export function CoachmarkTarget({
	children,
	name,
}: {
	children: ReactNode;
	name: CoachmarkTargetName;
}) {
	const context = useContext(CoachmarkTargetsContext);
	return (
		<NativeView
			collapsable={false}
			ref={(target) => context?.register(name, target)}
		>
			{children}
		</NativeView>
	);
}

export const useCoachmarkTargets = () => useContext(CoachmarkTargetsContext);
