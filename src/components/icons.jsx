// Line icons in Falco's hand: 24px grid, round caps, one stroke weight.
// They take `currentColor`, so a muted tab and a blue tab need no second copy.

const svg =
  (d) =>
  ({ className = 'w-5 h-5', strokeWidth = 1.8 }) => (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {d}
    </svg>
  )

export const BookIcon = svg(
  <>
    <path d="M5 4.5A1.5 1.5 0 016.5 3H19v16H6.5A1.5 1.5 0 005 20.5v-16z" />
    <path d="M5 20.5A1.5 1.5 0 006.5 22H19v-3M9 7.5h6M9 11h4" />
  </>,
)
export const ChartIcon = svg(
  <>
    <path d="M4 20h16" />
    <rect x="5.5" y="11" width="3" height="6.5" rx="0.8" />
    <rect x="10.5" y="6.5" width="3" height="11" rx="0.8" />
    <rect x="15.5" y="13.5" width="3" height="4" rx="0.8" />
  </>,
)
export const WalletIcon = svg(
  <>
    <path d="M4 7.5A2.5 2.5 0 016.5 5H18v3" />
    <rect x="4" y="7.5" width="16" height="12" rx="2.5" />
    <path d="M15.5 13.5h1.5" />
  </>,
)
export const DocIcon = svg(
  <>
    <path d="M14 3v5h5" />
    <path d="M14 3H6a2 2 0 00-2 2v14a2 2 0 002 2h12a2 2 0 002-2V8l-6-5z" />
    <path d="M8 13h8M8 17h5" />
  </>,
)
export const MenuIcon = svg(<path d="M4 7h16M4 12h16M4 17h10" />)
export const GridIcon = svg(
  <>
    <rect x="4" y="4" width="6.5" height="6.5" rx="1.5" />
    <rect x="13.5" y="4" width="6.5" height="6.5" rx="1.5" />
    <rect x="4" y="13.5" width="6.5" height="6.5" rx="1.5" />
    <rect x="13.5" y="13.5" width="6.5" height="6.5" rx="1.5" />
  </>,
)
export const MoneyIcon = svg(
  <>
    <rect x="2.5" y="6" width="19" height="12" rx="2" />
    <circle cx="12" cy="12" r="2.6" />
  </>,
)
export const UsersIcon = svg(
  <>
    <circle cx="9" cy="8.5" r="3.2" />
    <path d="M3.5 19.5a5.5 5.5 0 0111 0" />
    <path d="M15.5 5.6a3.2 3.2 0 010 5.8M17 14.2a5.5 5.5 0 013.5 5.3" />
  </>,
)
export const SearchIcon = svg(
  <>
    <circle cx="11" cy="11" r="6.5" />
    <path d="M16 16l4.5 4.5" />
  </>,
)
export const ShieldIcon = svg(
  <>
    <path d="M12 3l7.5 3v5.5c0 4.6-3.2 8-7.5 9.5-4.3-1.5-7.5-4.9-7.5-9.5V6L12 3z" />
    <path d="M9 12l2.2 2.2L15.5 10" />
  </>,
)
export const ClockIcon = svg(
  <>
    <circle cx="12" cy="12" r="8.5" />
    <path d="M12 7.5V12l3 2" />
  </>,
)
export const ListIcon = svg(
  <>
    <path d="M9 6h11M9 12h11M9 18h11" />
    <path d="M3.5 6l1.2 1.2L7 5M3.5 12l1.2 1.2L7 11M3.5 18l1.2 1.2L7 17" />
  </>,
)
export const QrIcon = svg(
  <>
    <rect x="4" y="4" width="6" height="6" rx="1" />
    <rect x="14" y="4" width="6" height="6" rx="1" />
    <rect x="4" y="14" width="6" height="6" rx="1" />
    <path d="M14 14h2.5v2.5H14zM18 18h2v2h-2zM14 19.5h1.5M19.5 14v2" />
  </>,
)
export const CardsIcon = svg(
  <>
    <rect x="3.5" y="6.5" width="13" height="13" rx="2" />
    <path d="M7.5 3.5h11a2 2 0 012 2v11" />
  </>,
)
export const TrendIcon = svg(
  <>
    <path d="M4 19h16" />
    <path d="M5 15l4.5-4.5 3.5 3.5L19 7.5" />
    <path d="M15 7.5h4v4" />
  </>,
)
export const VanIcon = svg(
  <>
    <path d="M3 13l2-6h14l2 6v5h-3M3 18v-5M6 18h12" />
    <circle cx="7.5" cy="18" r="1.6" />
    <circle cx="16.5" cy="18" r="1.6" />
  </>,
)
export const LogoutIcon = svg(
  <>
    <path d="M14.5 4.5H18a2 2 0 012 2v11a2 2 0 01-2 2h-3.5" />
    <path d="M10 8l-4 4 4 4M6 12h10" />
  </>,
)
export const DownloadIcon = svg(
  <>
    <path d="M12 4v11M7.5 10.5L12 15l4.5-4.5" />
    <path d="M5 19.5h14" />
  </>,
)
export const PrinterIcon = svg(
  <>
    <path d="M7 8V3.5h10V8" />
    <rect x="3.5" y="8" width="17" height="8.5" rx="2" />
    <path d="M7 14h10v6.5H7z" />
  </>,
)
export const CopyIcon = svg(
  <>
    <rect x="8" y="8" width="12" height="12" rx="2" />
    <path d="M16 8V6a2 2 0 00-2-2H6a2 2 0 00-2 2v8a2 2 0 002 2h2" />
  </>,
)
export const PencilIcon = svg(<path d="M4 20h4L19 9l-4-4L4 16v4z" />)
export const TrashIcon = svg(
  <>
    <path d="M4.5 7h15M10 11v6M14 11v6" />
    <path d="M6 7l1 12.5A1.5 1.5 0 008.5 21h7a1.5 1.5 0 001.5-1.5L18 7M9.5 7V4.5h5V7" />
  </>,
)
export const CheckIcon = svg(<path d="M20 6L9 17l-5-5" />)
export const ChevronLeft = svg(<path d="M15 18l-6-6 6-6" />)
export const ChevronRight = svg(<path d="M9 18l6-6-6-6" />)
export const ChevronDown = svg(<path d="M6 9l6 6 6-6" />)
export const PlusIcon = svg(<path d="M12 5v14M5 12h14" />)
export const AlertIcon = svg(
  <>
    <path d="M12 3l9.5 17H2.5L12 3z" />
    <path d="M12 10v4M12 17.2v.1" />
  </>,
)
export const InfoIcon = svg(
  <>
    <circle cx="12" cy="12" r="9" />
    <path d="M12 16v-5M12 8.2v.1" />
  </>,
)
export const WhatsAppIcon = svg(
  <path d="M21 11.5a8.4 8.4 0 01-9 8.4 8.6 8.6 0 01-3.9-.9L3 20.5l1.6-4.8A8.4 8.4 0 0112 3.1a8.4 8.4 0 019 8.4z" />,
)
export const SignalOffIcon = svg(
  <>
    <path d="M3 3l18 18" />
    <path d="M8.5 16.5a5 5 0 017 0M5 13a10 10 0 015.2-2.7M14.5 10.6A10 10 0 0119 13M12 20h.01" />
  </>,
)
export const CalendarIcon = svg(
  <>
    <rect x="3" y="5" width="18" height="16" rx="2" />
    <path d="M3 10h18M8 3v4M16 3v4" />
  </>,
)
export const ArrowUpIcon = svg(<path d="M12 19V5M6 11l6-6 6 6" />)
export const ArrowDownIcon = svg(<path d="M12 5v14M6 13l6 6 6-6" />)
