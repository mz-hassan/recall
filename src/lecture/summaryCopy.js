export const summaryFailed = moment => moment.enrichment === 'failed' || (!moment.enrichment && !moment.summary);

export function summaryCopy(moment) {
  const summary = (moment.summary || '').replace(/<[^>]+>/g, '').trim();
  if (summary) return summary;
  return summaryFailed(moment) ? 'Summary unavailable. Open the transcript fallback for this topic.' : 'Summarizing this topic…';
}
