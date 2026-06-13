// Shared navigation config for the bottom nav (mobile) and header nav (desktop).

export type NavItem = {
  href: string;
  label: string;
  icon: (props: { className?: string }) => JSX.Element;
};

const SunIcon = ({ className = "" }) => (
  <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden>
    <circle cx="12" cy="12" r="4" stroke="currentColor" strokeWidth="1.6" />
    <path
      d="M12 3v2M12 19v2M3 12h2M19 12h2M5.6 5.6l1.4 1.4M17 17l1.4 1.4M18.4 5.6L17 7M7 17l-1.4 1.4"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
    />
  </svg>
);

const BookIcon = ({ className = "" }) => (
  <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden>
    <path
      d="M4 5.5A1.5 1.5 0 0 1 5.5 4H11v15H5.5A1.5 1.5 0 0 0 4 20.5V5.5ZM20 5.5A1.5 1.5 0 0 0 18.5 4H13v15h5.5a1.5 1.5 0 0 1 1.5 1.5V5.5Z"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinejoin="round"
    />
  </svg>
);

const CompassIcon = ({ className = "" }) => (
  <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden>
    <circle cx="12" cy="12" r="8.5" stroke="currentColor" strokeWidth="1.6" />
    <path d="m15 9-2.2 4.8L8 16l2.2-4.8L15 9Z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
  </svg>
);

const GearIcon = ({ className = "" }) => (
  <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden>
    <circle cx="12" cy="12" r="3" stroke="currentColor" strokeWidth="1.6" />
    <path
      d="M12 3.5v2M12 18.5v2M4.6 7l1.7 1M17.7 16l1.7 1M4.6 17l1.7-1M17.7 8l1.7-1"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
    />
  </svg>
);

export const NAV: NavItem[] = [
  { href: "/today", label: "Today", icon: SunIcon },
  { href: "/chapters", label: "Chapters", icon: BookIcon },
  { href: "/journey", label: "Journey", icon: CompassIcon },
  { href: "/settings", label: "Settings", icon: GearIcon },
];

export function isActive(pathname: string, href: string): boolean {
  if (href === "/today") return pathname === "/" || pathname.startsWith("/today") || pathname.startsWith("/chapter");
  return pathname.startsWith(href);
}
