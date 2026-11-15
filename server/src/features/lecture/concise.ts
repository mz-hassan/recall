/** Last-resort bound when a model ignores the requested length. Prefer a complete sentence. */
export function concise(text: string, maxWords: number): string {
  const words = text.trim().split(/\s+/);
  if (words.length <= maxWords) return text.trim();
  const prefix = words.slice(0, maxWords).join(' ');
  const end = Math.max(prefix.lastIndexOf('. '), prefix.lastIndexOf('? '), prefix.lastIndexOf('! '));
  return end > prefix.length / 2 ? prefix.slice(0, end + 1) : prefix.replace(/[,;:]$/, '') + '…';
}
