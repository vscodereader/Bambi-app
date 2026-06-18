"use client";

// 밤비 디자인 시스템 — 코어 프리미티브.
// Claude Design "_ds_bundle.js"에서 충실히 포팅 (인라인 스타일 + CSS 토큰).

import type { CSSProperties, ReactElement, ReactNode } from "react";
import { useState } from "react";
import {
	ArrowNarrowLeft,
	BookmarkIcon,
	ClockIcon,
	EyeIcon,
	EyeOffIcon,
	Filter,
	Home2,
	MapPinIcon,
	Message,
	Search2,
	SearchIcon,
	UserIcon,
} from "./icons";

type IconComp = (props: { style?: CSSProperties }) => ReactElement;
type Size = "xs" | "sm" | "md" | "lg" | "xl";

const WHITESPACE_RE = /\s+/;

// ---- Avatar ----------------------------------------------------------------
const AVATAR_SIZES: Record<Size, number> = {
	xs: 28,
	sm: 36,
	md: 44,
	lg: 56,
	xl: 72,
};

interface AvatarProps {
	name?: string;
	ring?: boolean;
	size?: Size;
	square?: boolean;
	src?: string;
	style?: CSSProperties;
}

export function Avatar({
	name = "",
	size = "md",
	square = false,
	ring = false,
	style,
}: AvatarProps) {
	const dim = AVATAR_SIZES[size] || AVATAR_SIZES.md;
	const initials = name
		.trim()
		.split(WHITESPACE_RE)
		.map((w) => w[0])
		.slice(0, 2)
		.join("")
		.toUpperCase();
	return (
		<div
			style={{
				width: dim,
				height: dim,
				flex: `0 0 ${dim}px`,
				borderRadius: square ? "var(--radius-tile)" : "50%",
				overflow: "hidden",
				display: "inline-flex",
				alignItems: "center",
				justifyContent: "center",
				background: "var(--color-primary-soft)",
				color: "var(--color-primary-press)",
				fontFamily: "var(--font-sans)",
				fontSize: Math.max(11, Math.round(dim * 0.36)),
				fontWeight: "var(--weight-bold)",
				boxShadow: ring
					? "0 0 0 2px var(--surface-page), 0 0 0 4px var(--color-primary-soft)"
					: "none",
				...style,
			}}
		>
			<span>{initials || "•"}</span>
		</div>
	);
}

// ---- Badge -----------------------------------------------------------------
type BadgeTone =
	| "neutral"
	| "primary"
	| "success"
	| "pending"
	| "danger"
	| "info"
	| "dark";

const BADGE_TONES: Record<BadgeTone, { bg: string; fg: string }> = {
	neutral: { bg: "var(--surface-sunken)", fg: "var(--text-default)" },
	primary: {
		bg: "var(--color-primary-soft)",
		fg: "var(--color-primary-press)",
	},
	success: { bg: "var(--status-success-bg)", fg: "var(--status-success-fg)" },
	pending: { bg: "var(--status-pending-bg)", fg: "var(--status-pending-fg)" },
	danger: { bg: "var(--status-danger-bg)", fg: "var(--status-danger-fg)" },
	info: { bg: "var(--status-info-bg)", fg: "var(--status-info-fg)" },
	dark: { bg: "var(--surface-inverse)", fg: "var(--text-inverse)" },
};

interface BadgeProps {
	children?: ReactNode;
	dot?: boolean;
	style?: CSSProperties;
	tone?: BadgeTone;
}

export function Badge({
	tone = "neutral",
	dot = false,
	children,
	style,
}: BadgeProps) {
	const t = BADGE_TONES[tone] || BADGE_TONES.neutral;
	return (
		<span
			style={{
				display: "inline-flex",
				alignItems: "center",
				gap: 6,
				height: 24,
				padding: "0 10px",
				borderRadius: "var(--radius-pill)",
				background: t.bg,
				color: t.fg,
				fontFamily: "var(--font-sans)",
				fontSize: "var(--text-xs)",
				fontWeight: "var(--weight-semibold)",
				lineHeight: 1,
				whiteSpace: "nowrap",
				...style,
			}}
		>
			{dot ? (
				<span
					style={{
						width: 6,
						height: 6,
						borderRadius: "50%",
						background: "currentColor",
					}}
				/>
			) : null}
			{children}
		</span>
	);
}

// ---- Button ----------------------------------------------------------------
type ButtonVariant =
	| "primary"
	| "dark"
	| "secondary"
	| "ghost"
	| "soft"
	| "danger";
type ButtonSize = "lg" | "md" | "sm";

const BTN_VARIANTS: Record<ButtonVariant, CSSProperties> = {
	primary: {
		background: "var(--color-primary)",
		color: "var(--color-on-primary)",
		border: "1px solid transparent",
		boxShadow: "var(--shadow-primary)",
	},
	dark: {
		background: "var(--surface-inverse)",
		color: "var(--text-inverse)",
		border: "1px solid transparent",
		boxShadow: "var(--shadow-sm)",
	},
	secondary: {
		background: "var(--surface-card)",
		color: "var(--text-strong)",
		border: "1px solid var(--border-default)",
		boxShadow: "none",
	},
	ghost: {
		background: "transparent",
		color: "var(--text-default)",
		border: "1px solid transparent",
		boxShadow: "none",
	},
	soft: {
		background: "var(--color-primary-soft)",
		color: "var(--color-primary-press)",
		border: "1px solid transparent",
		boxShadow: "none",
	},
	danger: {
		background: "var(--red-500)",
		color: "var(--white)",
		border: "1px solid transparent",
		boxShadow: "none",
	},
};

