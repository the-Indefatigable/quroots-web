import { SITE, button, esc, layout, p, row, COLORS } from '@/lib/email';

/**
 * The words of every QuRoots email. Each email has one job and one button; subjects are short
 * and specific, and the preheader finishes the thought the subject starts.
 */

const { GOLD, INK, SOFT, QUIET } = COLORS;
const link = (path: string, campaign: string) => `${SITE}${path}${path.includes('?') ? '&' : '?'}src=email&c=${campaign}`;
const arabic = (html: string, size = 30) => `<p dir="rtl" lang="ar" style="margin:0;font-size:${size}px;line-height:1.9;color:${INK};font-family:'Amiri','Traditional Arabic','Geeza Pro',serif">${html}</p>`;

// ── The Friday email: one ayah, the root inside it ─────────────────────────────────────────────
// Counts are words with this root in the Quranic Arabic Corpus. Translations: Pickthall (public
// domain) or Kanzul Iman, English by Shah Farid-ul-Haque (via AlQuran Cloud), as credited.
export const WEEKLY_VERSES = [
  { subject: 'The root inside “Increase me in knowledge”', ar: 'وَقُل رَّبِّ زِدْنِى عِلْمًۭا', hl: 'عِلْمًۭا', tr: 'And say: My Lord! Increase me in knowledge.', ref: 'Ta-Ha 20:114', credit: 'Pickthall',
    letters: 'ع ل م', meaning: 'to know', count: 854, insight: 'The same root gives <i>ʿālam</i>, “world”, as in “Lord of the worlds” in Al-Fatiha. Ar-Raghib al-Isfahani explained <i>ʿālam</i> as “that by which something is known”: the world is how its Maker is known.' },
  { subject: 'The root inside “With hardship is ease”', ar: 'إِنَّ مَعَ ٱلْعُسْرِ يُسْرًۭا', hl: 'يُسْرًۭا', tr: 'Indeed with hardship is ease.', ref: 'Ash-Sharh 94:6', credit: 'Kanzul Iman',
    letters: 'ي س ر', meaning: 'ease, to be easy', count: 44, insight: 'Allah says it twice in a row, in 94:5 and 94:6. And the word is <i>maʿa</i>, “with”: the ease comes with the hardship.' },
  { subject: 'The root inside “you will be pleased”', ar: 'وَلَسَوْفَ يُعْطِيكَ رَبُّكَ فَتَرْضَىٰٓ', hl: 'فَتَرْضَىٰٓ', tr: 'And indeed your Lord will soon give you so much that you will be pleased.', ref: 'Ad-Duha 93:5', credit: 'Kanzul Iman',
    letters: 'ر ض و', meaning: 'to be pleased, content', count: 73, insight: 'It is the root of <i>riḍā</i>, contentment, and of <i>raḍiya Allāhu ʿanhu</i>, “may Allah be pleased with him”, which you say after the name of every Companion.' },
  { subject: 'The root inside “those who patiently endure”', ar: 'إِنَّ ٱللَّهَ مَعَ ٱلصَّٰبِرِينَ', hl: 'ٱلصَّٰبِرِينَ', tr: 'Indeed Allah is with those who patiently endure.', ref: 'Al-Baqarah 2:153', credit: 'Kanzul Iman',
    letters: 'ص ب ر', meaning: 'to be patient, to endure', count: 103, insight: 'The same ayah begins by telling the believers to seek help through <i>ṣabr</i> and <i>ṣalāh</i>: patience and prayer, side by side.' },
  { subject: 'The root inside “my Lord is Close”', ar: 'إِنَّ رَبِّى قَرِيبٌۭ مُّجِيبٌۭ', hl: 'قَرِيبٌۭ', tr: 'Indeed my Lord is Close, Acceptor of Prayer.', ref: 'Hud 11:61', credit: 'Kanzul Iman',
    letters: 'ق ر ب', meaning: 'to be near', count: 96, insight: 'The same root gives <i>aqrab</i>, “closer”, in 50:16: Allah is closer to us than our jugular vein.' },
  { subject: 'The root inside “remember Me, I will remember you”', ar: 'فَٱذْكُرُونِىٓ أَذْكُرْكُمْ', hl: 'فَٱذْكُرُونِىٓ', tr: 'Therefore remember Me, I will remember you.', ref: 'Al-Baqarah 2:152', credit: 'Pickthall',
    letters: 'ذ ك ر', meaning: 'to remember, to mention', count: 292, insight: '<i>Adh-Dhikr</i>, “the Reminder”, is also one of the names the Quran gives itself (15:9). Every time you read it, you are doing <i>dhikr</i>.' },
  { subject: 'The root inside “My mercy encompasses all things”', ar: 'وَرَحْمَتِى وَسِعَتْ كُلَّ شَىْءٍۢ', hl: 'وَرَحْمَتِى', tr: 'And My mercy encompasses all things.', ref: 'Al-A‘raf 7:156', credit: 'Kanzul Iman',
    letters: 'ر ح م', meaning: 'to have mercy', count: 339, insight: 'You say this root in every rakʿah: <i>ar-Raḥmān</i> and <i>ar-Raḥīm</i> in Al-Fatiha. The same three letters give <i>raḥim</i>, the womb.' },
  { subject: 'Why the heart is called qalb', ar: 'أَلَا بِذِكْرِ ٱللَّهِ تَطْمَئِنُّ ٱلْقُلُوبُ', hl: 'ٱلْقُلُوبُ', tr: 'Verily in the remembrance of Allah do hearts find rest!', ref: 'Ar-Ra‘d 13:28', credit: 'Pickthall',
    letters: 'ق ل ب', meaning: 'to turn', count: 168, insight: 'The heart, <i>qalb</i>, comes from <i>qalaba</i>, “to turn”. That is why the Prophet ﷺ often prayed, <i>“Yā muqallib al-qulūb”</i>: O Turner of hearts, keep my heart firm on Your religion.' },
] as const;
export type WeeklyVerse = (typeof WEEKLY_VERSES)[number];

