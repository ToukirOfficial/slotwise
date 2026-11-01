import { connection } from 'next/server';

/**
 * PUBLIC_DEMO=true (the public portfolio demo): sign-up, invites and password reset are hidden.
 * Read at request time, not build time, so one build works with either setting.
 */
export async function isPublicDemo(): Promise<boolean> {
  await connection();
  return process.env.PUBLIC_DEMO === 'true';
}
