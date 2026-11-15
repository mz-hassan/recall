import { readStored } from '../storage.js';

const profileKey = 'recall-course-profile';
const accountsKey = 'recall-demo-accounts';
const databaseDoubts = new Map();

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

async function authenticateLocal({ email, role, password, signup }) {
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

export async function accountRequest(path, {method='GET',body}={}) {
  const response=await fetch('/api'+path,{method,headers:{'content-type':'application/json'},...(body!==undefined?{body:JSON.stringify(body)}:{})});
  const data=await response.json().catch(()=>null);
  if(!response.ok){const error=new Error(data?.error||'Your account data could not be reached.');error.status=response.status;throw error;}
  return data;
}
export async function restoreAccount(){
  try{const {user}=await accountRequest('/auth/session');saveProfile(user);return user;}
  catch(error){if(error.status===404)return readProfile();throw error;}
}
export async function authenticateDemo(input){
  if(typeof window==='undefined')return authenticateLocal(input);
  try{return (await accountRequest('/auth/'+(input.signup?'signup':'login'),{method:'POST',body:{...input,courses:enrolledCourseIds(input)}})).user;}
  catch(error){
    if(error.status===404){const health=await accountRequest('/health');if(health.accounts==='fixture')return authenticateLocal(input);}
    // Migrate an existing browser demo account only after checking its real password locally.
    if(error.status===401&&!input.signup&&readStored(accountsKey)[accountId(input)]){
      await authenticateLocal({...input,signup:false});
      return (await accountRequest('/auth/signup',{method:'POST',body:{...input,courses:enrolledCourseIds(input)}})).user;
    }
    throw error;
  }
}
export async function logoutAccount(profile){if(profile?.id){await accountRequest('/auth/logout',{method:'POST',body:{}});databaseDoubts.delete(profile.id);}saveProfile(null);}

export function enrolledCourseIds(profile) {
  if (!profile) return [];
  if(profile.id&&Array.isArray(profile.courses))return profile.courses;
  const saved = readStored('recall-course-memberships')[accountId(profile)];
  return Array.isArray(saved) ? saved : profile.courseId ? [profile.courseId] : [];
}

export function joinCourse(profile, courseId) {
  if(profile?.id)return accountRequest('/auth/courses',{method:'POST',body:{courseId}}).then(({user})=>{saveProfile(user);return user;});
  const memberships = readStored('recall-course-memberships');
  const next = [...new Set([...enrolledCourseIds(profile), courseId])];
  localStorage.setItem('recall-course-memberships', JSON.stringify({ ...memberships, [accountId(profile)]: next }));
  return profile;
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

export function readDoubts(profile = readProfile()) {
  if (profile?.id) return databaseDoubts.get(profile.id) ?? [];
  const doubts = readStored('recall-doubts');
  return Array.isArray(doubts) ? doubts : [];
}

export function toggleDoubt(profile, momentId, pastTopicId) {
  const current = readDoubts(profile);
  const matches = entry => entry.courseId === profile.courseId && entry.email === profile.email && entry.momentId === momentId;
  if(profile.id)return accountRequest('/doubts',{method:'PUT',body:{courseId:profile.courseId,lectureId:profile.lectureId,runId:profile.runId,momentId,...(pastTopicId?{pastTopicId}:{}),unclear:!current.some(matches)}}).then(({doubts})=>{databaseDoubts.set(profile.id,doubts);return doubts;});
  const next = current.some(matches)
    ? current.filter(entry => !matches(entry))
    : [...current, { courseId: profile.courseId, email: profile.email, momentId, pastTopicId }];
  localStorage.setItem('recall-doubts', JSON.stringify(next));
  return next;
}

export async function loadDoubts(profile,courseId,lectureId){
  if(!profile?.id)return readDoubts();
  const {doubts}=await accountRequest('/doubts?courseId='+encodeURIComponent(courseId)+(lectureId?'&lectureId='+encodeURIComponent(lectureId):''));
  databaseDoubts.set(profile.id,doubts);return doubts;
}

export function topicDoubts(courseId, momentId, entries, database = false) {
  // Stable demo counts keep the same counts across visits and roles.
  const seed = [...momentId].reduce((hash, character) => Math.imul(hash, 31) + character.charCodeAt(0) | 0, 7);
  const simulated = database?0:(Math.imul(seed ^ (seed >>> 16), 0x45d9f3b) >>> 0) % 21;
  const local = new Set(entries.filter(entry => entry.courseId === courseId && (entry.momentId === momentId || entry.pastTopicId === momentId)).map(entry => entry.email)).size;
  return { simulated, local, total: simulated + local };
}
