import {
  CalendarDays,
  Clock,
  Code2,
  FileClock,
  KeyRound,
  LayoutList,
  Puzzle,
  UserRound,
  Users,
  Webhook,
} from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { CollisionDemo } from '@/components/landing/collision-demo';
import { Logo } from '@/components/logo';
import { isPublicDemo } from '@/lib/demo';

export const metadata: Metadata = {
  title: { absolute: 'Slotwise: appointment booking that can’t double-book' },
};

/** Public source repo. Forks can point this at their own copy. */
const REPO_URL = process.env.NEXT_PUBLIC_REPO_URL ?? 'https://github.com/ToukirOfficial/slotwise';

function GitHubIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 16 16" aria-hidden className={className} fill="currentColor">
      <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.01 8.01 0 0 0 16 8c0-4.42-3.58-8-8-8Z" />
    </svg>
  );
}

const btn =
  'inline-flex h-10 items-center justify-center gap-2 rounded-md px-4 text-sm font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2';
const btnPrimary = `${btn} bg-primary text-primary-foreground hover:bg-[#1d46c4]`;
const btnQuiet = `${btn} border border-input bg-card text-foreground hover:bg-muted`;

/** On the public demo there's no sign-up: the call to action opens the demo clinic instead. */
const signupCta = (publicDemo: boolean) =>
  publicDemo ? { href: '/login?demo=1', label: 'Try the live demo' } : { href: '/signup', label: 'Create an account' };

function Header({ publicDemo }: { publicDemo: boolean }) {
  const cta = signupCta(publicDemo);
  return (
    <header className="sticky top-0 z-30 border-b border-border/70 bg-background/85 backdrop-blur">
      <div className="mx-auto flex h-14 max-w-6xl items-center gap-6 px-4 sm:px-6">
        <Link href="/" aria-label="Slotwise home">
          <Logo />
        </Link>
        <nav aria-label="Sections" className="hidden items-center gap-5 text-sm text-muted-foreground md:flex">
          <a href="#how" className="hover:text-foreground">How it works</a>
          <a href="#dashboard" className="hover:text-foreground">Dashboard</a>
          <a href="#developers" className="hover:text-foreground">Developers</a>
          <a href="#self-host" className="hover:text-foreground">Self-host</a>
        </nav>
        <div className="ml-auto flex items-center gap-2">
          <a href={REPO_URL} className="hidden items-center gap-1.5 rounded-md px-2.5 py-1.5 text-sm text-muted-foreground hover:text-foreground sm:inline-flex">
            <GitHubIcon className="size-4" /> GitHub
          </a>
          <Link href="/login" className="rounded-md px-2.5 py-1.5 text-sm text-muted-foreground hover:text-foreground">
            Log in
          </Link>
          <Link href={cta.href} className={`${btnPrimary} h-8 px-3`}>
            {cta.label}
          </Link>
        </div>
      </div>
    </header>
  );
}

function Hero() {
  return (
    <section className="relative overflow-hidden border-b">
      <div className="diary-ruling pointer-events-none absolute inset-0 opacity-50 [mask-image:linear-gradient(to_bottom,black,transparent_85%)]" />
      <div className="relative mx-auto grid max-w-6xl items-center gap-10 px-4 py-14 sm:px-6 md:py-20 lg:grid-cols-[1fr_1.05fr]">
        <div>
          <p className="mb-4 inline-flex items-center gap-2 rounded-full border bg-card px-3 py-1 text-[13px] text-muted-foreground">
            <span className="size-1.5 rounded-full bg-primary" aria-hidden /> Open source, MIT licensed
          </p>
          <h1 className="text-[2.6rem] leading-[1.05] font-semibold tracking-[-0.035em] sm:text-[3.4rem]">
            Appointment booking that can’t double-book.
          </h1>
          <p className="mt-5 max-w-[34rem] text-[17px] leading-relaxed text-muted-foreground">
            Slotwise is a booking engine for UK clinics, solicitors, tutors and driving instructors. Add one tag to your
            website. Customers pick a time, the database refuses any clash, and every confirmation email arrives.
          </p>
          <div className="mt-7 flex flex-wrap gap-3">
            <Link href="/login?demo=1" className={btnPrimary}>
              Open the demo clinic
            </Link>
            <Link href="/b/demo-physio" className={btnQuiet}>
              Book as a customer
            </Link>
          </div>
          <p className="mt-4 text-[13px] text-muted-foreground">
            The demo resets every night and never sends email.
          </p>
        </div>
        <CollisionDemo />
      </div>
    </section>
  );
}

