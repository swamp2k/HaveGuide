/**
 * Small inline botanical icon set. Everything is stroked with `currentColor` so the
 * icons inherit the active theme without any per-theme asset work.
 */
import type { ReactNode } from 'react';

interface IconProps {
  size?: number;
}

function Svg({ size = 20, children }: IconProps & { children: ReactNode }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      {children}
    </svg>
  );
}

export function SunIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2.6v2M12 19.4v2M2.6 12h2M19.4 12h2M5.4 5.4l1.4 1.4M17.2 17.2l1.4 1.4M18.6 5.4l-1.4 1.4M6.8 17.2l-1.4 1.4" />
    </Svg>
  );
}

export function DropletIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M12 3.2c3 3.5 5 6.2 5 8.7a5 5 0 1 1-10 0c0-2.5 2-5.2 5-8.7Z" />
    </Svg>
  );
}

export function SoilIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M3 14h18M4.5 18h15" />
      <path d="M12 11V6M12 6c-1.8 0-2.8-1.1-2.8-2.4 1.9-.4 2.8.7 2.8 2.4Zm0 0c1.8 0 2.8-1.1 2.8-2.4-1.9-.4-2.8.7-2.8 2.4Z" />
    </Svg>
  );
}

export function DrainIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M4 6h16" />
      <path d="M8 9.5v3M12 9.5v6M16 9.5v3" />
      <path d="M6.5 19h11" />
    </Svg>
  );
}

export function WindIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M3 8.5h9.5a2.6 2.6 0 1 0-2.6-2.6M3 13h13a2.8 2.8 0 1 1-2.8 2.8M3 17.5h6.5" />
    </Svg>
  );
}

export function LeafIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M20 4c-8.5 0-15 3.4-15 10a5 5 0 0 0 5 5c6.6 0 10-6.5 10-15Z" />
      <path d="M5.5 19.5C8 15 12.5 11 18 8.5" />
    </Svg>
  );
}

export function SparkIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M12 3.5c.9 4.1 2.4 5.6 6.5 6.5-4.1.9-5.6 2.4-6.5 6.5-.9-4.1-2.4-5.6-6.5-6.5 4.1-.9 5.6-2.4 6.5-6.5Z" />
      <path d="M18 16.5c.4 1.7 1 2.3 2.7 2.7-1.7.4-2.3 1-2.7 2.7-.4-1.7-1-2.3-2.7-2.7 1.7-.4 2.3-1 2.7-2.7Z" />
    </Svg>
  );
}

export function EyeIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M2.6 12S6 6 12 6s9.4 6 9.4 6-3.4 6-9.4 6-9.4-6-9.4-6Z" />
      <circle cx="12" cy="12" r="2.6" />
    </Svg>
  );
}

export function ChatIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M20.5 12.5c0 3.9-3.8 7-8.5 7-1 0-2-.1-2.9-.4L4 20.5l1.3-3.8A6.6 6.6 0 0 1 3.5 12.5c0-3.9 3.8-7 8.5-7s8.5 3.1 8.5 7Z" />
    </Svg>
  );
}

export function PaletteIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M12 3.5a8.5 8.5 0 0 0 0 17c1.2 0 1.9-.8 1.9-1.7 0-.5-.2-.9-.5-1.2-.3-.3-.5-.7-.5-1.2 0-.9.8-1.7 1.7-1.7h1.6a4.3 4.3 0 0 0 4.3-4.3c0-3.8-3.8-6.9-8.5-6.9Z" />
      <circle cx="8" cy="10" r="1" fill="currentColor" stroke="none" />
      <circle cx="12" cy="7.7" r="1" fill="currentColor" stroke="none" />
      <circle cx="15.8" cy="10" r="1" fill="currentColor" stroke="none" />
    </Svg>
  );
}

export function PlusIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M12 5v14M5 12h14" />
    </Svg>
  );
}
