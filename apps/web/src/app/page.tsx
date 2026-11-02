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
import { Schibsted_Grotesk } from 'next/font/google';
import Link from 'next/link';
import { CollisionDemo } from '@/components/landing/collision-demo';
import { Logo } from '@/components/logo';
import { isPublicDemo } from '@/lib/demo';

export const metadata: Metadata = {
  title: { absolute: 'Slotwise: appointment booking that can’t double-book' },
};

const display = Schibsted_Grotesk({ subsets: ['latin'], variable: '--font-landing', weight: ['400', '500', '600', '700'] });

/** Public source repo. Forks can point this at their own copy. */
const REPO_URL = process.env.NEXT_PUBLIC_REPO_URL ?? 'https://github.com/ToukirOfficial/slotwise';

function GitHubIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 16 16" aria-hidden className={className} fill="currentColor">
      <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.01 8.01 0 0 0 16 8c0-4.42-3.58-8-8-8Z" />
    </svg>
  );
}

/* ── Layout system ─────────────────────────────────────────────────────────────
   One container, one 12-column grid, one section rhythm, one panel style.
   Type scale: 72 / 40 / 18 / 16 / 14 (+13 for captions). */
const wrap = 'mx-auto w-full max-w-[72rem] px-4 sm:px-8';
const grid = 'grid grid-cols-1 gap-x-8 lg:grid-cols-12';
const section = 'scroll-mt-16 border-b py-20 sm:py-24';
const panel = 'overflow-hidden rounded-2xl border bg-card';
const panelDark = 'overflow-hidden rounded-2xl border border-[var(--graphite-line)] bg-[var(--graphite-2)]';

const btn =
  'inline-flex h-11 items-center justify-center gap-2 whitespace-nowrap rounded-lg px-5 text-[15px] font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2';
const btnPrimary = `${btn} bg-primary text-primary-foreground hover:bg-[var(--primary-hover)]`;
const btnQuiet = `${btn} border border-input bg-card text-foreground hover:border-foreground/30`;

/** On the public demo there's no sign-up: the call to action opens the demo clinic instead. */
const signupCta = (publicDemo: boolean) =>
  publicDemo ? { href: '/login?demo=1', label: 'Try the live demo' } : { href: '/signup', label: 'Create an account' };

/** Every section opens the same way: title on the left half, one lead paragraph on the right half. */
function SectionHeader({
  id,
  title,
  lead,
  dark = false,
  children,
}: {
  id: string;
  title: string;
  lead: string;
  dark?: boolean;
  children?: React.ReactNode;
}) {
  return (
    <div className={`${grid} mb-12 gap-y-5 lg:items-end`}>
      <h2 id={id} className="text-[2rem] leading-[1.08] font-semibold tracking-[-0.035em] sm:text-[2.5rem] lg:col-span-6">
        {title}
      </h2>
      <div className="lg:col-span-5 lg:col-start-8">
        <p className={`text-[16px] leading-relaxed ${dark ? 'text-[var(--graphite-text)]' : 'text-muted-foreground'}`}>{lead}</p>
        {children && <div className="mt-5 flex flex-wrap gap-3">{children}</div>}
      </div>
    </div>
  );
}

