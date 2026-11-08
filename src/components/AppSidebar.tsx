"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Fragment } from "react";
import {
  PiHouseFill,
  PiDatabaseFill,
  PiShoppingCartFill,
  PiBarcodeLight,
  PiFileTextFill,
  PiStorefrontFill,
  PiFactoryFill,
  PiGearSixFill,
  PiStackFill,
  PiChartLineUpFill,
  PiTruckFill,
  PiPackageFill,
  PiChartBarFill,
  PiCreditCardFill,
  PiSlidersHorizontalFill,
  PiCaretLeftBold,
} from "react-icons/pi";
import { NAV_GROUPS } from "@/lib/nav";
import ThemeToggle from "@/components/ThemeToggle";

const ICONS: Record<string, React.ReactNode> = {
  home:        <PiHouseFill />,
  database:    <PiDatabaseFill />,
  cart:        <PiShoppingCartFill />,
  pos:         <PiBarcodeLight />,
  invoice:     <PiFileTextFill />,
  branch:      <PiStorefrontFill />,
  factory:     <PiFactoryFill />,
  gear:        <PiGearSixFill />,
  layers:      <PiStackFill />,
  cost:        <PiChartLineUpFill />,
  truck:       <PiTruckFill />,
  box:         <PiPackageFill />,
  barchart:    <PiChartBarFill />,
  card:        <PiCreditCardFill />,
  settingsgear:<PiSlidersHorizontalFill />,
};

export default function AppSidebar() {
  const pathname = usePathname();

  return (
    <aside className="erp-sidebar" dir="rtl" aria-label="القائمة الرئيسية">

      {/* ── Logo ── */}
      <div className="erp-sidebar__logo">
        <div className="erp-sidebar__logo-inner">
          <span className="erp-sidebar__brand">
            <span className="erp-sidebar__by">By</span>
            <span className="erp-sidebar__raslan">Raslan</span>
          </span>
          <span className="erp-sidebar__system">ERP System</span>
        </div>
      </div>

      {/* ── Nav ── */}
      <nav className="erp-sidebar__nav">
        {NAV_GROUPS.map(([, items]) =>
          items.map(([label, href, iconKey, hasSubmenu]) => {
            const active =
              href === "/dashboard"
                ? pathname === "/dashboard"
                : pathname === href || pathname.startsWith(href + "/");
            return (
              <Fragment key={`${href}-${label}`}>
                {href === "/settings" && <ThemeToggle />}
                <Link
                  href={href}
                  className={`erp-nav-item${active ? " erp-nav-item--active" : ""}`}
                  aria-current={active ? "page" : undefined}
                >
                  {/* Icon — RIGHT (visual right in RTL) */}
                  <span className="erp-nav-item__icon">
                    {ICONS[iconKey] ?? <PiHouseFill />}
                  </span>

                  {/* Label */}
                  <span className="erp-nav-item__label">{label}</span>

                  {/* Chevron — LEFT (visual left in RTL) */}
                  {hasSubmenu && !active && (
                    <span className="erp-nav-item__chevron">
                      <PiCaretLeftBold />
                    </span>
                  )}
                </Link>
              </Fragment>
            );
          })
        )}
      </nav>

      {/* ── Footer ── */}
      <div className="erp-sidebar__footer">
        <div className="erp-sidebar__version">
          <span className="erp-sidebar__dot" aria-hidden="true" />
          <span className="erp-sidebar__version-text">الإصدار 1.0.0</span>
        </div>
        <div className="erp-sidebar__brand-name">By Raslan Group</div>
        <div className="erp-sidebar__status">
          <span className="erp-sidebar__status-dot" aria-hidden="true" />
          <span>النظام متصل</span>
        </div>
      </div>

    </aside>
  );
}
