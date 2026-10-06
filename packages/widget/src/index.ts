import type { Availability, PublicBooking, PublicBusiness, Slot } from '@slotwise/shared';
import { PublicApi, WidgetError } from './api.js';
import { isHex, textOn } from './contrast.js';
import { addDays, localDate, pounds, ukDateTime, ukTime, ukToday } from './format.js';
import { styles } from './styles.js';

/**
 * <slotwise-booking business="demo-physio" service="…" color="#0f766e"></slotwise-booking>
 *
 * Four steps: service → day → time → details. Shadow DOM keeps styles in and out. All text from the server is
 * set with textContent (never innerHTML), so a business name can't inject markup into the host page.
 */

// The API lives on the server this script came from (captured while the script runs).
const scriptSrc = (document.currentScript as HTMLScriptElement | null)?.src;
const API_BASE = `${scriptSrc ? new URL(scriptSrc).origin : location.origin}/api/v1/public`;
const DAYS_SHOWN = 14;

type Step = 'service' | 'day' | 'time' | 'details' | 'done';
const STEPS: [Step, string][] = [
  ['service', 'Service'],
  ['day', 'Day'],
  ['time', 'Time'],
  ['details', 'Details'],
];

type Child = Node | string | null | undefined | false;
function h<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  attrs: Record<string, string | boolean | undefined | ((e: Event) => void)> = {},
  ...children: Child[]
): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (typeof v === 'function') el.addEventListener(k.slice(2).toLowerCase(), v);
    else if (v === true) el.setAttribute(k, '');
    else if (v !== undefined && v !== false) el.setAttribute(k, v);
  }
  for (const c of children) if (c) el.append(c);
  return el;
}

