import type { MetadataRoute } from 'next';
import { db, dbQuery } from '@/db';
import { roots, surahs } from '@/db/schema';
import { asc } from 'drizzle-orm';

export const dynamic = 'force-dynamic';

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const baseUrl = 'https://quroots.com';

  const now = new Date();

  // Static pages
  const staticPages: MetadataRoute.Sitemap = [
    { url: baseUrl, lastModified: now, changeFrequency: 'weekly', priority: 1.0 },
    { url: `${baseUrl}/salah`, lastModified: now, changeFrequency: 'weekly', priority: 0.95 },
    { url: `${baseUrl}/ramadan`, lastModified: now, changeFrequency: 'weekly', priority: 0.9 },
    { url: `${baseUrl}/juz-amma`, lastModified: now, changeFrequency: 'weekly', priority: 0.85 },
    { url: `${baseUrl}/quran`, lastModified: now, changeFrequency: 'monthly', priority: 0.9 },
    { url: `${baseUrl}/roots`, lastModified: now, changeFrequency: 'monthly', priority: 0.9 },
    { url: `${baseUrl}/learn`, lastModified: now, changeFrequency: 'weekly', priority: 0.9 },
    { url: `${baseUrl}/learn/path`, lastModified: now, changeFrequency: 'weekly', priority: 0.9 },
    { url: `${baseUrl}/verbs`, lastModified: now, changeFrequency: 'weekly', priority: 0.85 },
    { url: `${baseUrl}/words`, lastModified: now, changeFrequency: 'weekly', priority: 0.85 },
    { url: `${baseUrl}/blog`, lastModified: now, changeFrequency: 'weekly', priority: 0.9 },
    { url: `${baseUrl}/support`, lastModified: now, changeFrequency: 'monthly', priority: 0.5 },
    { url: `${baseUrl}/daily`, lastModified: now, changeFrequency: 'daily', priority: 0.8 },
    { url: `${baseUrl}/leaderboard`, lastModified: now, changeFrequency: 'daily', priority: 0.6 },
    { url: `${baseUrl}/achievements`, lastModified: now, changeFrequency: 'weekly', priority: 0.5 },
    { url: `${baseUrl}/community`, lastModified: now, changeFrequency: 'daily', priority: 0.5 },
    { url: `${baseUrl}/search`, lastModified: now, changeFrequency: 'monthly', priority: 0.6 },
    { url: `${baseUrl}/privacy`, lastModified: now, changeFrequency: 'yearly', priority: 0.3 },
    { url: `${baseUrl}/terms`, lastModified: now, changeFrequency: 'yearly', priority: 0.3 },
    { url: `${baseUrl}/sources`, lastModified: now, changeFrequency: 'yearly', priority: 0.3 },
    { url: `${baseUrl}/gift`, lastModified: now, changeFrequency: 'monthly', priority: 0.6 },
  ];

  // Blog articles (formerly /learn/*)
  const learnPages: MetadataRoute.Sitemap = [
    'qasida-burda',
    // Was missing from the sitemap despite being published on /blog.
    'quranic-duas',
    'daily-arabic-words',
    'beginner-arabic-islamic-books',
    'irab',
    'mufrad-muthanna-jam',
    'murakkab',
    'adad',
    'verb-forms',
    'arifa-vs-alima-vs-fahima',
    'verb-forms-meaning-change',
    'classical-arabic-rebukes',
  ].map((slug) => ({
    url: `${baseUrl}/blog/${slug}`,
    lastModified: now,
    changeFrequency: 'monthly' as const,
    priority: 0.85,
  }));

  // All 114 surahs
  const allSurahs = await dbQuery(() =>
    db.select({ number: surahs.number }).from(surahs).orderBy(asc(surahs.number))
  );

  const surahPages: MetadataRoute.Sitemap = allSurahs.map((s) => ({
    url: `${baseUrl}/quran/${s.number}`,
    lastModified: now,
    changeFrequency: 'monthly' as const,
    priority: 0.8,
  }));

  // All roots
  const allRoots = await dbQuery(() =>
    db.select({ root: roots.root }).from(roots).orderBy(asc(roots.id))
  );

  const rootPages: MetadataRoute.Sitemap = allRoots.map((r) => ({
    url: `${baseUrl}/roots/${encodeURIComponent(r.root)}`,
    lastModified: now,
    changeFrequency: 'monthly' as const,
    priority: 0.7,
  }));

  return [...staticPages, ...learnPages, ...surahPages, ...rootPages];
}
