import Link from 'next/link';
import { EmailSignup } from '@/components/ui/EmailSignup';

export const ACCURACY_NOTICE =
  'QuRoots is a learning aid, made with care by people and tools that can make mistakes. Meanings, root data and our videos may contain errors, and they are not a fatwa or a tafsir. For religious guidance, ask a qualified scholar.';

/** The footer on every page: what QuRoots is and isn't, how to report a mistake, and the legal pages. */
export function SiteFooter() {
  return (
    <footer className="mt-20 pt-8 pb-4 border-t border-white/5 text-[13px] leading-relaxed text-text-tertiary">
      <div className="mb-8"><EmailSignup source="footer" /></div>
      <p className="max-w-2xl">
        {ACCURACY_NOTICE} Spotted a mistake? Tell us at{' '}
        <a href="mailto:salam@quroots.com" className="underline underline-offset-2 hover:text-text">salam@quroots.com</a> and we&rsquo;ll fix it.
      </p>
      <nav className="flex flex-wrap gap-x-5 mt-2">
        <Link href="/sources" className="inline-block py-3 hover:text-text">Sources &amp; credits</Link>
        <Link href="/terms" className="inline-block py-3 hover:text-text">Terms</Link>
        <Link href="/privacy" className="inline-block py-3 hover:text-text">Privacy</Link>
        <Link href="/support" className="inline-block py-3 hover:text-text">Support QuRoots</Link>
      </nav>
    </footer>
  );
}