const BTN_SIZES: Record<
	ButtonSize,
	{
		height: string;
		fontSize: string;
		padding: string;
		radius: string;
		gap: number;
	}
> = {
	lg: {
		height: "var(--control-h)",
		fontSize: "var(--text-body)",
		padding: "0 24px",
		radius: "var(--radius-lg)",
		gap: 8,
	},
	md: {
		height: "var(--control-h-sm)",
		fontSize: "var(--text-sm)",
		padding: "0 18px",
		radius: "var(--radius-md)",
		gap: 8,
	},
	sm: {
		height: "var(--control-h-xs)",
		fontSize: "var(--text-sm)",
		padding: "0 14px",
		radius: "var(--radius-sm)",
		gap: 6,
	},
};

interface ButtonProps {
	block?: boolean;
	children?: ReactNode;
	disabled?: boolean;
	leftIcon?: ReactNode;
	onClick?: () => void;
	rightIcon?: ReactNode;
	size?: ButtonSize;
	style?: CSSProperties;
	variant?: ButtonVariant;
}

export function Button({
	variant = "primary",
	size = "lg",
	block = false,
	leftIcon,
	rightIcon,
	disabled = false,
	children,
	style,
	onClick,
}: ButtonProps) {
	const v = BTN_VARIANTS[variant] || BTN_VARIANTS.primary;
	const s = BTN_SIZES[size] || BTN_SIZES.lg;
	return (
		<button
			className="bambi-btn"
			disabled={disabled}
			onClick={onClick}
			style={{
				display: block ? "flex" : "inline-flex",
				width: block ? "100%" : "auto",
				alignItems: "center",
				justifyContent: "center",
				gap: s.gap,
				height: s.height,
				padding: s.padding,
				fontFamily: "var(--font-sans)",
				fontSize: s.fontSize,
				fontWeight: "var(--weight-bold)",
				letterSpacing: "var(--tracking-snug)",
				lineHeight: 1,
				borderRadius: s.radius,
				cursor: disabled ? "not-allowed" : "pointer",
				opacity: disabled ? 0.45 : 1,
				transition:
					"transform var(--dur-fast) var(--ease-out), filter var(--dur-fast) var(--ease-out), box-shadow var(--dur-fast) var(--ease-out)",
				...v,
				...style,
			}}
			type="button"
		>
			{leftIcon ? (
				<span style={{ display: "inline-flex", width: 20, height: 20 }}>
					{leftIcon}
				</span>
			) : null}
			{children}
			{rightIcon ? (
				<span style={{ display: "inline-flex", width: 20, height: 20 }}>
					{rightIcon}
				</span>
			) : null}
		</button>
	);
}

// ---- Card ------------------------------------------------------------------
type CardTone = "default" | "subtle" | "inverse" | "outline";
type CardPad = "none" | "sm" | "md" | "lg";

const CARD_PADS: Record<CardPad, number> = { none: 0, sm: 14, md: 16, lg: 20 };

interface CardProps {
	children?: ReactNode;
	interactive?: boolean;
	pad?: CardPad;
	style?: CSSProperties;
	tone?: CardTone;
}

export function Card({
	tone = "default",
	pad = "md",
	interactive = false,
	children,
	style,
}: CardProps) {
	const tones: Record<CardTone, CSSProperties> = {
		default: {
			background: "var(--surface-card)",
			color: "var(--text-default)",
			border: "1px solid var(--border-subtle)",
		},
		subtle: {
			background: "var(--surface-subtle)",
			color: "var(--text-default)",
			border: "1px solid transparent",
		},
		inverse: {
			background: "var(--surface-inverse)",
			color: "var(--text-inverse)",
			border: "1px solid var(--border-inverse)",
		},
		outline: {
			background: "var(--surface-card)",
			color: "var(--text-default)",
			border: "1px solid var(--border-default)",
		},
	};
	const t = tones[tone] || tones.default;
	return (
		<div
			className={
				interactive ? "bambi-card bambi-card--interactive" : "bambi-card"
			}
			style={{
				borderRadius: "var(--radius-card)",
				padding: CARD_PADS[pad],
				boxShadow: tone === "inverse" ? "none" : "var(--shadow-card)",
				transition:
					"transform var(--dur-base) var(--ease-out), box-shadow var(--dur-base) var(--ease-out)",
				...t,
				...style,
			}}
		>
			{children}
		</div>
	);
}

// ---- IconButton ------------------------------------------------------------
const ICONBTN_SIZES: Record<"lg" | "md" | "sm", number> = {
	lg: 48,
	md: 40,
	sm: 32,
};

interface IconButtonProps {
	active?: boolean;
	badge?: boolean;
	children?: ReactNode;
	onClick?: () => void;
	size?: "lg" | "md" | "sm";
	style?: CSSProperties;
	variant?: "subtle" | "plain" | "outline" | "inverse";
}

