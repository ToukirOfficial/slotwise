import type { MailMessage } from './mail.service.js';

const escapeHtml = (s: string): string =>
  s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] ?? c);

/** One plain layout for every email: a heading, some lines, an optional button. */
export const renderEmail = (opts: {
  to: string;
  subject: string;
  heading: string;
  lines: string[];
  action?: { label: string; url: string };
  footer?: string;
}): Omit<MailMessage, 'ics'> => {
  const text = [
    opts.heading,
    '',
    ...opts.lines,
    ...(opts.action ? ['', `${opts.action.label}: ${opts.action.url}`] : []),
    ...(opts.footer ? ['', opts.footer] : []),
  ].join('\n');
  const html = `<!doctype html><html><body style="font-family:system-ui,sans-serif;color:#111;max-width:560px;margin:0 auto;padding:24px">
<h1 style="font-size:20px">${escapeHtml(opts.heading)}</h1>
${opts.lines.map((l) => `<p style="line-height:1.5">${escapeHtml(l)}</p>`).join('\n')}
${
  opts.action
    ? `<p><a href="${escapeHtml(opts.action.url)}" style="display:inline-block;background:#111;color:#fff;padding:10px 16px;border-radius:6px;text-decoration:none">${escapeHtml(opts.action.label)}</a></p>`
    : ''
}
${opts.footer ? `<p style="color:#666;font-size:13px">${escapeHtml(opts.footer)}</p>` : ''}
</body></html>`;
  return { to: opts.to, subject: opts.subject, text, html };
};