const GUARANTEES = [
  {
    title: 'No double-bookings',
    body: 'PostgreSQL refuses overlapping appointments with an exclusion constraint, so a clash can’t slip past app code.',
    proof: '100 parallel requests give one 201 and 99 × 409',
  },
  {
    title: 'Right across clock changes',
    body: 'Hours are planned in UK wall-clock time and stored as instants. A 9:00 appointment stays at 9:00 in March and October.',
    proof: 'All four 2026–2027 clock changes are tested',
  },
  {
    title: 'Emails that always arrive',
    body: 'Each booking change writes an outbox event in the same transaction. A worker sends it, retries it and never sends it twice.',
    proof: 'Survives a crash on either side of the commit',
  },
];

function Guarantees() {
  return (
    <section aria-labelledby="guarantees" className="border-b bg-card">
      <h2 id="guarantees" className="sr-only">What Slotwise guarantees</h2>
      <div className="mx-auto grid max-w-6xl divide-y px-4 sm:px-6 md:grid-cols-3 md:divide-x md:divide-y-0">
        {GUARANTEES.map((g) => (
          <div key={g.title} className="py-8 md:px-6 md:first:pl-0 md:last:pr-0">
            <h3 className="font-semibold tracking-tight">{g.title}</h3>
            <p className="mt-2 text-[15px] leading-relaxed text-muted-foreground">{g.body}</p>
            <p className="mt-4 border-l-2 border-primary pl-3 text-[13px] text-foreground">{g.proof}</p>
          </div>
        ))}
      </div>
    </section>
  );
}

function HourRow({ label, state, note }: { label: string; state: 'normal' | 'gap' | 'twice' | 'slot'; note?: string }) {
  return (
    <div className="grid grid-cols-[4.5rem_1fr] items-stretch text-[13px]">
      <span className="py-2 pr-3 text-right font-mono tabular-nums text-muted-foreground">{label}</span>
      <span
        className={[
          'flex items-center border-l px-3 py-2',
          state === 'gap' && 'hatch text-muted-foreground',
          state === 'twice' && 'bg-accent text-accent-foreground',
          state === 'slot' && 'bg-primary font-medium text-primary-foreground',
        ]
          .filter(Boolean)
          .join(' ')}
      >
        {note}
      </span>
    </div>
  );
}

function ClockChanges() {
  return (
    <section className="border-b">
      <div className="mx-auto grid max-w-6xl gap-10 px-4 py-16 sm:px-6 lg:grid-cols-[0.9fr_1.1fr]">
        <div className="max-w-md">
          <h2 className="text-3xl font-semibold tracking-[-0.025em]">Clocks change twice a year. Appointments don’t move.</h2>
          <p className="mt-4 leading-relaxed text-muted-foreground">
            On the last Sunday in March, 01:00 to 01:59 never happens. In October it happens twice. Most booking tools
            quietly shift appointments by an hour or offer times that don’t exist.
          </p>
          <p className="mt-3 leading-relaxed text-muted-foreground">
            Slotwise keeps working hours as UK wall-clock minutes and bookings as exact instants, and converts between
            them with the Temporal API. Durations are real elapsed time, and the dashboard always says “UK time”.
          </p>
        </div>
        <div className="grid items-start gap-4 sm:grid-cols-2">
          <div className="overflow-hidden rounded-lg border bg-card">
            <p className="border-b px-4 py-2.5 text-sm font-medium">Sun 29 Mar 2026</p>
            <HourRow label="00:00" state="normal" />
            <HourRow label="01:00" state="gap" note="Doesn’t exist, no slots" />
            <HourRow label="02:00" state="normal" note="Clocks jump to BST" />
            <HourRow label="09:00" state="slot" note="09:00 local, 08:00 UTC" />
          </div>
          <div className="overflow-hidden rounded-lg border bg-card">
            <p className="border-b px-4 py-2.5 text-sm font-medium">Sun 25 Oct 2026</p>
            <HourRow label="00:00" state="normal" />
            <HourRow label="01:00" state="twice" note="Happens twice, offered once" />
            <HourRow label="02:00" state="normal" note="Back on GMT" />
            <HourRow label="09:00" state="slot" note="09:00 local, 09:00 UTC" />
          </div>
        </div>
      </div>
    </section>
  );
}

