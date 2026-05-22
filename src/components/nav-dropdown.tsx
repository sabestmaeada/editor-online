"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type ReactNode,
} from "react";

export type NavDropdownItem = {
  href: string;
  label: string;
};

type Props = {
  label: ReactNode;
  items: NavDropdownItem[];
};

/**
 * Dropdown menu used in the top nav.
 *
 * Behaviour:
 * - Click the trigger to toggle the menu
 * - Esc / click-outside / clicking an item all close it
 * - Trigger is highlighted when the current pathname matches any sub-item
 *
 * We keep this self-contained (no portal, no headless-ui dependency) — the
 * surface is small enough that vanilla state + a click-outside handler is
 * clearer than pulling in a library.
 */
export function NavDropdown({ label, items }: Props) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const menuId = useId();

  const active = items.some(
    (it) => pathname === it.href || pathname.startsWith(`${it.href}/`),
  );

  // Close on outside click / Esc
  useEffect(() => {
    if (!open) return;

    function onClick(e: MouseEvent) {
      if (!containerRef.current) return;
      if (!containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }

    document.addEventListener("mousedown", onClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const handleItemClick = useCallback(() => setOpen(false), []);

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={menuId}
        onClick={() => setOpen((v) => !v)}
        className={
          "inline-flex items-center gap-1 rounded-md px-3 py-1.5 text-sm font-medium transition-colors " +
          (active || open
            ? "bg-zinc-100 text-zinc-900 dark:bg-zinc-800 dark:text-zinc-100"
            : "text-zinc-600 hover:bg-zinc-50 hover:text-zinc-900 dark:text-zinc-400 dark:hover:bg-zinc-900 dark:hover:text-zinc-100")
        }
      >
        {label}
        <svg
          width="12"
          height="12"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          aria-hidden="true"
          className={
            "transition-transform " + (open ? "rotate-180" : "rotate-0")
          }
        >
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>

      {open && (
        <div
          id={menuId}
          role="menu"
          className="absolute left-0 top-full z-50 mt-1 min-w-48 rounded-md border border-zinc-200 bg-white py-1 shadow-lg dark:border-zinc-800 dark:bg-zinc-950"
        >
          {items.map((item) => {
            const itemActive =
              pathname === item.href || pathname.startsWith(`${item.href}/`);
            return (
              <Link
                key={item.href}
                role="menuitem"
                href={item.href}
                onClick={handleItemClick}
                aria-current={itemActive ? "page" : undefined}
                className={
                  "block px-3 py-1.5 text-sm transition-colors " +
                  (itemActive
                    ? "bg-zinc-100 font-medium text-zinc-900 dark:bg-zinc-800 dark:text-zinc-100"
                    : "text-zinc-700 hover:bg-zinc-50 dark:text-zinc-300 dark:hover:bg-zinc-900")
                }
              >
                {item.label}
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
