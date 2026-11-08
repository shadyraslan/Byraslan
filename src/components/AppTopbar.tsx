"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import {
  PiArrowsInSimple,
  PiArrowsOutSimple,
  PiCalendarBlank,
  PiMagnifyingGlass,
  PiUserCircle,
} from "react-icons/pi";

type NavLink = { href: string; label: string };

export default function AppTopbar({
  name,
  isOwner,
  links,
  signOutAction,
}: {
  name: string;
  isOwner: boolean;
  links: NavLink[];
  signOutAction?: () => Promise<void>;
}) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [now, setNow] = useState<Date | null>(null);
  const [accountOpen, setAccountOpen] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const normalizedQuery = query.trim().toLocaleLowerCase("ar");
  const matches = useMemo(
    () =>
      normalizedQuery
        ? links
            .filter(({ label, href }) =>
              `${label} ${href}`.toLocaleLowerCase("ar").includes(normalizedQuery),
            )
            .slice(0, 6)
        : [],
    [links, normalizedQuery],
  );

  useEffect(() => {
    const updateTime = () => setNow(new Date());
    updateTime();
    const timer = window.setInterval(updateTime, 60_000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    const updateFullscreen = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", updateFullscreen);
    return () => document.removeEventListener("fullscreenchange", updateFullscreen);
  }, []);

  function submitSearch(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (matches[0]) {
      router.push(matches[0].href);
      setQuery("");
    }
  }

  async function toggleFullscreen() {
    try {
      if (document.fullscreenElement) {
        await document.exitFullscreen();
      } else {
        await document.documentElement.requestFullscreen();
      }
    } catch {
      // Fullscreen can be unavailable or denied by the browser.
    }
  }

  const date = now
    ? new Intl.DateTimeFormat("ar-EG", {
        timeZone: "Africa/Cairo",
        weekday: "long",
        day: "numeric",
        month: "long",
        year: "numeric",
      }).format(now)
    : "";
  const time = now
    ? new Intl.DateTimeFormat("ar-EG", {
        timeZone: "Africa/Cairo",
        hour: "numeric",
        minute: "2-digit",
      }).format(now)
    : "";

  return (
    <header className="app-topbar">
      <div className="topbar-account">
        <button
          className="topbar-user"
          type="button"
          aria-expanded={accountOpen}
          aria-label="قائمة حساب المستخدم"
          onClick={() => setAccountOpen((open) => !open)}
        >
          <span className="topbar-avatar"><PiUserCircle aria-hidden /></span>
          <span className="topbar-user-copy">
            <strong>أهلاً، {name}</strong>
            <small><i />{isOwner ? "مدير النظام" : "عضو بالفريق"}</small>
          </span>
        </button>
        {accountOpen && (
          <div className="topbar-account-menu">
            <strong>{name}</strong>
            <span>{isOwner ? "مدير النظام" : "عضو بالفريق"}</span>
            {signOutAction && (
              <form action={signOutAction}>
                <button type="submit">تسجيل الخروج</button>
              </form>
            )}
          </div>
        )}
      </div>

      <form className="topbar-search" role="search" onSubmit={submitSearch}>
        <PiMagnifyingGlass aria-hidden />
        <input
          aria-label="ابحث في أقسام النظام"
          autoComplete="off"
          onChange={(event) => setQuery(event.target.value)}
          placeholder="ابحث في أقسام النظام..."
          value={query}
        />
        {matches.length > 0 && (
          <div className="topbar-search-results">
            {matches.map(({ href, label }) => (
              <Link key={href} href={href} onClick={() => setQuery("")}>
                {label}
              </Link>
            ))}
          </div>
        )}
        {normalizedQuery && matches.length === 0 && (
          <div className="topbar-search-results">مفيش أقسام مطابقة</div>
        )}
      </form>

      <div className="topbar-tools">
        <div className="topbar-date">
          <PiCalendarBlank aria-hidden />
          <span><strong>{date || "..."}</strong><small>{time || " "}</small></span>
        </div>
        <button
          className="topbar-icon-button"
          type="button"
          onClick={() => void toggleFullscreen()}
          aria-label={isFullscreen ? "الخروج من ملء الشاشة" : "ملء الشاشة"}
          title={isFullscreen ? "الخروج من ملء الشاشة" : "ملء الشاشة"}
        >
          {isFullscreen ? <PiArrowsInSimple aria-hidden /> : <PiArrowsOutSimple aria-hidden />}
        </button>
      </div>
    </header>
  );
}