function CodeBlock({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return (
    <pre className={`overflow-x-auto bg-[var(--graphite)] p-5 font-mono text-[13px] leading-6 text-[#dcdfe5] ${className}`}>
      <code>{children}</code>
    </pre>
  );
}

const tag = 'text-[var(--signal-dark)]';
const str = 'text-[#f6c9b8]';
const dim = 'text-[#7c818c]';

/* ── Header ─────────────────────────────────────────────────────────────────── */

function Header({ publicDemo }: { publicDemo: boolean }) {
  const cta = signupCta(publicDemo);
  return (
    <header className="sticky top-0 z-30 border-b bg-[var(--background)]/85 backdrop-blur-md">
      <div className={`${wrap} flex h-16 items-center gap-4 whitespace-nowrap sm:gap-8`}>
        <Link href="/" aria-label="Slotwise home">
          <Logo className="text-[17px]" />
        </Link>
        <nav aria-label="Sections" className="hidden items-center gap-6 text-[14px] text-muted-foreground md:flex">
          <a href="#how" className="hover:text-foreground">How it works</a>
          <a href="#dashboard" className="hover:text-foreground">Dashboard</a>
          <a href="#developers" className="hover:text-foreground">Developers</a>
          <a href="#self-host" className="hover:text-foreground">Self-host</a>
        </nav>
        <div className="ml-auto flex items-center gap-1">
          <a href={REPO_URL} className="hidden items-center gap-1.5 rounded-md px-3 py-2 text-[14px] text-muted-foreground hover:text-foreground sm:inline-flex">
            <GitHubIcon className="size-4" /> GitHub
          </a>
          <Link href="/login" className="rounded-md px-2.5 py-2 text-[14px] text-muted-foreground hover:text-foreground sm:px-3">
            Log in
          </Link>
          <Link href={cta.href} className="ml-1 inline-flex h-9 items-center rounded-md bg-foreground px-3 text-[14px] font-medium text-background transition-colors hover:bg-foreground/85 sm:px-3.5">
            {cta.label}
          </Link>
        </div>
      </div>
    </header>
  );
}

/* ── Hero ───────────────────────────────────────────────────────────────────── */

const PROOF = [
  { figure: '1 of 100', label: 'parallel requests for one slot is booked. 99 are refused.' },
  { figure: '16 ms', label: 'to work out a month of free times, database included.' },
  { figure: '5 KB', label: 'for the whole booking widget, gzipped.' },
  { figure: '183', label: 'tests on every push, on PostgreSQL 16 and 18.' },
];

function Hero({ publicDemo }: { publicDemo: boolean }) {
  return (
    <section className="relative overflow-hidden border-b">
      <div className="diary-ruling pointer-events-none absolute inset-0 opacity-50 [mask-image:radial-gradient(ellipse_at_75%_35%,black,transparent_65%)]" />
      <div className={`${wrap} relative`}>
        <div className={`${grid} items-center gap-y-12 pt-16 pb-16 sm:pt-20 lg:pt-24 lg:pb-20`}>
          <div className="lg:col-span-6">
            <p className="mb-6 inline-flex items-center gap-2 rounded-full border bg-card px-3 py-1 text-[13px] text-muted-foreground">
              <span className="size-1.5 rounded-full bg-primary" aria-hidden /> Open source, MIT licensed
            </p>
            <h1 className="max-w-[11ch] text-[2.75rem] leading-[1] font-semibold tracking-[-0.05em] sm:text-[3.75rem] xl:text-[4.5rem]">
              Booking that can’t double&#8209;book.
            </h1>
            <p className="mt-6 max-w-[32rem] text-[18px] leading-[1.6] text-muted-foreground">
              Appointment booking for UK clinics, solicitors, tutors and driving instructors. Add one tag to your website and
              the database refuses every clash.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link href="/login?demo=1" className={btnPrimary}>
                Open the demo clinic
              </Link>
              <Link href="/b/demo-physio" className={btnQuiet}>
                Book as a customer
              </Link>
            </div>
            <p className="mt-4 text-[13px] text-muted-foreground">
              The demo resets every {publicDemo ? 'hour' : 'night'} and never sends email.
            </p>
          </div>
          <div className="min-w-0 lg:col-span-6">
            <CollisionDemo />
            <p className="mt-3 text-[13px] text-muted-foreground">
              A replay of the real concurrency test,{' '}
              <a href={`${REPO_URL}/blob/main/apps/api/test/double-booking.test.ts`} className="underline decoration-border underline-offset-[3px] hover:text-foreground">
                double-booking.test.ts
              </a>
            </p>
          </div>
        </div>

        <dl className="grid grid-cols-2 border-t lg:grid-cols-4">
          {PROOF.map((p, i) => (
            <div
              key={p.figure}
              className={[
                'py-8 pr-6',
                i % 2 === 1 && 'border-l pl-6',
                i >= 2 && 'border-t lg:border-t-0',
                i === 2 && 'lg:border-l lg:pl-6',
              ]
                .filter(Boolean)
                .join(' ')}
            >
              <dt className="text-[1.75rem] leading-none font-semibold tracking-[-0.04em] tabular-nums">{p.figure}</dt>
              <dd className="mt-2.5 max-w-[15rem] text-[14px] leading-snug text-muted-foreground">{p.label}</dd>
            </div>
          ))}
        </dl>
      </div>
    </section>
  );
}

/* ── Guarantees ─────────────────────────────────────────────────────────────── */

const GUARANTEES = [
  {
    title: 'No double-bookings',
    body: 'An exclusion constraint in PostgreSQL refuses overlapping appointments, so a clash can’t slip past app code.',
    proof: '100 parallel requests: one 201, 99 × 409',
  },
  {
    title: 'Right across clock changes',
    body: 'Hours are planned in UK wall-clock time and stored as instants. 9:00 stays 9:00 in March and October.',
    proof: 'All four 2026–27 clock changes tested',
  },
  {
    title: 'Emails that always arrive',
    body: 'Every booking change writes an outbox event in the same transaction. A worker sends it once and retries on failure.',
    proof: 'Survives a crash either side of the commit',
  },
];

function Guarantees() {
  return (
    <section aria-labelledby="guarantees" className={`${section} bg-card`}>
      <div className={wrap}>
        <SectionHeader
          id="guarantees"
          title="Three promises, each backed by a test."
          lead="Most booking tools trust the app to avoid clashes and hope emails go out. Slotwise pushes each guarantee down to the database and proves it in CI."
        />
        <div className={`${panel} grid bg-[var(--background)] md:grid-cols-3 md:divide-x max-md:divide-y`}>
          {GUARANTEES.map((g) => (
            <div key={g.title} className="flex flex-col p-7">
              <h3 className="text-[18px] font-semibold tracking-[-0.015em]">{g.title}</h3>
              <p className="mt-3 text-[15px] leading-relaxed text-muted-foreground">{g.body}</p>
              <p className="mt-auto flex items-center gap-2 border-t pt-4 text-[13px] font-medium text-accent-foreground [margin-top:max(1.5rem,auto)]">
                <span className="size-1.5 shrink-0 rounded-[2px] bg-primary" aria-hidden />
                {g.proof}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ── Clock changes ──────────────────────────────────────────────────────────── */

function HourRow({ label, state, note }: { label: string; state: 'normal' | 'gap' | 'twice' | 'slot'; note?: string }) {
  return (
    <div className="grid grid-cols-[4.5rem_1fr] text-[14px]">
      <span className="border-b py-3 pr-4 text-right font-mono text-[12.5px] tabular-nums text-muted-foreground">{label}</span>
      <span
        className={[
          'flex items-center border-b border-l px-4 py-3',
          state === 'normal' && 'text-muted-foreground',
          state === 'gap' && 'hatch text-muted-foreground',
          state === 'twice' && 'bg-muted',
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

function DiaryDay({ date, caption, children }: { date: string; caption: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col">
      <div className="flex items-baseline justify-between gap-4 border-b px-5 py-4">
        <p className="text-[15px] font-semibold tracking-[-0.01em]">{date}</p>
        <p className="text-[13px] text-muted-foreground">{caption}</p>
      </div>
      <div className="[&>*:last-child>span]:border-b-0">{children}</div>
    </div>
  );
}

function ClockChanges() {
  return (
    <section aria-labelledby="clocks" className={section}>
      <div className={wrap}>
        <SectionHeader
          id="clocks"
          title="Clocks change twice a year. Appointments don’t move."
          lead="In March an hour never happens; in October it happens twice. Slotwise keeps hours as UK wall-clock time and bookings as exact instants, so nothing shifts and no impossible times are offered."
        />
        <div className={`${panel} grid md:grid-cols-2 md:divide-x max-md:divide-y`}>
          <DiaryDay date="Sun 29 Mar 2026" caption="GMT to BST">
            <HourRow label="00:00" state="normal" note="Normal" />
            <HourRow label="01:00" state="gap" note="Doesn’t exist, no slots offered" />
            <HourRow label="02:00" state="normal" note="Clocks have jumped forward" />
            <HourRow label="09:00" state="slot" note="09:00 UK time, 08:00 UTC" />
          </DiaryDay>
          <DiaryDay date="Sun 25 Oct 2026" caption="BST to GMT">
            <HourRow label="00:00" state="normal" note="Normal" />
            <HourRow label="01:00" state="twice" note="Happens twice, offered once" />
            <HourRow label="02:00" state="normal" note="Back on GMT" />
            <HourRow label="09:00" state="slot" note="09:00 UK time, 09:00 UTC" />
          </DiaryDay>
        </div>
      </div>
    </section>
  );
}

/* ── Embed ──────────────────────────────────────────────────────────────────── */

function WidgetPreview() {
  const times = ['09:00', '09:45', '10:30', '11:15', '14:00', '14:45'];
  return (
    <div aria-hidden className="w-full max-w-[22rem] rounded-xl border bg-card p-5 text-sm shadow-[0_1px_2px_rgba(20,20,24,0.05),0_24px_48px_-28px_rgba(20,20,24,0.3)]">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[15px] font-semibold tracking-[-0.01em]">Demo Physio Clinic</p>
          <p className="mt-0.5 text-[13px] text-muted-foreground">Initial assessment, 45 min</p>
        </div>
        <span className="rounded-md bg-muted px-2 py-1 text-[13px] font-medium tabular-nums">£65</span>
      </div>
      <div className="mt-5 grid grid-cols-5 gap-1.5 text-center text-[12px]">
        {['Mon 2', 'Tue 3', 'Wed 4', 'Thu 5', 'Fri 6'].map((d, i) => (
          <span key={d} className={`rounded-lg border py-2 ${i === 1 ? 'border-foreground bg-foreground font-medium text-background' : 'text-muted-foreground'}`}>
            {d}
          </span>
        ))}
      </div>
      <div className="mt-2 grid grid-cols-3 gap-1.5">
        {times.map((t, i) => (
          <span key={t} className={`rounded-lg border py-2 text-center font-mono text-[12px] tabular-nums ${i === 2 ? 'border-primary bg-accent font-medium text-accent-foreground' : ''}`}>
            {t}
          </span>
        ))}
      </div>
      <div className="mt-5 rounded-lg bg-primary py-2.5 text-center text-[14px] font-medium text-primary-foreground">Book Tue 3 Nov at 10:30</div>
      <p className="mt-2.5 text-center text-[12px] text-muted-foreground">Times shown in UK time</p>
    </div>
  );
}

const EMBED_FACTS = [
  { title: 'Works on any site', body: 'WordPress, Laravel, Squarespace or plain HTML.' },
  { title: 'Safe from your CSS', body: 'A Web Component in its own Shadow DOM.' },
  { title: 'Your colours, any screen', body: 'Matches your brand colour and works on phones.' },
];

function Embed() {
  return (
    <section id="how" aria-labelledby="embed" className={`${section} bg-card`}>
      <div className={wrap}>
        <SectionHeader
          id="embed"
          title="Two lines on any website."
          lead="Paste a script tag and a booking tag. No website? Every business also gets a hosted booking page, and each customer gets a private link to cancel or move."
        />
        <div className={`${panel} grid bg-[var(--background)] lg:grid-cols-2 lg:divide-x max-lg:divide-y`}>
          <div className="flex min-w-0 flex-col">
            <CodeBlock className="m-5 rounded-xl border border-[var(--graphite-line)] text-[12.5px] sm:m-6">
              <span className={dim}>{'<!-- 1. load the widget once -->'}</span>
              {'\n'}<span className={tag}>&lt;script</span> defer
              {'\n'}  src=<span className={str}>&quot;https://your-domain/widget/v1.js&quot;</span><span className={tag}>&gt;&lt;/script&gt;</span>
              {'\n'}
              {'\n'}<span className={dim}>{'<!-- 2. place it where bookings go -->'}</span>
              {'\n'}<span className={tag}>&lt;slotwise-booking</span> business=<span className={str}>&quot;your-clinic&quot;</span><span className={tag}>&gt;</span>
              {'\n'}<span className={tag}>&lt;/slotwise-booking&gt;</span>
            </CodeBlock>
            <dl className="mt-auto divide-y border-t">
              {EMBED_FACTS.map((f) => (
                <div key={f.title} className="grid gap-1 px-6 py-4 sm:grid-cols-[11rem_1fr] sm:gap-6">
                  <dt className="text-[15px] font-semibold tracking-[-0.01em]">{f.title}</dt>
                  <dd className="text-[14px] leading-relaxed text-muted-foreground">{f.body}</dd>
                </div>
              ))}
            </dl>
          </div>
          <div className="grid place-items-center bg-muted/60 p-8 sm:p-12">
            <WidgetPreview />
          </div>
        </div>
      </div>
    </section>
  );
}

/* ── Dashboard ──────────────────────────────────────────────────────────────── */

const FEATURES = [
  { icon: CalendarDays, title: 'Calendar', body: 'Day and week diary for everyone, or one person.' },
  { icon: LayoutList, title: 'Bookings', body: 'Search, add walk-ins, cancel or move in one click.' },
  { icon: Users, title: 'Customers', body: 'History per customer, and erase on request.' },
  { icon: Puzzle, title: 'Services', body: 'Length, price and buffer time before and after.' },
  { icon: UserRound, title: 'Staff', body: 'Invite staff. They see only their own diary.' },
  { icon: Clock, title: 'Hours and time off', body: 'Split shifts, holidays and one-off changes.' },
  { icon: KeyRound, title: 'API keys', body: 'Scoped keys for your systems, revocable any time.' },
  { icon: Webhook, title: 'Webhooks', body: 'Signed events with retries and a delivery log.' },
  { icon: FileClock, title: 'Audit log', body: 'Who changed what and when, with no personal data.' },
];

function Dashboard() {
  return (
    <section id="dashboard" aria-labelledby="dashboard-title" className={section}>
      <div className={wrap}>
        <SectionHeader
          id="dashboard-title"
          title="Everything the front desk needs."
          lead="One dashboard for the owner and their team, on desktop or phone. Owners run the business; staff run their own diary."
        >
          <Link href="/login?demo=1" className={btnQuiet}>
            Look around the demo
          </Link>
        </SectionHeader>
        <dl className="grid gap-px overflow-hidden rounded-2xl border bg-border sm:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map(({ icon: Icon, title, body }) => (
            <div key={title} className="bg-card p-6">
              <span className="grid size-9 place-items-center rounded-lg border bg-[var(--background)]">
                <Icon className="size-[18px] text-primary" strokeWidth={1.75} aria-hidden />
              </span>
              <dt className="mt-4 text-[16px] font-semibold tracking-[-0.01em]">{title}</dt>
              <dd className="mt-1 text-[14px] leading-relaxed text-muted-foreground">{body}</dd>
            </div>
          ))}
        </dl>
      </div>
    </section>
  );
}

/* ── Developers ─────────────────────────────────────────────────────────────── */

const FLOW = [
  { title: 'A customer picks a time', body: 'The slot engine works out free times from hours, time off, buffers and bookings in about 16 ms.' },
  { title: 'PostgreSQL accepts or refuses', body: 'The exclusion constraint has the final word. A taken slot returns 409 SLOT_TAKEN.' },
  { title: 'An outbox event commits with it', body: 'Booking and event save in one transaction, so a crash can’t lose the email.' },
  { title: 'The worker sends and retries', body: 'Confirmations, reminders and webhooks go out once, with deduplicated job ids.' },
];

function Developers() {
  return (
    <section id="developers" aria-labelledby="dev-title" className={`${section} border-[var(--graphite-line)] bg-[var(--graphite)] text-white`}>
      <div className={wrap}>
        <SectionHeader
          id="dev-title"
          dark
          title="A REST API you can retry safely."
          lead="Every write takes an Idempotency-Key, every error has a stable code, and the OpenAPI docs come from the same schemas that validate requests."
        >
          <a href="/api/docs" className={`${btn} bg-white text-[var(--graphite)] hover:bg-[#e8e9ec]`}>
            <Code2 className="size-4" aria-hidden /> Read the API docs
          </a>
          <a href={`${REPO_URL}#webhooks`} className={`${btn} border border-[var(--graphite-line)] text-white hover:bg-[var(--graphite-2)]`}>
            Webhook guide
          </a>
        </SectionHeader>
        <div className={`${panelDark} grid lg:grid-cols-2 lg:divide-x lg:divide-[var(--graphite-line)] max-lg:divide-y max-lg:divide-[var(--graphite-line)]`}>
          <div className="flex min-w-0 flex-col">
            <p className="border-b border-[var(--graphite-line)] px-6 py-4 text-[14px] font-medium text-[var(--graphite-text)]">Create a booking</p>
            <CodeBlock className="flex-1 bg-transparent px-6 text-[12.5px]">
              <span className={dim}>$</span> curl -X POST <span className={str}>&quot;$API/v1/bookings&quot;</span> \
              {'\n'}  -H <span className={str}>&quot;Authorization: Bearer $KEY&quot;</span> \
              {'\n'}  -H <span className={str}>&quot;Idempotency-Key: $(uuidgen)&quot;</span> \
              {'\n'}  -d <span className={str}>{`'{"serviceId":"…","staffId":"any",`}</span>
              {'\n'}<span className={str}>{`       "startsAt":"2026-11-03T10:30:00Z",`}</span>
              {'\n'}<span className={str}>{`       "customer":{"name":"Sam Taylor", …}}'`}</span>
              {'\n'}
              {'\n'}<span className={dim}># 201 Created, or 409 SLOT_TAKEN if someone got there first</span>
            </CodeBlock>
          </div>
          <div>
            <p className="border-b border-[var(--graphite-line)] px-6 py-4 text-[14px] font-medium text-[var(--graphite-text)]">What happens when someone books</p>
            <ol className="divide-y divide-[var(--graphite-line)]">
              {FLOW.map((s, i) => (
                <li key={s.title} className="grid grid-cols-[2rem_1fr] gap-4 px-6 py-5">
                  <span className="grid size-7 place-items-center rounded-md border border-[var(--graphite-line)] font-mono text-[12px] text-[var(--signal-dark)]">
                    {i + 1}
                  </span>
                  <div>
                    <p className="text-[15px] font-semibold tracking-[-0.01em]">{s.title}</p>
                    <p className="mt-1 text-[14px] leading-relaxed text-[var(--graphite-text)]">{s.body}</p>
                  </div>
                </li>
              ))}
            </ol>
          </div>
        </div>
      </div>
    </section>
  );
}

/* ── Self-host ──────────────────────────────────────────────────────────────── */

function SelfHost({ publicDemo }: { publicDemo: boolean }) {
  const cta = signupCta(publicDemo);
  return (
    <section id="self-host" aria-labelledby="self-host-title" className={`${section} border-b-0 bg-card`}>
      <div className={wrap}>
        <div className={`${panel} grid bg-[var(--background)] lg:grid-cols-2 lg:divide-x max-lg:divide-y`}>
          <div className="p-8 sm:p-12">
            <h2 id="self-host-title" className="text-[2rem] leading-[1.08] font-semibold tracking-[-0.035em] sm:text-[2.5rem]">
              Run it on your own server.
            </h2>
            <p className="mt-4 max-w-md text-[16px] leading-relaxed text-muted-foreground">
              Node.js 24, PostgreSQL 16+ and Redis. No Docker, no paid cloud services. Your customers’ data stays on a machine
              you control, under the MIT licence.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <a href={REPO_URL} className={btnPrimary}>
                <GitHubIcon className="size-4" /> View on GitHub
              </a>
              <Link href={cta.href} className={btnQuiet}>
                {cta.label}
              </Link>
            </div>
          </div>
          <div className="flex min-w-0 items-center p-6 sm:p-12">
            <CodeBlock className="w-full rounded-xl border border-[var(--graphite-line)]">
              <span className={dim}># clone, then one command sets everything up</span>
              {'\n'}git clone {REPO_URL}.git
              {'\n'}cd slotwise
              {'\n'}pnpm run setup
              {'\n'}pnpm dev
            </CodeBlock>
          </div>
        </div>
      </div>
    </section>
  );
}

function Footer() {
  return (
    <footer className="border-t">
      <div className={`${wrap} flex flex-wrap items-center justify-between gap-4 py-8 text-[13px] text-muted-foreground`}>
        <div className="flex items-center gap-3">
          <Logo className="text-foreground" />
          <span>Open-source booking engine, MIT licence.</span>
        </div>
        <nav aria-label="Footer" className="flex flex-wrap gap-5">
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
    <div className={`landing ${display.variable} min-h-screen`}>
      <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-50 focus:rounded-md focus:bg-card focus:px-3 focus:py-2">
        Skip to content
      </a>
      <Header publicDemo={publicDemo} />
      <main id="main">
        <Hero publicDemo={publicDemo} />
        <Guarantees />
        <ClockChanges />
        <Embed />
        <Dashboard />
        <Developers />
        <SelfHost publicDemo={publicDemo} />
      </main>
      <Footer />
    </div>
  );
}