export function IconButton({
	size = "md",
	variant = "subtle",
	active = false,
	badge = false,
	children,
	style,
	onClick,
}: IconButtonProps) {
	const dim = ICONBTN_SIZES[size] || ICONBTN_SIZES.md;
	const skins: Record<string, CSSProperties> = {
		subtle: {
			background: "var(--surface-subtle)",
			color: "var(--text-default)",
			border: "1px solid transparent",
		},
		plain: {
			background: "transparent",
			color: "var(--text-default)",
			border: "1px solid transparent",
		},
		outline: {
			background: "var(--surface-card)",
			color: "var(--text-default)",
			border: "1px solid var(--border-default)",
		},
		inverse: {
			background: "rgba(255,255,255,0.08)",
			color: "var(--white)",
			border: "1px solid rgba(255,255,255,0.12)",
		},
	};
	const skin = active
		? {
				background: "var(--color-primary-soft)",
				color: "var(--color-primary-press)",
				border: "1px solid transparent",
			}
		: skins[variant] || skins.subtle;
	return (
		<button
			onClick={onClick}
			style={{
				position: "relative",
				display: "inline-flex",
				alignItems: "center",
				justifyContent: "center",
				width: dim,
				height: dim,
				borderRadius: "var(--radius-md)",
				cursor: "pointer",
				transition:
					"filter var(--dur-fast) var(--ease-out), background var(--dur-fast)",
				...skin,
				...style,
			}}
			type="button"
		>
			<span
				style={{
					display: "inline-flex",
					width: Math.round(dim * 0.5),
					height: Math.round(dim * 0.5),
				}}
			>
				{children}
			</span>
			{badge ? (
				<span
					style={{
						position: "absolute",
						top: dim * 0.18,
						right: dim * 0.18,
						width: 8,
						height: 8,
						borderRadius: "50%",
						background: "var(--coral-500)",
						boxShadow: "0 0 0 2px var(--surface-page)",
					}}
				/>
			) : null}
		</button>
	);
}

// ---- InfoTile --------------------------------------------------------------
interface InfoTileProps {
	icon?: ReactNode;
	label?: ReactNode;
	style?: CSSProperties;
	value?: ReactNode;
}

export function InfoTile({ icon, label, value, style }: InfoTileProps) {
	return (
		<div style={{ display: "flex", alignItems: "center", gap: 12, ...style }}>
			<div
				style={{
					width: 48,
					height: 48,
					flex: "0 0 48px",
					borderRadius: "var(--radius-md)",
					background: "var(--surface-subtle)",
					display: "inline-flex",
					alignItems: "center",
					justifyContent: "center",
					color: "var(--text-default)",
				}}
			>
				<span style={{ display: "inline-flex", width: 22, height: 22 }}>
					{icon}
				</span>
			</div>
			<div
				style={{
					display: "flex",
					flexDirection: "column",
					gap: 2,
					minWidth: 0,
				}}
			>
				<span
					style={{
						fontFamily: "var(--font-sans)",
						fontSize: "var(--text-xs)",
						color: "var(--text-muted)",
						fontWeight: "var(--weight-medium)",
					}}
				>
					{label}
				</span>
				<span
					style={{
						fontFamily: "var(--font-sans)",
						fontSize: "var(--text-body)",
						color: "var(--text-strong)",
						fontWeight: "var(--weight-bold)",
						whiteSpace: "nowrap",
						overflow: "hidden",
						textOverflow: "ellipsis",
					}}
				>
					{value}
				</span>
			</div>
		</div>
	);
}

// ---- Logo ------------------------------------------------------------------
const LOGO_SIZES: Record<"sm" | "md" | "lg" | "xl", number> = {
	sm: 28,
	md: 36,
	lg: 44,
	xl: 64,
};

interface LogoProps {
	lang?: "en" | "ko";
	size?: "sm" | "md" | "lg" | "xl";
	style?: CSSProperties;
	tone?: "brand" | "inverse";
	wordmark?: boolean;
}

export function Logo({
	size = "md",
	wordmark = true,
	lang = "en",
	tone = "brand",
	style,
}: LogoProps) {
	const dim = LOGO_SIZES[size] || LOGO_SIZES.md;
	const tileBg = tone === "inverse" ? "var(--white)" : "var(--color-primary)";
	const glyph = tone === "inverse" ? "var(--color-primary)" : "var(--white)";
	const word = tone === "inverse" ? "var(--white)" : "var(--text-strong)";
	const label = lang === "ko" ? "밤비" : "Bambi";
	return (
		<div
			style={{
				display: "inline-flex",
				alignItems: "center",
				gap: Math.round(dim * 0.28),
				...style,
			}}
		>
			<div
				style={{
					width: dim,
					height: dim,
					flex: `0 0 ${dim}px`,
					borderRadius: dim * 0.3,
					background: tileBg,
					display: "inline-flex",
					alignItems: "center",
					justifyContent: "center",
					boxShadow: tone === "inverse" ? "none" : "var(--shadow-primary)",
				}}
			>
				<svg
					aria-hidden="true"
					fill="none"
					height={dim * 0.56}
					viewBox="0 0 24 24"
					width={dim * 0.56}
				>
					<title>밤비</title>
					<path
						d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"
						fill={glyph}
					/>
					<circle cx="16.5" cy="8" fill={glyph} r="1.15" />
				</svg>
			</div>
			{wordmark ? (
				<span
					style={{
						fontFamily: "var(--font-display)",
						fontSize: dim * 0.5,
						fontWeight: "var(--weight-extrabold)",
						letterSpacing: "var(--tracking-tight)",
						color: word,
						lineHeight: 1,
					}}
				>
					{label}
				</span>
			) : null}
		</div>
	);
}