function WidgetPreview() {
  const times = ['09:00', '09:45', '10:30', '11:15', '14:00', '14:45'];
  return (
    <div aria-hidden className="rounded-lg border bg-card p-4 text-sm shadow-[0_16px_40px_-24px_rgba(21,24,29,0.35)]">
      <p className="font-semibold">Demo Physio Clinic</p>
      <p className="text-[13px] text-muted-foreground">Initial assessment, 45 min, £65</p>
      <div className="mt-4 grid grid-cols-5 gap-1.5 text-center text-[12px]">
        {['Mon 2', 'Tue 3', 'Wed 4', 'Thu 5', 'Fri 6'].map((d, i) => (
          <span key={d} className={`rounded-md border py-1.5 ${i === 1 ? 'border-primary bg-accent font-medium text-accent-foreground' : ''}`}>
            {d}
          </span>
        ))}
      </div>
      <div className="mt-3 grid grid-cols-3 gap-1.5">
        {times.map((t, i) => (
          <span
            key={t}
            className={`rounded-md border py-1.5 text-center font-mono text-[12px] tabular-nums ${i === 2 ? 'border-primary bg-primary text-primary-foreground' : ''}`}
          >
            {t}
          </span>
        ))}
      </div>
      <div className="mt-4 rounded-md bg-primary py-2 text-center text-[13px] font-medium text-primary-foreground">
        Book Tue 3 Nov at 10:30
      </div>
      <p className="mt-2 text-center text-[12px] text-muted-foreground">Times shown in UK time</p>
    </div>
  );
}

function Embed() {
  return (
    <section id="how" className="scroll-mt-16 border-b bg-card">
      <div className="mx-auto grid max-w-6xl items-center gap-10 px-4 py-16 sm:px-6 lg:grid-cols-2">
        <div>
          <h2 className="text-3xl font-semibold tracking-[-0.025em]">Two lines on any website.</h2>
          <p className="mt-4 max-w-lg leading-relaxed text-muted-foreground">
            WordPress, Laravel, Squarespace or plain HTML. The widget is a Web Component in its own Shadow DOM, so your
            site’s CSS can’t break it. It’s about 5 KB gzipped, matches your brand colour and works on phones.
          </p>
          <pre className="mt-6 overflow-x-auto rounded-lg border border-[var(--graphite-line)] bg-[var(--graphite)] p-4 font-mono text-[13px] leading-6 text-[#d7dce4]">
            <code>
              <span className="text-[#8fa9f7]">&lt;script</span> src=<span className="text-[#c9d6fb]">&quot;https://your-domain/widget/v1.js&quot;</span> defer<span className="text-[#8fa9f7]">&gt;&lt;/script&gt;</span>
              {'\n'}
              <span className="text-[#8fa9f7]">&lt;slotwise-booking</span> business=<span className="text-[#c9d6fb]">&quot;your-clinic&quot;</span><span className="text-[#8fa9f7]">&gt;&lt;/slotwise-booking&gt;</span>
            </code>
          </pre>
          <p className="mt-3 text-[13px] text-muted-foreground">
            No website? Every business also gets a hosted booking page, and each customer gets a private link to cancel or
            move their appointment.
          </p>
        </div>
        <div className="mx-auto w-full max-w-sm">
          <WidgetPreview />
        </div>
      </div>
    </section>
  );
}

