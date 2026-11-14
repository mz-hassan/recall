import { readStored } from '../storage.js';

const profileKey = 'recall-course-profile';
const accountsKey = 'recall-demo-accounts';

function accountId({ email, role }) {
  return role + ':' + email;
}

async function passwordVerifier(password, salt) {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({
    name: 'PBKDF2', hash: 'SHA-256', salt: new Uint8Array(salt), iterations: 600000,
  }, key, 256);
  return Array.from(new Uint8Array(bits)).join('.');
}

export async function authenticateDemo({ email, role, password, signup }) {
  const identity = { email, role };
  const id = accountId(identity);
  const account = readStored(accountsKey)[id];
  if (signup) {
    if (account) throw new Error('An account with this email and role already exists. Sign in instead.');
    const salt = Array.from(crypto.getRandomValues(new Uint8Array(16)));
    const verifier = await passwordVerifier(password, salt);
    const accounts = readStored(accountsKey);
    if (accounts[id]) throw new Error('An account with this email and role already exists. Sign in instead.');
    localStorage.setItem(accountsKey, JSON.stringify({ ...accounts, [id]: { salt, verifier } }));
  } else if (!account || await passwordVerifier(password, account.salt) !== account.verifier) {
    throw new Error('The email or password doesn’t match an account for this role.');
  }
  return identity;
}

export function enrolledCourseIds(profile) {
  if (!profile) return [];
  const saved = readStored('recall-course-memberships')[accountId(profile)];
  return Array.isArray(saved) ? saved : profile.courseId ? [profile.courseId] : [];
}

export function joinCourse(profile, courseId) {
  const memberships = readStored('recall-course-memberships');
  const next = [...new Set([...enrolledCourseIds(profile), courseId])];
  localStorage.setItem('recall-course-memberships', JSON.stringify({ ...memberships, [accountId(profile)]: next }));
}

export function isEnrolled(profile, courseId) {
  return enrolledCourseIds(profile).includes(courseId);
}

export function readProfile() {
  try { return JSON.parse(sessionStorage.getItem(profileKey)); }
  catch { return null; }
}

export function saveProfile(profile) {
  if (profile) sessionStorage.setItem(profileKey, JSON.stringify(profile));
  else sessionStorage.removeItem(profileKey);
}

export function isCourseStaff(profile, courseId) {
  return isEnrolled(profile, courseId) && ['instructor', 'ta'].includes(profile.role);
}

export function matchCourse(courses, code) {
  const normalize = value => value.toLowerCase().replace(/[^a-z0-9]/g, '');
  const key = normalize(code);
  return key && courses.find(course => {
    const full = normalize(course.code);
    return key === full || key === full.replace(/^compsci/, '');
  });
}

export function readDoubts() {
  const doubts = readStored('recall-doubts');
  return Array.isArray(doubts) ? doubts : [];
}

export function toggleDoubt(profile, momentId, pastTopicId) {
  const current = readDoubts();
  const matches = entry => entry.courseId === profile.courseId && entry.email === profile.email && entry.momentId === momentId;
  const next = current.some(matches)
    ? current.filter(entry => !matches(entry))
    : [...current, { courseId: profile.courseId, email: profile.email, momentId, pastTopicId }];
  localStorage.setItem('recall-doubts', JSON.stringify(next));
  return next;
}

export function topicDoubts(courseId, momentId, entries) {
  // Stable demo counts keep the same counts across visits and roles.
  const seed = [...momentId].reduce((hash, character) => Math.imul(hash, 31) + character.charCodeAt(0) | 0, 7);
  const simulated = (Math.imul(seed ^ (seed >>> 16), 0x45d9f3b) >>> 0) % 21;
  const local = new Set(entries.filter(entry => entry.courseId === courseId && (entry.momentId === momentId || entry.pastTopicId === momentId)).map(entry => entry.email)).size;
  return { simulated, local, total: simulated + local };
}