// ---- SegmentedTabs ---------------------------------------------------------
interface TabItem {
	label: string;
	value: string;
}
interface SegmentedTabsProps {
	items?: (TabItem | string)[];
	onChange?: (value: string) => void;
	style?: CSSProperties;
	value?: string;
	variant?: "solid" | "segment" | "underline";
}

export function SegmentedTabs({
	items = [],
	value,
	onChange,
	variant = "solid",
	style,
}: SegmentedTabsProps) {
	const norm: TabItem[] = items.map((it) =>
		typeof it === "string" ? { value: it, label: it } : it
	);
	const idx = Math.max(
		0,
		norm.findIndex((it) => it.value === value)
	);

	if (variant === "segment") {
		return (
			<div
				style={{
					display: "flex",
					gap: 4,
					padding: 4,
					background: "var(--surface-sunken)",
					borderRadius: "var(--radius-md)",
					...style,
				}}
			>
				{norm.map((it, i) => {
					const on = i === idx;
					return (
						<button
							key={it.value}
							onClick={() => onChange?.(it.value)}
							style={{
								flex: 1,
								height: 40,
								border: "none",
								cursor: "pointer",
								borderRadius: "var(--radius-sm)",
								background: on ? "var(--surface-card)" : "transparent",
								color: on ? "var(--text-strong)" : "var(--text-muted)",
								fontFamily: "var(--font-sans)",
								fontSize: "var(--text-sm)",
								fontWeight: on ? "var(--weight-bold)" : "var(--weight-medium)",
								boxShadow: on ? "var(--shadow-xs)" : "none",
								transition: "all var(--dur-fast) var(--ease-out)",
							}}
							type="button"
						>
							{it.label}
						</button>
					);
				})}
			</div>
		);
	}

	if (variant === "underline") {
		return (
			<div
				style={{
					display: "flex",
					gap: 24,
					borderBottom: "1px solid var(--border-subtle)",
					...style,
				}}
			>
				{norm.map((it, i) => {
					const on = i === idx;
					return (
						<button
							key={it.value}
							onClick={() => onChange?.(it.value)}
							style={{
								position: "relative",
								padding: "10px 0 12px",
								border: "none",
								background: "none",
								cursor: "pointer",
								fontFamily: "var(--font-sans)",
								fontSize: "var(--text-sm)",
								fontWeight: on ? "var(--weight-bold)" : "var(--weight-medium)",
								color: on ? "var(--text-strong)" : "var(--text-muted)",
							}}
							type="button"
						>
							{it.label}
							<span
								style={{
									position: "absolute",
									left: 0,
									right: 0,
									bottom: -1,
									height: 2.5,
									borderRadius: 2,
									background: on ? "var(--color-primary)" : "transparent",
								}}
							/>
						</button>
					);
				})}
			</div>
		);
	}

	return (
		<div style={{ display: "flex", gap: 12, ...style }}>
			{norm.map((it, i) => {
				const on = i === idx;
				return (
					<button
						key={it.value}
						onClick={() => onChange?.(it.value)}
						style={{
							height: "var(--control-h-sm)",
							padding: "0 22px",
							cursor: "pointer",
							borderRadius: "var(--radius-md)",
							background: on ? "var(--surface-inverse)" : "var(--surface-card)",
							color: on ? "var(--text-inverse)" : "var(--text-muted)",
							border: on
								? "1px solid transparent"
								: "1px solid var(--border-default)",
							fontFamily: "var(--font-sans)",
							fontSize: "var(--text-sm)",
							fontWeight: "var(--weight-bold)",
							whiteSpace: "nowrap",
							transition: "all var(--dur-fast) var(--ease-out)",
						}}
						type="button"
					>
						{it.label}
					</button>
				);
			})}
		</div>
	);
}

// ---- Tag -------------------------------------------------------------------
interface TagProps {
	children?: ReactNode;
	leftIcon?: ReactNode;
	onClick?: () => void;
	selected?: boolean;
	style?: CSSProperties;
}

export function Tag({
	selected = false,
	leftIcon,
	children,
	style,
	onClick,
}: TagProps) {
	return (
		<button
			onClick={onClick}
			style={{
				display: "inline-flex",
				alignItems: "center",
				gap: 6,
				height: "var(--control-h-xs)",
				padding: "0 16px",
				borderRadius: "var(--radius-pill)",
				fontFamily: "var(--font-sans)",
				fontSize: "var(--text-sm)",
				fontWeight: "var(--weight-semibold)",
				lineHeight: 1,
				cursor: "pointer",
				whiteSpace: "nowrap",
				transition:
					"background var(--dur-fast), color var(--dur-fast), border-color var(--dur-fast)",
				background: selected ? "var(--surface-inverse)" : "var(--surface-card)",
				color: selected ? "var(--text-inverse)" : "var(--text-muted)",
				border: selected
					? "1px solid transparent"
					: "1px solid var(--border-default)",
				...style,
			}}
			type="button"
		>
			{leftIcon ? (
				<span style={{ display: "inline-flex", width: 16, height: 16 }}>
					{leftIcon}
				</span>
			) : null}
			{children}
		</button>
	);
}

// ---- Switch ----------------------------------------------------------------
interface SwitchProps {
	checked?: boolean;
	disabled?: boolean;
	onChange?: (checked: boolean) => void;
	style?: CSSProperties;
}

