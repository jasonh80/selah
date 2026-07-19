// Shared navigation config for the bottom nav (mobile) and header nav (desktop).

export type NavItem = {
  href: string;
  label: string;
  icon: (props: { className?: string }) => JSX.Element;
};

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

// IQ-007 (owner direction, board #29 2026-07-18): the prescribed-daily
// framing is retired — no visible Today tab. Selah is choose-what-you-study;
// a chapter page lights up Chapters. ("Continue Reading" joins later, once
// reading history exists.)
export const NAV: NavItem[] = [
  { href: "/chapters", label: "Chapters", icon: BookIcon },
  { href: "/journey", label: "Journey", icon: CompassIcon },
  { href: "/settings", label: "Settings", icon: GearIcon },
];

export function isActive(pathname: string, href: string): boolean {
  if (href === "/chapters") {
    return pathname === "/" || pathname.startsWith("/chapters") || pathname.startsWith("/chapter");
  }
  return pathname.startsWith(href);
}