export type PathProgress = { day: number; title: string; pct: number; paid: boolean } | null;

export function weeklyEmail(o: { firstName: string; verse: WeeklyVerse; progress: PathProgress; next: { day: number; title: string } | null; token: string }) {
  const { firstName, verse: v, progress, next, token } = o;
  const verseHtml = esc(v.ar).replace(esc(v.hl), `<span style="color:${GOLD}">${esc(v.hl)}</span>`);
  const salah = progress && next
    ? row(`<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#11100E;border-radius:14px"><tr><td style="padding:20px 22px">
        ${p(`<b style="color:${INK}">Your salah:</b> you understand ${progress.pct}% of the root words you pray with. Next is day ${next.day}: ${esc(next.title)}.`, 15)}
        ${button(link(`/salah/${next.day}`, 'weekly'), `Open day ${next.day}`)}</td></tr></table>`, '8px 30px 6px')
    : row(`<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#11100E;border-radius:14px"><tr><td style="padding:20px 22px">
        ${p(`<b style="color:${INK}">Words like this are in every prayer you pray.</b> Learn the roots of Al-Fatiha and the short surahs, two or three a day, and in 30 days you understand every word. The first week is free.`, 15)}
        ${button(link('/salah', 'weekly'), 'Start day 1, free')}</td></tr></table>`, '8px 30px 6px');
  const body = [
    row(p(`Salaam ${esc(firstName)},`, 16, INK), '22px 30px 0'),
    row(`<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#11100E;border:1px solid rgba(212,162,70,0.22);border-radius:14px"><tr><td style="padding:22px;text-align:center">
        ${arabic(verseHtml, 30)}
        <p style="margin:10px 0 4px;font-size:16px;font-style:italic;line-height:1.5;color:${INK}">“${esc(v.tr)}”</p>
        <p style="margin:0;font-size:12px;color:${QUIET};font-family:-apple-system,'Segoe UI',Helvetica,Arial,sans-serif">${esc(v.ref)}</p></td></tr></table>`, '8px 30px 0'),
    row(`${p(`The gold word grows from the root <span dir="rtl" lang="ar" style="color:${GOLD};font-size:20px">${v.letters}</span>, <i>${esc(v.meaning)}</i>. It appears <b style="color:${INK}">${v.count}</b> times in the Quran.`)}${p(v.insight)}`, '22px 30px 0'),
    salah,
  ].join('');
  return {
    subject: v.subject,
    html: layout({ preheader: `${v.count} words in the Quran grow from these three letters. One of them you already know.`, body, list: 'weekly', token, credit: `Translation: ${v.credit === 'Pickthall' ? 'Marmaduke Pickthall' : 'Kanzul Iman, English by Shah Farid-ul-Haque'}.` }),
  };
}