export function Switch({
	checked = false,
	onChange,
	disabled = false,
	style,
}: SwitchProps) {
	return (
		<button
			aria-checked={checked}
			disabled={disabled}
			onClick={() => !disabled && onChange?.(!checked)}
			role="switch"
			style={{
				position: "relative",
				width: 48,
				height: 28,
				flex: "0 0 48px",
				borderRadius: "var(--radius-pill)",
				border: "none",
				padding: 0,
				cursor: disabled ? "not-allowed" : "pointer",
				opacity: disabled ? 0.5 : 1,
				background: checked ? "var(--color-primary)" : "var(--gray-300)",
				transition: "background var(--dur-base) var(--ease-out)",
				...style,
			}}
			type="button"
		>
			<span
				style={{
					position: "absolute",
					top: 3,
					left: checked ? 23 : 3,
					width: 22,
					height: 22,
					borderRadius: "50%",
					background: "var(--white)",
					boxShadow: "var(--shadow-sm)",
					transition: "left var(--dur-base) var(--ease-out)",
				}}
			/>
		</button>
	);
}

// ---- Input -----------------------------------------------------------------
interface InputProps {
	defaultValue?: string;
	error?: boolean;
	inputStyle?: CSSProperties;
	leadingIcon?: ReactNode;
	onChange?: (e: React.ChangeEvent<HTMLInputElement>) => void;
	placeholder?: string;
	style?: CSSProperties;
	type?: string;
	value?: string;
}

export function Input({
	leadingIcon,
	type = "text",
	error = false,
	style,
	inputStyle,
	value,
	defaultValue,
	placeholder,
	onChange,
}: InputProps) {
	const [show, setShow] = useState(false);
	const [focus, setFocus] = useState(false);
	const isPassword = type === "password";
	let borderColor = "var(--border-default)";
	if (error) {
		borderColor = "var(--status-danger-fg)";
	} else if (focus) {
		borderColor = "var(--border-focus)";
	}
	return (
		<div
			style={{
				display: "flex",
				alignItems: "center",
				gap: 12,
				height: "var(--control-h)",
				padding: "0 18px",
				borderRadius: "var(--radius-lg)",
				background: "var(--surface-card)",
				border: `1px solid ${borderColor}`,
				boxShadow: focus && !error ? "var(--focus-ring)" : "none",
				transition: "border-color var(--dur-fast), box-shadow var(--dur-fast)",
				...style,
			}}
		>
			{leadingIcon ? (
				<span
					style={{
						display: "inline-flex",
						width: 20,
						height: 20,
						color: "var(--text-subtle)",
						flex: "0 0 20px",
					}}
				>
					{leadingIcon}
				</span>
			) : null}
			<input
				aria-label={placeholder}
				defaultValue={defaultValue}
				onBlur={() => setFocus(false)}
				onChange={onChange}
				onFocus={() => setFocus(true)}
				placeholder={placeholder}
				style={{
					flex: 1,
					minWidth: 0,
					border: "none",
					outline: "none",
					background: "transparent",
					fontFamily: "var(--font-sans)",
					fontSize: "var(--text-body)",
					fontWeight: "var(--weight-medium)",
					color: "var(--text-strong)",
					...inputStyle,
				}}
				type={isPassword && show ? "text" : type}
				value={value}
			/>
			{isPassword ? (
				<button
					aria-label={show ? "숨기기" : "보기"}
					onClick={() => setShow((p) => !p)}
					style={{
						display: "inline-flex",
						width: 22,
						height: 22,
						color: "var(--text-subtle)",
						background: "none",
						border: "none",
						cursor: "pointer",
						padding: 0,
					}}
					type="button"
				>
					{show ? <EyeIcon /> : <EyeOffIcon />}
				</button>
			) : null}
		</div>
	);
}

// ---- SearchField -----------------------------------------------------------
interface SearchFieldProps {
	onFilter?: () => void;
	placeholder?: string;
	showFilter?: boolean;
	style?: CSSProperties;
}

export function SearchField({
	placeholder = "검색",
	onFilter,
	showFilter = true,
	style,
}: SearchFieldProps) {
	return (
		<div style={{ display: "flex", alignItems: "center", gap: 10, ...style }}>
			<div
				style={{
					flex: 1,
					display: "flex",
					alignItems: "center",
					gap: 12,
					height: "var(--control-h)",
					padding: "0 18px",
					borderRadius: "var(--radius-lg)",
					background: "var(--surface-subtle)",
					border: "1px solid transparent",
				}}
			>
				<span
					style={{
						display: "inline-flex",
						width: 20,
						height: 20,
						color: "var(--text-subtle)",
					}}
				>
					<SearchIcon />
				</span>
				<input
					aria-label={placeholder}
					placeholder={placeholder}
					style={{
						flex: 1,
						minWidth: 0,
						border: "none",
						outline: "none",
						background: "transparent",
						fontFamily: "var(--font-sans)",
						fontSize: "var(--text-body)",
						fontWeight: "var(--weight-medium)",
						color: "var(--text-strong)",
					}}
				/>
			</div>
			{showFilter ? (
				<button
					aria-label="필터"
					onClick={onFilter}
					style={{
						width: "var(--control-h)",
						height: "var(--control-h)",
						flex: "0 0 var(--control-h)",
						borderRadius: "var(--radius-lg)",
						border: "none",
						cursor: "pointer",
						background: "var(--color-primary)",
						color: "var(--color-on-primary)",
						display: "inline-flex",
						alignItems: "center",
						justifyContent: "center",
						boxShadow: "var(--shadow-primary)",
					}}
					type="button"
				>
					<span style={{ display: "inline-flex", width: 22, height: 22 }}>
						<Filter />
					</span>
				</button>
			) : null}
		</div>
	);
}

