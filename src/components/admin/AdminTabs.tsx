'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const TABS = [
  { href: '/admin', label: 'Overview', exact: true },
  { href: '/admin/users', label: 'Users' },
  { href: '/admin/growth', label: 'Growth' },
  { href: '/admin/emails', label: 'Emails' },
  { href: '/admin/engagement', label: 'Engagement' },
  { href: '/admin/feedback', label: 'Feedback' },
  { href: '/admin/content', label: 'Content Editor' },
];

export function AdminTabs() {
  const pathname = usePathname();

  return (
    <div className="mb-8 overflow-x-auto">
      <nav className="flex gap-1 border-b border-border min-w-max">
        {TABS.map((tab) => {
          const active = tab.exact
            ? pathname === tab.href
            : pathname.startsWith(tab.href);
          return (
            <Link
              key={tab.href}
              href={tab.href}
              aria-current={active ? 'page' : undefined}
              className="relative px-4 py-2.5 text-sm font-medium whitespace-nowrap transition-colors"
              style={{
                color: active ? 'var(--color-primary)' : 'var(--color-text-secondary)',
              }}
            >
              {tab.label}
              {active && (
                <span
                  className="absolute left-0 right-0 -bottom-px h-0.5 rounded-full"
                  style={{ background: 'var(--color-primary)' }}
                />
              )}
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
