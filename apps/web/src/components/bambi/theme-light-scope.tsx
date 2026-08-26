"use client";

import type { ReactNode } from "react";

const LIGHT_SCOPE_CLASS = "theme-light-scope";

export function ThemeLightScope({ children }: { children: ReactNode }) {
	return <div className={LIGHT_SCOPE_CLASS}>{children}</div>;
}