// ---- AppBar ----------------------------------------------------------------
interface AppBarProps {
	actions?: ReactNode;
	center?: boolean;
	onBack?: () => void;
	style?: CSSProperties;
	subtitle?: ReactNode;
	title?: ReactNode;
	tone?: "default" | "inverse";
}

export function AppBar({
	title,
	subtitle,
	onBack,
	actions,
	center = false,
	tone = "default",
	style,
}: AppBarProps) {
	const fg = tone === "inverse" ? "var(--white)" : "var(--text-strong)";
	const subFg =
		tone === "inverse" ? "var(--text-on-dark-muted)" : "var(--text-muted)";
	return (
		<header
			style={{
				display: "flex",
				alignItems: "center",
				gap: 12,
				height: 56,
				padding: "0 8px",
				background:
					tone === "inverse" ? "var(--surface-inverse)" : "transparent",
				...style,
			}}
		>
			{onBack ? (
				<button
					aria-label="뒤로"
					onClick={onBack}
					style={{
						width: 40,
						height: 40,
						flex: "0 0 40px",
						borderRadius: "var(--radius-md)",
						border: "none",
						cursor: "pointer",
						display: "inline-flex",
						alignItems: "center",
						justifyContent: "center",
						background:
							tone === "inverse"
								? "rgba(255,255,255,0.08)"
								: "var(--surface-subtle)",
						color: fg,
					}}
					type="button"
				>
					<span style={{ display: "inline-flex", width: 22, height: 22 }}>
						<ArrowNarrowLeft />
					</span>
				</button>
			) : (
				<span style={{ width: 40, flex: "0 0 40px" }} />
			)}
			<div
				style={{
					flex: 1,
					display: "flex",
					flexDirection: "column",
					alignItems: center ? "center" : "flex-start",
					gap: 1,
					minWidth: 0,
				}}
			>
				{title ? (
					<span
						style={{
							fontFamily: "var(--font-sans)",
							fontSize: "var(--text-h3)",
							fontWeight: "var(--weight-bold)",
							color: fg,
							whiteSpace: "nowrap",
							overflow: "hidden",
							textOverflow: "ellipsis",
							maxWidth: "100%",
						}}
					>
						{title}
					</span>
				) : null}
				{subtitle ? (
					<span
						style={{
							fontFamily: "var(--font-sans)",
							fontSize: "var(--text-xs)",
							color: subFg,
						}}
					>
						{subtitle}
					</span>
				) : null}
			</div>
			<div
				style={{
					flex: "0 0 auto",
					display: "flex",
					alignItems: "center",
					gap: 6,
					justifyContent: "flex-end",
					minWidth: 40,
				}}
			>
				{actions}
			</div>
		</header>
	);
}

// ---- BottomNav -------------------------------------------------------------
interface NavItem {
	icon: IconComp;
	label: string;
	value: string;
}
interface BottomNavProps {
	badges?: Record<string, number>;
	items?: NavItem[];
	onChange?: (value: string) => void;
	style?: CSSProperties;
	value?: string;
}

const DEFAULT_NAV_ITEMS: NavItem[] = [
	{ value: "home", label: "홈", icon: Home2 },
	{ value: "search", label: "탐색", icon: Search2 },
	{ value: "chat", label: "채팅", icon: Message },
	{ value: "saved", label: "저장", icon: BookmarkIcon },
	{ value: "me", label: "내 정보", icon: UserIcon },
];

export function BottomNav({
	items = DEFAULT_NAV_ITEMS,
	value = "home",
	onChange,
	badges = {},
	style,
}: BottomNavProps) {
	return (
		<nav
			style={{
				display: "flex",
				alignItems: "stretch",
				justifyContent: "space-around",
				background: "var(--surface-card)",
				borderTop: "1px solid var(--border-subtle)",
				padding: "10px 8px 8px",
				...style,
			}}
		>
			{items.map((it) => {
				const Icon = it.icon;
				const on = it.value === value;
				const count = badges[it.value];
				return (
					<button
						key={it.value}
						onClick={() => onChange?.(it.value)}
						style={{
							flex: 1,
							display: "flex",
							flexDirection: "column",
							alignItems: "center",
							gap: 4,
							border: "none",
							background: "none",
							cursor: "pointer",
							padding: "4px 0",
							color: on ? "var(--color-primary)" : "var(--text-subtle)",
						}}
						type="button"
					>
						<span
							style={{
								position: "relative",
								display: "inline-flex",
								width: 24,
								height: 24,
							}}
						>
							<Icon />
							{count ? (
								<span
									style={{
										position: "absolute",
										top: -5,
										right: -8,
										minWidth: 16,
										height: 16,
										padding: "0 4px",
										borderRadius: 999,
										background: "var(--coral-500)",
										color: "#fff",
										fontFamily: "var(--font-sans)",
										fontSize: 10,
										fontWeight: 700,
										display: "inline-flex",
										alignItems: "center",
										justifyContent: "center",
										boxShadow: "0 0 0 2px var(--surface-card)",
									}}
								>
									{count}
								</span>
							) : null}
						</span>
						<span
							style={{
								fontFamily: "var(--font-sans)",
								fontSize: "var(--text-2xs)",
								fontWeight: on ? "var(--weight-bold)" : "var(--weight-medium)",
							}}
						>
							{it.label}
						</span>
					</button>
				);
			})}
		</nav>
	);
}

