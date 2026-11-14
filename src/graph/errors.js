// Older saved jobs may contain a serialized validator exception. Preserve their
// diagnostic data in MongoDB while presenting an actionable message in the UI.
export function indexingErrorMessage(error) {
  if (!error) return 'The update failed. Please retry.';
  if (typeof error !== 'string') return 'The generated graph did not match the required format. Please retry.';
  try {
    const issues = JSON.parse(error);
    if (Array.isArray(issues) && issues.some(issue => issue?.code && Array.isArray(issue.path))) {
      return issues.some(issue => issue.path?.at(-1) === 'relation')
        ? 'The model returned an unsupported relationship type. Retry the update to request a corrected response.'
        : 'The generated graph did not match the required format. Retry the update to request a corrected response.';
    }
  } catch { /* Normal, already readable error message. */ }
  return error;
}