// ── Lesson reminders ───────────────────────────────────────────────────────────────────────────

export function dayReminder(o: { firstName: string; day: number; title: string; pctNow: number; line: { ar: string; en: string } | null; token: string }) {
  const { firstName, day, title, pctNow, line, token } = o;
  const body = [
    row(p(`Salaam ${esc(firstName)},`, 16, INK), '22px 30px 0'),
    row(p(`You understand <b style="color:${INK}">${pctNow}%</b> of the root words in your salah. Today&rsquo;s lesson takes a few minutes, and you&rsquo;ll hear it the next time you pray.`), '4px 30px 0'),
    line ? row(`<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#11100E;border:1px solid rgba(212,162,70,0.22);border-radius:14px"><tr><td style="padding:20px 22px;text-align:center">
        <p style="margin:0 0 8px;font-size:12px;letter-spacing:2px;text-transform:uppercase;color:${GOLD};font-family:-apple-system,'Segoe UI',Helvetica,Arial,sans-serif">Day ${day} · ${esc(title)}</p>
        ${arabic(esc(line.ar), 28)}
        <p style="margin:8px 0 0;font-size:14px;line-height:1.5;color:${SOFT}">${esc(line.en)}</p></td></tr></table>`, '8px 30px 0') : '',
    row(`<div style="text-align:center;padding:22px 0 6px">${button(link(`/salah/${day}`, 'reminder'), `Open day ${day}`)}</div>`, '0 30px 8px'),
  ].join('');
  return { subject: `Day ${day}: ${title}`, html: layout({ preheader: 'A few minutes today, and you will understand it the next time you pray.', body, list: 'reminders', token }) };
}

export function pathOfferReminder(o: { firstName: string; pctNow: number; priceCents: number; token: string; finishedFatiha: boolean }) {
  const { firstName, pctNow, priceCents, token, finishedFatiha } = o;
  const price = `$${Math.round(priceCents / 100)}`;
  const body = [
    row(p(`Salaam ${esc(firstName)},`, 16, INK), '22px 30px 0'),
    row(p(finishedFatiha
      ? `Mashallah. You finished every word of Al-Fatiha: that&rsquo;s <b style="color:${INK}">${pctNow}%</b> of the root words you say in prayer.`
      : `You understand <b style="color:${INK}">${pctNow}%</b> of the root words you say in prayer.`), '4px 30px 0'),
    row(p('The next 23 days take you to 100%: Al-Ikhlas, Al-Falaq, An-Nas, Al-Kawthar, Al-Asr and the other short surahs you pray with, word by word.'), '0 30px 0'),
    row(`<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#11100E;border:1px solid rgba(212,162,70,0.22);border-radius:14px"><tr><td style="padding:20px 22px;text-align:center">
        <p style="margin:0 0 8px;font-size:12px;letter-spacing:2px;text-transform:uppercase;color:${GOLD};font-family:-apple-system,'Segoe UI',Helvetica,Arial,sans-serif">Day 8 opens with Al-Ikhlas</p>
        ${arabic('قُلْ هُوَ ٱللَّهُ أَحَدٌ', 30)}
        <p style="margin:8px 0 0;font-size:14px;color:${SOFT}">Say · He · is Allah · the One</p></td></tr></table>`, '8px 30px 0'),
    row(`<div style="text-align:center;padding:24px 0 4px">${button(link('/salah/8', 'offer'), 'Continue to day 8')}</div>
      <p style="margin:12px 0 0;text-align:center;font-size:14px;line-height:1.6;color:${SOFT}">${price} once, yours for life. 14-day full refund.</p>
      <p style="margin:14px 0 0;text-align:center;font-size:14px;line-height:1.6;color:${QUIET}">Can&rsquo;t afford it right now? Reply to this email and we&rsquo;ll give you a place for free.</p>`, '0 30px 10px'),
  ].join('');
  return {
    subject: finishedFatiha ? 'You understand Al-Fatiha. What comes next?' : 'The rest of your salah is waiting',
    html: layout({ preheader: 'Day 8 opens with Al-Ikhlas: Say, He is Allah, One.', body, list: 'reminders', token }),
  };
}