// ---- ChatBubble ------------------------------------------------------------
interface ChatBubbleProps {
	children?: ReactNode;
	mine?: boolean;
	read?: boolean;
	style?: CSSProperties;
	time?: string;
}

export function ChatBubble({
	mine = false,
	time,
	read,
	children,
	style,
}: ChatBubbleProps) {
	return (
		<div
			style={{
				display: "flex",
				flexDirection: "column",
				alignItems: mine ? "flex-end" : "flex-start",
				gap: 4,
				...style,
			}}
		>
			<div
				style={{
					maxWidth: "78%",
					padding: "10px 14px",
					borderRadius: 18,
					borderBottomRightRadius: mine ? 6 : 18,
					borderBottomLeftRadius: mine ? 18 : 6,
					background: mine ? "var(--color-primary)" : "var(--surface-sunken)",
					color: mine ? "var(--color-on-primary)" : "var(--text-default)",
					fontFamily: "var(--font-sans)",
					fontSize: "var(--text-sm)",
					lineHeight: 1.5,
					wordBreak: "break-word",
				}}
			>
				{children}
			</div>
			{time ? (
				<span
					style={{
						display: "flex",
						gap: 4,
						alignItems: "center",
						fontFamily: "var(--font-sans)",
						fontSize: "var(--text-2xs)",
						color: "var(--text-subtle)",
						padding: "0 4px",
					}}
				>
					{mine && read ? (
						<span style={{ color: "var(--coral-500)", fontWeight: 700 }}>
							읽음
						</span>
					) : null}
					{time}
				</span>
			) : null}
		</div>
	);
}

// ---- JobCard ---------------------------------------------------------------
interface JobCardProps {
	company: string;
	featured?: boolean;
	location?: string;
	logo?: string;
	logoName?: string;
	onClick?: () => void;
	onSave?: (saved: boolean) => void;
	pay?: string;
	saved?: boolean;
	style?: CSSProperties;
	tags?: string[];
	title: string;
}

export function JobCard({
	title,
	company,
	location,
	logo,
	logoName,
	pay,
	tags = [],
	saved = false,
	onSave,
	featured = false,
	style,
	onClick,
}: JobCardProps) {
	return (
		// biome-ignore lint/a11y/useSemanticElements: 카드 내부에 북마크 버튼이 중첩되어 네이티브 button 사용 불가. tabIndex/onKeyDown으로 키보드 접근성 보장.
		<div
			onClick={onClick}
			onKeyDown={(e) => {
				if (e.key === "Enter" || e.key === " ") {
					e.preventDefault();
					onClick?.();
				}
			}}
			role="button"
			style={{
				display: "flex",
				flexDirection: "column",
				gap: 14,
				padding: 16,
				borderRadius: "var(--radius-card)",
				background: featured ? "var(--surface-inverse)" : "var(--surface-card)",
				color: featured ? "var(--text-inverse)" : "var(--text-default)",
				border: featured
					? "1px solid var(--border-inverse)"
					: "1px solid var(--border-subtle)",
				boxShadow: featured ? "none" : "var(--shadow-card)",
				cursor: "pointer",
				...style,
			}}
			tabIndex={0}
		>
			<div style={{ display: "flex", alignItems: "flex-start", gap: 12 }}>
				<Avatar name={logoName || company} size="lg" square src={logo} />
				<div
					style={{
						flex: 1,
						minWidth: 0,
						display: "flex",
						flexDirection: "column",
						gap: 3,
					}}
				>
					<span
						style={{
							fontFamily: "var(--font-sans)",
							fontSize: "var(--text-h3)",
							fontWeight: "var(--weight-bold)",
							color: featured ? "var(--white)" : "var(--text-strong)",
							lineHeight: 1.3,
						}}
					>
						{title}
					</span>
					<span
						style={{
							display: "flex",
							alignItems: "center",
							gap: 5,
							fontFamily: "var(--font-sans)",
							fontSize: "var(--text-sm)",
							color: featured
								? "var(--text-on-dark-muted)"
								: "var(--text-muted)",
						}}
					>
						{company}
						{location ? (
							<>
								<span style={{ opacity: 0.5 }}>·</span>
								<span
									style={{
										display: "inline-flex",
										width: 13,
										height: 13,
										opacity: 0.8,
									}}
								>
									<MapPinIcon />
								</span>
								{location}
							</>
						) : null}
					</span>
				</div>
				<button
					aria-label="저장"
					onClick={(e) => {
						e.stopPropagation();
						onSave?.(!saved);
					}}
					style={{
						border: "none",
						background: "none",
						cursor: "pointer",
						padding: 2,
						display: "inline-flex",
						width: 22,
						height: 22,
						color: (() => {
							if (saved) {
								return "var(--coral-500)";
							}
							return featured ? "rgba(255,255,255,0.6)" : "var(--text-subtle)";
						})(),
					}}
					type="button"
				>
					<BookmarkIcon
						style={saved ? { fill: "var(--coral-500)" } : undefined}
					/>
				</button>
			</div>
			{tags.length ? (
				<div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
					{tags.map((t) => (
						<Badge
							key={t}
							style={
								featured
									? {
											background: "rgba(255,255,255,0.10)",
											color: "var(--white)",
										}
									: undefined
							}
							tone={featured ? "dark" : "neutral"}
						>
							{t}
						</Badge>
					))}
				</div>
			) : null}
			{pay ? (
				<div
					style={{
						display: "flex",
						alignItems: "baseline",
						justifyContent: "space-between",
						paddingTop: 2,
						borderTop: featured
							? "1px solid rgba(255,255,255,0.08)"
							: "1px solid var(--border-subtle)",
					}}
				>
					<span
						style={{
							fontFamily: "var(--font-sans)",
							fontSize: "var(--text-body)",
							fontWeight: "var(--weight-extrabold)",
							color: featured ? "var(--white)" : "var(--text-strong)",
							paddingTop: 12,
						}}
					>
						{pay}
					</span>
				</div>
			) : null}
		</div>
	);
}