const FEATURES = [
  { icon: CalendarDays, title: 'Calendar', body: 'Day and week diary for everyone, or one person.' },
  { icon: LayoutList, title: 'Bookings', body: 'Search, add walk-ins, cancel or move with one click.' },
  { icon: Users, title: 'Customers', body: 'History per customer, and erase on request.' },
  { icon: Puzzle, title: 'Services', body: 'Length, price, and buffer time before and after.' },
  { icon: UserRound, title: 'Staff', body: 'Invite staff. They see only their own diary.' },
  { icon: Clock, title: 'Hours and time off', body: 'Split shifts, holidays and one-off changes.' },
  { icon: KeyRound, title: 'API keys', body: 'Scoped keys for your own systems, revocable any time.' },
  { icon: Webhook, title: 'Webhooks', body: 'Signed events with retries and a delivery log.' },
  { icon: FileClock, title: 'Audit log', body: 'Who changed what, and when. No personal data stored in it.' },
];

function Dashboard() {
  return (
    <section id="dashboard" className="scroll-mt-16 border-b">
      <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div className="max-w-xl">
            <h2 className="text-3xl font-semibold tracking-[-0.025em]">Everything the front desk needs.</h2>
            <p className="mt-3 leading-relaxed text-muted-foreground">
              One dashboard for the owner and their team, on desktop or phone. Owners manage the business; staff manage
              their own diary.
            </p>
          </div>
          <Link href="/login?demo=1" className={btnQuiet}>
            Look around the demo
          </Link>
        </div>
        <dl className="mt-10 grid gap-px overflow-hidden rounded-lg border bg-border sm:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map(({ icon: Icon, title, body }) => (
            <div key={title} className="flex gap-3 bg-card p-5">
              <Icon className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden />
              <div>
                <dt className="text-[15px] font-medium">{title}</dt>
                <dd className="mt-1 text-[14px] leading-relaxed text-muted-foreground">{body}</dd>
              </div>
            </div>
          ))}
        </dl>
      </div>
    </section>
  );
}

const FLOW = [
  { title: 'A customer picks a time', body: 'A pure slot engine works out free times from hours, time off, buffers and existing bookings in about 16 ms.' },
  { title: 'PostgreSQL accepts or refuses', body: 'The exclusion constraint is the final word. A taken slot returns 409 SLOT_TAKEN, never a second booking.' },
  { title: 'An outbox event commits with it', body: 'The booking and its event are saved in one transaction, so a crash can’t lose the email.' },
  { title: 'The worker sends and retries', body: 'Confirmation, reminder and webhooks go out with deduplicated job ids. Stale reminders send nothing.' },
];