export function streakReminder(o: { firstName: string; streak: number; token: string }) {
  const { firstName, streak, token } = o;
  const body = [
    row(p(`Salaam ${esc(firstName)},`, 16, INK), '22px 30px 0'),
    row(p(`Your ${streak}-day streak ends at midnight. One short lesson keeps it going.`), '4px 30px 0'),
    row(p(`The Prophet ﷺ said the deeds most beloved to Allah are the most consistent ones, even if small. <span style="color:${QUIET}">(Bukhari, Muslim)</span>`, 15), '0 30px 0'),
    row(`<div style="text-align:center;padding:16px 0 8px">${button(link('/learn/path', 'streak'), 'Keep my streak')}</div>`, '0 30px 10px'),
  ].join('');
  return { subject: `Your ${streak}-day streak ends tonight`, html: layout({ preheader: 'One short lesson keeps it going.', body, list: 'reminders', token }) };
}

// ── Confirming reminders (double opt-in) ────────────────────────────────────────────────────────
// Sent once, when someone asks for reminders at the end of a lesson. Nothing else is sent until
// they tap the button, which also proves the address is theirs.

export function confirmReminders(o: { day: number; pct: number; nextTitle: string | null; confirmUrl: string; token: string }) {
  const { day, pct, nextTitle, confirmUrl, token } = o;
  const body = [
    row(p('Salaam,', 16, INK), '22px 30px 0'),
    row(p(`You finished day ${day}. You now understand <b style="color:${INK}">${pct}%</b> of the root words in your salah.`), '4px 30px 0'),
    row(p(nextTitle ? `Tap below and we&rsquo;ll email you when day ${day + 1} is ready: <b style="color:${INK}">${esc(nextTitle)}</b>.` : 'Tap below to get lesson reminders.'), '0 30px 0'),
    row(`<div style="text-align:center;padding:16px 0 8px">${button(confirmUrl, 'Yes, remind me')}</div>
      <p style="margin:12px 0 0;text-align:center;font-size:13px;line-height:1.6;color:${QUIET}">Never more than one email a day. If you didn&rsquo;t ask for this, ignore it and you won&rsquo;t hear from us.</p>`, '0 30px 12px'),
  ].join('');
  return {
    subject: nextTitle ? `Confirm, and day ${day + 1} comes to you` : 'Confirm your QuRoots reminders',
    html: layout({ preheader: `You understand ${pct}% of your salah. One tap to keep going.`, body, list: 'reminders', token, reason: 'You&rsquo;re getting this one email because someone asked for QuRoots lesson reminders with this address.' }),
  };
}

// ── Joining the email list from the website (double opt-in) ──────────────────────────────────────
// Sent once, when someone types their email into the "get updates" box. Nothing else goes out
// until they tap the button, which also proves the address is theirs.