// ---- ScheduleCard ----------------------------------------------------------
type ScheduleStatus = "proposed" | "confirmed" | "declined";
const SCHEDULE_STATUS: Record<
	ScheduleStatus,
	{ tone: BadgeTone; label: string }
> = {
	proposed: { tone: "pending", label: "제안됨" },
	confirmed: { tone: "success", label: "일정 확정" },
	declined: { tone: "danger", label: "거절됨" },
};

interface ScheduleCardProps {
	byMe?: boolean;
	date?: string;
	onConfirm?: () => void;
	onDecline?: () => void;
	onPropose?: () => void;
	place?: string;
	status?: ScheduleStatus;
	style?: CSSProperties;
	time?: string;
}

export function ScheduleCard({
	date,
	time,
	place,
	status = "proposed",
	byMe = false,
	onConfirm,
	onDecline,
	onPropose,
	style,
}: ScheduleCardProps) {
	const st = SCHEDULE_STATUS[status] || SCHEDULE_STATUS.proposed;
	return (
		<div
			style={{
				display: "flex",
				flexDirection: "column",
				gap: 14,
				padding: 16,
				borderRadius: "var(--radius-lg)",
				background: "var(--surface-card)",
				border: "1px solid var(--border-default)",
				boxShadow: "var(--shadow-sm)",
				width: "100%",
				...style,
			}}
		>
			<div
				style={{
					display: "flex",
					alignItems: "center",
					justifyContent: "space-between",
				}}
			>
				<span
					style={{
						display: "flex",
						alignItems: "center",
						gap: 8,
						fontFamily: "var(--font-sans)",
						fontSize: "var(--text-sm)",
						fontWeight: "var(--weight-bold)",
						color: "var(--text-strong)",
					}}
				>
					<span
						style={{
							display: "inline-flex",
							width: 18,
							height: 18,
							color: "var(--coral-500)",
						}}
					>
						<ClockIcon />
					</span>
					면접 일정
				</span>
				<Badge dot tone={st.tone}>
					{st.label}
				</Badge>
			</div>
			<div
				style={{
					display: "flex",
					flexDirection: "column",
					gap: 8,
					padding: "12px 14px",
					borderRadius: "var(--radius-md)",
					background: "var(--surface-subtle)",
				}}
			>
				<span
					style={{
						fontFamily: "var(--font-sans)",
						fontSize: "var(--text-h3)",
						fontWeight: "var(--weight-extrabold)",
						color: "var(--text-strong)",
					}}
				>
					{date}
				</span>
				<div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
					<span
						style={{
							display: "flex",
							alignItems: "center",
							gap: 5,
							fontFamily: "var(--font-sans)",
							fontSize: "var(--text-sm)",
							color: "var(--text-muted)",
						}}
					>
						<span style={{ display: "inline-flex", width: 15, height: 15 }}>
							<ClockIcon />
						</span>
						{time}
					</span>
					{place ? (
						<span
							style={{
								display: "flex",
								alignItems: "center",
								gap: 5,
								fontFamily: "var(--font-sans)",
								fontSize: "var(--text-sm)",
								color: "var(--text-muted)",
							}}
						>
							<span style={{ display: "inline-flex", width: 15, height: 15 }}>
								<MapPinIcon />
							</span>
							{place}
						</span>
					) : null}
				</div>
			</div>
			{renderScheduleActions({ status, byMe, onConfirm, onDecline, onPropose })}
		</div>
	);
}

function renderScheduleActions({
	status,
	byMe,
	onConfirm,
	onDecline,
	onPropose,
}: {
	status: ScheduleStatus;
	byMe: boolean;
	onConfirm?: () => void;
	onDecline?: () => void;
	onPropose?: () => void;
}) {
	if (status === "proposed") {
		if (byMe) {
			return (
				<span
					style={{
						fontFamily: "var(--font-sans)",
						fontSize: "var(--text-xs)",
						color: "var(--text-subtle)",
						textAlign: "center",
					}}
				>
					상대방의 응답을 기다리고 있어요
				</span>
			);
		}
		return (
			<div style={{ display: "flex", gap: 8 }}>
				<Button block onClick={onDecline} size="md" variant="secondary">
					변경 요청
				</Button>
				<Button block onClick={onConfirm} size="md" variant="primary">
					일정 수락
				</Button>
			</div>
		);
	}
	if (status === "confirmed") {
		return (
			<span
				style={{
					fontFamily: "var(--font-sans)",
					fontSize: "var(--text-xs)",
					color: "var(--status-success-fg)",
					textAlign: "center",
					fontWeight: "var(--weight-semibold)",
				}}
			>
				면접 일정이 확정되었어요 · 연락처 공개 동의를 진행해 주세요
			</span>
		);
	}
	if (status === "declined" && onPropose) {
		return (
			<Button block onClick={onPropose} size="md" variant="soft">
				다른 일정 제안
			</Button>
		);
	}
	return null;
}
