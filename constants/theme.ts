// Hereby design tokens. Keep in sync with tailwind.config.js.
export const colors = {
  brand: "#FF6B35",
  brandSoft: "#FFF3EE",
  ink: "#111111",
  inkMuted: "#6B6B6B",
  line: "#E5E5E5",
  surface: "#FFFFFF",
  surfaceSoft: "#F7F7F7",
  accentBlue: "#4C9EEB",
  accentYellow: "#FFCB1F",
  accentPurple: "#7C6CF0",
  accentGreen: "#3EC28F",
} as const;

export const radius = {
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  pill: 999,
} as const;

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
} as const;