export function confirmWeekly(o: { confirmUrl: string; token: string }) {
  const { confirmUrl, token } = o;
  const body = [
    row(p('Salaam,', 16, INK), '22px 30px 0'),
    row(p('Someone (hopefully you) asked to get emails from QuRoots: one ayah and the root inside it each Friday, plus news like the free Ramadan paths when they open.'), '4px 30px 0'),
    row(`<div style="text-align:center;padding:16px 0 8px">${button(confirmUrl, 'Yes, send me QuRoots emails')}</div>
      <p style="margin:12px 0 0;text-align:center;font-size:13px;line-height:1.6;color:${QUIET}">If you didn&rsquo;t ask for this, ignore it and you won&rsquo;t hear from us.</p>`, '0 30px 12px'),
  ].join('');
  return {
    subject: 'Confirm your QuRoots emails',
    html: layout({ preheader: 'One tap to confirm. Nothing is sent until you do.', body, list: 'weekly', token, reason: 'You&rsquo;re getting this one email because someone asked for QuRoots emails with this address.' }),
  };
}

// ── A note from the founder, sent by hand from /admin/emails to people who said yes ──────────────
// `text` is plain text from the admin form: blank lines make paragraphs, a line that is only a
// URL becomes the button. Everything is escaped, so nothing typed there can inject HTML.

export function broadcast(o: { firstName: string; text: string; token: string; preheader?: string }) {
  const { firstName, text, token, preheader } = o;
  const blocks = text.replace(/\r/g, '').split(/\n{2,}/).map((b) => b.trim()).filter(Boolean);
  const body = [
    row(p(`Salaam ${esc(firstName)},`, 16, INK), '22px 30px 0'),
    ...blocks.map((b) => /^https:\/\/\S+$/.test(b)
      ? row(`<div style="text-align:center;padding:10px 0 6px">${button(esc(b), 'Open QuRoots')}</div>`, '0 30px 0')
      : row(p(esc(b).replace(/\n/g, '<br>')), '4px 30px 0')),
    row(p('Alam<br><span style="color:' + QUIET + ';font-size:14px">Founder, QuRoots</span>', 16, INK), '8px 30px 14px'),
  ].join('');
  return { html: layout({ preheader: preheader ?? blocks[0]?.slice(0, 90) ?? '', body, list: 'weekly', token }) };
}

// ── Gifts ────────────────────────────────────────────────────────────────────────────────────────

export function giftReady(o: { kind: 'gift' | 'sponsor'; url: string; code: string }) {
  const { kind, url, code } = o;
  const body = kind === 'gift' ? [
    row(p('Salaam,', 16, INK), '22px 30px 0'),
    row(p('JazakAllahu khayran. Your gift is ready: the full 30-day path to understanding every word of salah, for whoever you send this link to.'), '4px 30px 0'),
    row(`<div style="text-align:center;padding:14px 0 6px">${button(url, 'Open the gift link')}</div>
      <p style="margin:12px 0 0;text-align:center;font-size:14px;line-height:1.6;color:${SOFT}">Send them this link: <a href="${url}" style="color:${GOLD}">${esc(url.replace('https://', ''))}</a></p>
      <p style="margin:8px 0 0;text-align:center;font-size:13px;color:${QUIET}">Gift code ${esc(code)} · works once, for one person</p>`, '0 30px 6px'),
    row(p('The Prophet ﷺ said: “Whoever guides someone to goodness will have a reward like the one who does it.” (Muslim)', 15), '14px 30px 4px'),
  ] : [
    row(p('Salaam,', 16, INK), '22px 30px 0'),
    row(p('JazakAllahu khayran. You have paid for a free place on the salah path. The next person who writes to us saying they can&rsquo;t afford it will get your place, and every word of their salah.'), '4px 30px 0'),
    row(p('The Prophet ﷺ said: “Whoever guides someone to goodness will have a reward like the one who does it.” (Muslim)', 15), '0 30px 4px'),
    row(`<p style="margin:6px 0 0;font-size:13px;color:${QUIET}">Place code ${esc(code)}</p>`, '0 30px 6px'),
  ];
  return {
    subject: kind === 'gift' ? 'Your gift is ready to send' : 'You’ve given someone their salah',
    html: layout({ preheader: kind === 'gift' ? 'One link, all 30 days, for whoever you send it to.' : 'A free place for someone who can’t afford it.', body: body.join(''), list: 'reminders',
      reason: 'You&rsquo;re getting this because you bought this on QuRoots. Stripe sends your receipt separately.' }),
  };
}
