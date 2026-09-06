"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";

import { Menu, X } from "@/lib/icons";
import { navItems, segments } from "@/app/home/site-data";
import styles from "@/app/home/marketing.module.css";

/**
 * The small-screen navigation. The desktop nav is a server component; this only
 * takes over below the breakpoint where `.navLinks` is hidden.
 */
export function MobileNav() {
  const [open, setOpen] = useState(false);
  const close = () => setOpen(false);

  // A fixed, full-height panel over a page that still scrolls is disorienting.
  useEffect(() => {
    if (!open) return;

    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      document.body.style.overflow = previous;
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open]);

  const drawer = (
    <div id="marketing-mobile-nav" className={styles.navDrawer}>
      <nav className={styles.navDrawerInner} aria-label="Site navigation">
        {navItems.map((item) => (
          <Link key={item.href} href={item.href} className={styles.navDrawerLink} onClick={close}>
            {item.label}
          </Link>
        ))}

        <div className={styles.navDrawerGroup}>
          <p>By business type</p>
          {segments.map((segment) => (
            <Link
              key={segment.slug}
              href={`/home/solutions/${segment.slug}`}
              className={styles.navDrawerSub}
              onClick={close}
            >
              {segment.title}
            </Link>
          ))}
        </div>

        <div className={styles.navDrawerActions}>
          <Link
            href="/home/book-demo"
            className={`${styles.button} ${styles.buttonPrimary}`}
            onClick={close}
          >
            Find your setup
          </Link>
          <Link href="/login" className={styles.button} onClick={close}>
            Sign in
          </Link>
        </div>
      </nav>
    </div>
  );

  return (
    <>
      <button
        type="button"
        className={`${styles.navTrigger} ${styles.navToggle}`}
        aria-expanded={open}
        aria-controls="marketing-mobile-nav"
        aria-label={open ? "Close menu" : "Open menu"}
        onClick={() => setOpen((value) => !value)}
      >
        {open ? (
          <X className={styles.icon} weight="regular" />
        ) : (
          <Menu className={styles.icon} weight="regular" />
        )}
        {open ? "Close" : "Menu"}
      </button>

      {/* Portalled to <body>: the sticky header carries a `backdrop-filter`, and a
          filtered ancestor becomes the containing block for its fixed-position
          descendants, which would collapse the panel to the header's own height.
          Safe to read `document` here — `open` only turns true from a click. */}
      {open ? createPortal(drawer, document.body) : null}
    </>
  );
}
