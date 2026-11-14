import { TeacherResponse } from '../../shared/contracts/readings.ts';
import { ReadingBundle } from '../../shared/contracts/readings.ts';
export async function generateReading(paperId, signal) {
  const response = await fetch(`/api/readings/${encodeURIComponent(paperId)}/generate`, { method: 'POST', signal });
  let data;
  try { data = await response.json(); } catch { throw new Error('Could not reach the reading server. Start it and retry.'); }
  if (!response.ok) throw new Error(data.error || 'Could not prepare this paper.');
  return ReadingBundle.parse(data);
}
export async function askTeacher(paperId, input, signal) {
  const response = await fetch(`/api/readings/${encodeURIComponent(paperId)}/teacher`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(input), signal });
  let data;
  try { data = await response.json(); } catch { throw new Error('Teacher unavailable. Start the Recall teacher server and retry.'); }
  if (!response.ok) throw new Error(data.error || 'Teacher unavailable. Please retry.');
  return TeacherResponse.parse(data);
}