const newKey = () =>
  typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}`;

class SlotwiseBooking extends HTMLElement {
  static observedAttributes = ['business', 'service', 'color'];

  private api = new PublicApi(API_BASE);
  private root: ShadowRoot;
  private content: HTMLElement;
  private stepsNav: HTMLOListElement;
  private status: HTMLElement;
  private alert: HTMLElement;

  private business?: PublicBusiness;
  private step: Step = 'service';
  private serviceId?: string;
  private staffId = 'any';
  private from = ukToday();
  private availability?: Availability;
  private date?: string;
  private chosenSlot?: Slot;
  private customer = { name: '', email: '', phone: '' };
  private fieldErrors: Record<string, string> = {};
  private idemKey = newKey();
  private pending = false;
  private booking?: PublicBooking;

  constructor() {
    super();
    this.root = this.attachShadow({ mode: 'open' });
    this.stepsNav = h('ol', { class: 'steps', 'aria-label': 'Booking steps' });
    this.content = h('div');
    // Live regions exist before their content changes, so screen readers announce updates.
    this.status = h('p', { class: 'sr-only', 'aria-live': 'polite' });
    this.alert = h('div', { class: 'alert', role: 'alert', 'aria-live': 'assertive' });
    this.root.append(h('style', {}, styles), h('div', { class: 'card' }, this.stepsNav, this.alert, this.content, this.status));
  }

  connectedCallback() {
    void this.boot();
  }

  attributeChangedCallback(name: string, old: string | null, value: string | null) {
    if (old === value || !this.isConnected) return;
    if (name === 'color') this.applyColor();
    else void this.boot();
  }

  // ─── Data ───────────────────────────────────────────────────────────────────────────────────────────

  private async boot() {
    const slug = this.getAttribute('business');
    if (!slug) return this.fail('This booking widget is missing its business attribute.');
    this.content.replaceChildren(h('p', { class: 'muted' }, 'Loading…'));
    try {
      this.business = await this.api.business(slug);
    } catch (e) {
      return this.fail(e instanceof WidgetError && e.status === 404 ? 'Online booking isn’t available for this business yet.' : this.message(e));
    }
    this.applyColor();
    const preselect = this.getAttribute('service');
    const service = this.business.services.find((s) => s.id === preselect);
    if (service) {
      this.serviceId = service.id;
      await this.go('day');
    } else {
      await this.go('service');
    }
  }

  private async loadDays() {
    const slug = this.getAttribute('business') ?? '';
    this.availability = undefined;
    this.render();
    try {
      this.availability = await this.api.availability(slug, {
        serviceId: this.serviceId ?? '',
        staffId: this.staffId,
        from: this.from,
        to: addDays(this.from, DAYS_SHOWN - 1),
      });
    } catch (e) {
      this.setAlert(this.message(e));
    }
    this.render();
  }

  private async submit(e: Event) {
    e.preventDefault();
    if (!this.chosenSlot || !this.serviceId || this.pending) return;
    this.pending = true;
    this.fieldErrors = {};
    this.setAlert('');
    this.render();
    try {
      this.booking = await this.api.book(this.getAttribute('business') ?? '', this.idemKey, {
        serviceId: this.serviceId,
        staffId: this.staffId,
        startsAt: this.chosenSlot.startsAt,
        customer: this.customer,
      });
      this.pending = false;
      await this.go('done');
    } catch (err) {
      this.pending = false;
      if (err instanceof WidgetError && err.errorCode === 'SLOT_TAKEN') {
        // Someone else got there first: refresh the times and let the customer pick again.
        this.idemKey = newKey();
        this.chosenSlot = undefined;
        this.setAlert('Sorry, that time was just taken — please pick another.');
        await this.loadDays();
        await this.go(this.daySlots().length ? 'time' : 'day', false);
        return;
      }
      if (err instanceof WidgetError && Object.keys(err.fields).length) {
        this.fieldErrors = Object.fromEntries(Object.entries(err.fields).map(([k, v]) => [k.replace('customer.', ''), v]));
      }
      this.setAlert(this.message(err));
      this.render();
    }
  }

  // ─── Navigation ─────────────────────────────────────────────────────────────────────────────────────

  private async go(step: Step, clearAlert = true) {
    this.step = step;
    if (clearAlert) this.setAlert('');
    if (step === 'day' && !this.availability) await this.loadDays();
    this.render();
    // Move focus to the new step's heading so keyboard and screen-reader users land in the right place.
    this.content.querySelector<HTMLElement>('h2')?.focus();
    const label = STEPS.find(([s]) => s === step)?.[1];
    this.status.textContent = label ? `Step ${STEPS.findIndex(([s]) => s === step) + 1} of 4: ${label}` : '';
  }

  // ─── Rendering ──────────────────────────────────────────────────────────────────────────────────────

  private render() {
    this.stepsNav.replaceChildren(
      ...STEPS.map(([s, label], i) =>
        h('li', { 'aria-current': s === this.step ? 'step' : undefined }, `${i + 1}. ${label}`),
      ),
    );
    this.stepsNav.hidden = this.step === 'done';
    const views: Record<Step, () => Node[]> = {
      service: () => this.serviceView(),
      day: () => this.dayView(),
      time: () => this.timeView(),
      details: () => this.detailsView(),
      done: () => this.doneView(),
    };
    this.content.replaceChildren(...views[this.step]());
  }

  private heading(text: string, sub?: string): Node[] {
    return [h('h2', { tabindex: '-1' }, text), sub ? h('p', { class: 'muted' }, sub) : null].filter(Boolean) as Node[];
  }

  private serviceView(): Node[] {
    const biz = this.business;
    if (!biz) return [];
    if (biz.services.length === 0) return [...this.heading(biz.name), h('p', {}, 'There’s nothing to book online right now.')];
    const staffFor = (id: string) => biz.staff.filter((s) => s.serviceIds.includes(id));
    const selected = this.serviceId;
    const staffSelect =
      selected && staffFor(selected).length > 1
        ? [
            h('label', { for: 'staff' }, 'With'),
            h(
              'select',
              {
                id: 'staff',
                onchange: (e: Event) => {
                  this.staffId = (e.target as HTMLSelectElement).value;
                },
              },
              h('option', { value: 'any' }, 'Anyone available'),
              ...staffFor(selected).map((s) => h('option', { value: s.id, selected: s.id === this.staffId }, s.displayName)),
            ),
          ]
        : [];
    return [
      ...this.heading(`Book with ${biz.name}`, 'Choose a service'),
      h(
        'div',
        { class: 'list', role: 'group', 'aria-label': 'Services' },
        ...biz.services.map((s) =>
          h(
            'button',
            {
              type: 'button',
              class: 'option',
              'aria-pressed': String(s.id === selected),
              onclick: () => {
                this.serviceId = s.id;
                this.staffId = 'any';
                this.availability = undefined;
                this.render();
              },
            },
            h('span', {}, s.name),
            h('span', { class: 'muted' }, [`${s.durationMin} min`, pounds(s.pricePence)].filter(Boolean).join(' · ')),
          ),
        ),
      ),
      ...staffSelect,
      h(
        'div',
        { class: 'nav' },
        h('span'),
        h('button', { type: 'button', class: 'primary', disabled: !selected, onclick: () => void this.go('day') }, 'Next'),
      ),
    ];
  }

  private dayView(): Node[] {
    const days = this.availability?.days;
    const body = !days
      ? [h('p', { class: 'muted' }, 'Finding free times…')]
      : days.every((d) => d.slots.length === 0)
        ? [h('p', {}, 'No free times in these two weeks.')]
        : [
            h(
              'div',
              { class: 'grid', role: 'group', 'aria-label': 'Days' },
              ...days.map((d) =>
                h(
                  'button',
                  {
                    type: 'button',
                    class: 'day',
                    disabled: d.slots.length === 0,
                    'aria-pressed': String(d.date === this.date),
                    'aria-label': `${localDate(d.date, { weekday: 'long', day: 'numeric', month: 'long' })}, ${d.slots.length ? `${d.slots.length} times` : 'no times'}`,
                    onclick: () => {
                      this.date = d.date;
                      this.chosenSlot = undefined;
                      void this.go('time');
                    },
                  },
                  h('span', { class: 'muted' }, localDate(d.date, { weekday: 'short' })),
                  h('strong', {}, localDate(d.date, { day: 'numeric', month: 'short' })),
                ),
              ),
            ),
          ];
    const today = ukToday();
    return [
      ...this.heading('Choose a day', 'Times are UK time.'),
      ...body,
      h(
        'div',
        { class: 'nav' },
        h('button', { type: 'button', class: 'link', onclick: () => void this.go('service') }, 'Back'),
        h(
          'span',
          {},
          h(
            'button',
            {
              type: 'button',
              disabled: this.from <= today,
              'aria-label': 'Earlier dates',
              onclick: () => {
                this.from = addDays(this.from, -DAYS_SHOWN) < today ? today : addDays(this.from, -DAYS_SHOWN);
                void this.loadDays();
              },
            },
            '‹ Earlier',
          ),
          ' ',
          h(
            'button',
            {
              type: 'button',
              'aria-label': 'Later dates',
              onclick: () => {
                this.from = addDays(this.from, DAYS_SHOWN);
                void this.loadDays();
              },
            },
            'Later ›',
          ),
        ),
      ),
    ];
  }

  private daySlots(): Slot[] {
    return this.availability?.days.find((d) => d.date === this.date)?.slots ?? [];
  }

  private timeView(): Node[] {
    const slots = this.daySlots();
    return [
      ...this.heading(
        this.date ? localDate(this.date, { weekday: 'long', day: 'numeric', month: 'long' }) : 'Choose a time',
        'Choose a time (UK time)',
      ),
      slots.length
        ? h(
            'div',
            { class: 'grid', role: 'group', 'aria-label': 'Times' },
            ...slots.map((s) =>
              h(
                'button',
                {
                  type: 'button',
                  'aria-pressed': String(s.startsAt === this.chosenSlot?.startsAt),
                  onclick: () => {
                    this.chosenSlot = s;
                    this.idemKey = newKey();
                    void this.go('details');
                  },
                },
                s.localTime,
              ),
            ),
          )
        : h('p', {}, 'No times left on this day.'),
      h('div', { class: 'nav' }, h('button', { type: 'button', class: 'link', onclick: () => void this.go('day') }, 'Back')),
    ];
  }

  private detailsView(): Node[] {
    const service = this.business?.services.find((s) => s.id === this.serviceId);
    const field = (name: 'name' | 'email' | 'phone', label: string, type: string, autocomplete: string) => {
      const error = this.fieldErrors[name];
      return [
        h('label', { for: name }, label),
        h('input', {
          id: name,
          name,
          type,
          autocomplete,
          required: true,
          value: this.customer[name],
          'aria-invalid': error ? 'true' : undefined,
          'aria-describedby': error ? `${name}-error` : undefined,
          oninput: (e: Event) => {
            this.customer[name] = (e.target as HTMLInputElement).value;
          },
        }),
        error ? h('p', { id: `${name}-error`, class: 'field-error' }, error) : null,
      ];
    };
    return [
      ...this.heading('Your details'),
      h(
        'p',
        { class: 'summary' },
        `${service?.name ?? ''} · ${this.chosenSlot ? ukDateTime(this.chosenSlot.startsAt) : ''} (UK time)`,
      ),
      h(
        'form',
        { onsubmit: (e: Event) => void this.submit(e) },
        ...field('name', 'Name', 'text', 'name'),
        ...field('email', 'Email', 'email', 'email'),
        ...field('phone', 'Phone', 'tel', 'tel'),
        h(
          'div',
          { class: 'nav' },
          h('button', { type: 'button', class: 'link', onclick: () => void this.go('time') }, 'Back'),
          h('button', { type: 'submit', class: 'primary', disabled: this.pending }, this.pending ? 'Booking…' : 'Book'),
        ),
      ),
    ];
  }

  private doneView(): Node[] {
    const b = this.booking;
    if (!b) return [];
    return [
      ...this.heading('You’re booked'),
      h('p', { class: 'summary' }, `${b.serviceName} with ${b.staffName}`, h('br'), `${ukDateTime(b.startsAt)}–${ukTime(b.endsAt)} (UK time)`),
      h('p', {}, 'We’ve emailed you a confirmation with a calendar invite and a link to change or cancel.'),
    ];
  }

  // ─── Helpers ────────────────────────────────────────────────────────────────────────────────────────

  private applyColor() {
    const attr = this.getAttribute('color');
    const brand = isHex(attr) ? attr : (this.business?.brandColor ?? '#2563eb');
    this.style.setProperty('--brand', brand);
    this.style.setProperty('--on-brand', textOn(brand));
  }

  private setAlert(text: string) {
    this.alert.textContent = text;
  }

  private fail(text: string) {
    this.stepsNav.hidden = true;
    this.content.replaceChildren();
    this.setAlert(text);
  }

  private message(e: unknown): string {
    return e instanceof WidgetError ? e.message : 'Something went wrong. Please try again.';
  }
}

if (!customElements.get('slotwise-booking')) customElements.define('slotwise-booking', SlotwiseBooking);
