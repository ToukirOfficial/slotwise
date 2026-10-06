export const EMAIL_JOB_OPTS = {
  attempts: 8,
  backoff: { type: 'exponential', delay: 30_000 },
  // Completed jobs are removed: the email_log table (not Redis) is the record of what was sent.
  removeOnComplete: true,
  removeOnFail: { age: 7 * 24 * 3600 },
} as const;
