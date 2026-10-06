/** Scoped by Shadow DOM: nothing here leaks into the host page, and the host page's CSS can't break it. */
export const styles = `
:host { display: block; font: 16px/1.5 system-ui, -apple-system, "Segoe UI", Roboto, sans-serif; color: #111; --brand: #2563eb; --on-brand: #fff; }
* { box-sizing: border-box; }
.card { border: 1px solid #d4d4d8; border-radius: 12px; padding: 20px; background: #fff; max-width: 560px; }
h2 { font-size: 1.125rem; margin: 0 0 4px; }
h2:focus { outline: none; }
p { margin: 0 0 12px; }
.muted { color: #52525b; font-size: 0.875rem; }
.steps { display: flex; gap: 6px; margin-bottom: 16px; padding: 0; list-style: none; font-size: 0.75rem; color: #52525b; }
.steps li { flex: 1; border-top: 3px solid #e4e4e7; padding-top: 4px; }
.steps li[aria-current="step"] { border-color: var(--brand); color: #111; font-weight: 600; }
.list { display: grid; gap: 8px; margin: 12px 0; }
.grid { display: flex; flex-wrap: wrap; gap: 8px; margin: 12px 0; }
button, .btn { font: inherit; min-height: 44px; min-width: 44px; border-radius: 8px; border: 1px solid #a1a1aa; background: #fff; color: #111; padding: 8px 14px; cursor: pointer; text-align: left; }
button:hover:not(:disabled) { border-color: var(--brand); }
button:focus-visible, input:focus-visible, select:focus-visible { outline: 3px solid var(--brand); outline-offset: 2px; }
button:disabled { opacity: 0.45; cursor: not-allowed; }
button.primary { background: var(--brand); color: var(--on-brand); border-color: var(--brand); font-weight: 600; text-align: center; }
button.link { border: none; background: none; text-decoration: underline; padding: 8px 4px; }
button[aria-pressed="true"] { background: var(--brand); color: var(--on-brand); border-color: var(--brand); }
.option { display: flex; justify-content: space-between; gap: 12px; width: 100%; }
.day { display: grid; text-align: center; min-width: 64px; }
label { display: block; font-weight: 600; font-size: 0.875rem; margin: 12px 0 4px; }
input, select { font: inherit; width: 100%; min-height: 44px; border: 1px solid #a1a1aa; border-radius: 8px; padding: 8px 10px; background: #fff; color: #111; }
input[aria-invalid="true"] { border-color: #b91c1c; }
.field-error { color: #b91c1c; font-size: 0.875rem; margin: 4px 0 0; }
.alert { border-radius: 8px; padding: 10px 12px; margin: 12px 0; background: #fef2f2; color: #7f1d1d; border: 1px solid #fecaca; }
.alert:empty { display: none; }
.nav { display: flex; justify-content: space-between; align-items: center; gap: 8px; margin-top: 16px; }
.summary { background: #f4f4f5; border-radius: 8px; padding: 10px 12px; margin: 12px 0; }
.sr-only { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; }
`;