function Developers() {
  return (
    <section id="developers" className="scroll-mt-16 border-b bg-[var(--graphite)] text-white">
      <div className="mx-auto grid max-w-6xl gap-12 px-4 py-16 sm:px-6 lg:grid-cols-2">
        <div>
          <h2 className="text-3xl font-semibold tracking-[-0.025em]">A REST API you can retry safely.</h2>
          <p className="mt-4 max-w-lg leading-relaxed text-[var(--graphite-text)]">
            Book from your own app or phone system. Every write takes an Idempotency-Key, every error has a stable code,
            and the OpenAPI docs are generated from the same schemas that validate requests.
          </p>
          <pre className="mt-6 overflow-x-auto rounded-lg border border-[var(--graphite-line)] bg-[#14171c] p-4 font-mono text-[12.5px] leading-6 text-[#d7dce4]">
            <code>{`curl -X POST "$API/v1/bookings" \\
  -H "Authorization: Bearer $KEY" \\
  -H "Idempotency-Key: $(uuidgen)" \\
  -d '{"serviceId":"…","staffId":"any",
       "startsAt":"2026-11-03T10:30:00Z",
       "customer":{"name":"Sam Taylor", …}}'`}</code>
          </pre>
          <div className="mt-5 flex flex-wrap gap-3">
            <a href="/api/docs" className={`${btn} bg-white text-[#15181d] hover:bg-[#e6e9ee]`}>
              <Code2 className="size-4" aria-hidden /> Read the API docs
            </a>
            <a href={`${REPO_URL}#webhooks`} className={`${btn} border border-[var(--graphite-line)] text-white hover:bg-[var(--graphite-2)]`}>
              Webhook guide
            </a>
          </div>
        </div>
        <div>
          <h3 className="text-sm font-medium text-[var(--graphite-text)]">What happens when someone books</h3>
          <ol className="mt-4 grid gap-0">
            {FLOW.map((s, i) => (
              <li key={s.title} className="grid grid-cols-[2rem_1fr] gap-3 border-l border-[var(--graphite-line)] pb-6 pl-0 last:pb-0">
                <span className="-ml-[0.8rem] grid size-6 place-items-center rounded-full border border-[var(--graphite-line)] bg-[var(--graphite-2)] font-mono text-[11px] text-[#8fa9f7]">
                  {i + 1}
                </span>
                <div>
                  <p className="font-medium">{s.title}</p>
                  <p className="mt-1 text-[14px] leading-relaxed text-[var(--graphite-text)]">{s.body}</p>
                </div>
              </li>
            ))}
          </ol>
        </div>
      </div>
    </section>
  );
}

function SelfHost({ publicDemo }: { publicDemo: boolean }) {
  const cta = signupCta(publicDemo);
  return (
    <section id="self-host" className="scroll-mt-16">
      <div className="mx-auto grid max-w-6xl items-center gap-8 px-4 py-16 sm:px-6 lg:grid-cols-[1fr_1fr]">
        <div>
          <h2 className="text-3xl font-semibold tracking-[-0.025em]">Run it on your own server.</h2>
          <p className="mt-4 max-w-lg leading-relaxed text-muted-foreground">
            Node.js 24, PostgreSQL 16 or newer and Redis. No Docker and no paid cloud services. Your customers’ data stays on a
            machine you control, and the code is yours to change under the MIT licence.
          </p>
          <div className="mt-6 flex flex-wrap gap-3">
            <a href={REPO_URL} className={btnPrimary}>
              <GitHubIcon className="size-4" /> View on GitHub
            </a>
            <Link href={cta.href} className={btnQuiet}>
              {cta.label}
            </Link>
          </div>
        </div>
        <pre className="overflow-x-auto rounded-lg border border-[var(--graphite-line)] bg-[var(--graphite)] p-4 font-mono text-[13px] leading-6 text-[#d7dce4]">
          <code>
            <span className="text-[#7d8592]"># clone, then one command sets everything up</span>
            {'\n'}git clone {REPO_URL}.git
            {'\n'}cd slotwise
            {'\n'}pnpm run setup
            {'\n'}pnpm dev
          </code>
        </pre>
      </div>
    </section>
  );
}

function Footer() {
  return (
    <footer className="border-t bg-card">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4 px-4 py-6 text-[13px] text-muted-foreground sm:px-6">
        <div className="flex items-center gap-3">
          <Logo className="text-foreground" />
          <span>Open-source booking engine, MIT licence.</span>
        </div>
        <nav aria-label="Footer" className="flex flex-wrap gap-4">
          <a href="/api/docs" className="hover:text-foreground">API docs</a>
          <a href={REPO_URL} className="hover:text-foreground">Source code</a>
          <Link href="/login" className="hover:text-foreground">Log in</Link>
        </nav>
      </div>
    </footer>
  );
}

export default async function Home() {
  const publicDemo = await isPublicDemo();
  return (
    <>
      <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-50 focus:rounded-md focus:bg-card focus:px-3 focus:py-2">
        Skip to content
      </a>
      <Header publicDemo={publicDemo} />
      <main id="main">
        <Hero />
        <Guarantees />
        <ClockChanges />
        <Embed />
        <Dashboard />
        <Developers />
        <SelfHost publicDemo={publicDemo} />
      </main>
      <Footer />
    </>
  );
}
