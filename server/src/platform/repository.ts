import { MongoClient, type Collection, type Document } from 'mongodb';
import type { Moment, SessionState, TimelineSnapshotEvent, TranscriptChunk } from '../../../shared/contracts/lecture.ts';
import type { ChatAnswer, ChatRequest, GeneratedArtifact } from '../../../shared/contracts/lectureInteractions.ts';
import type { SlideCoaching } from '../../../shared/contracts/slideCoaching.ts';

export type User = { id: string; email: string; role: 'student' | 'instructor' | 'ta'; courses: string[] };
export type UserRecord = User & { _id: string; salt: string; passwordHash: string; createdAt: Date };
export type SourceRecord = { id: string; title: string; path: string; kind: 'transcript' | 'slides' | 'reading'; text: string; hash: string; url?: string; page?: number };
export type PreparedNotes = {
  _id: string; courseId: string; lectureId: string; title: string; basis: 'transcript' | 'materials';
  generationId: string; contentHash: string; promptVersion: string; provider: string; model: string;
  summary: string; moments: Moment[]; chunks: TranscriptChunk[]; sources: SourceRecord[]; createdAt: Date;
};
export type SavedRun = { _id: string; userId: string; courseId: string; lectureId: string; runId: string;
  kind: 'live' | 'replay' | 'study'; snapshot: TimelineSnapshotEvent; chunks: TranscriptChunk[]; summary: string | null; updatedAt: Date };
export type SavedChat = { _id: string; userId: string; courseId: string; lectureId: string; runId: string; request: ChatRequest; answer: ChatAnswer; createdAt: Date };
export type Doubt = { _id: string; userId: string; courseId: string; lectureId: string; runId: string; momentId: string; pastTopicId?: string; createdAt: Date };

export function createPlatformRepository({ uri, database }: { uri: string; database: string }) {
  const client = new MongoClient(uri, { serverSelectionTimeoutMS: 4000 });
  let connection: Promise<void> | undefined;
  async function connect() {
    if (!connection) connection = (async () => {
      await client.connect();
      const db = client.db(database);
      await Promise.all([
        db.collection('users').createIndex({ email: 1, role: 1 }, { unique: true }),
        db.collection('auth_sessions').createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 }),
        db.collection('lecture_runs').createIndex({ userId: 1, courseId: 1, lectureId: 1, kind: 1, updatedAt: -1 }),
        db.collection('lecture_chats').createIndex({ userId: 1, courseId: 1, lectureId: 1, runId: 1, createdAt: 1 }),
        db.collection('lecture_doubts').createIndex({ courseId: 1, lectureId: 1, runId: 1, momentId: 1 }),
      ]);
    })().catch(error => { connection = undefined; throw error; });
    await connection;
  }
  async function collection<T extends Document>(name: string): Promise<Collection<T>> { await connect(); return client.db(database).collection<T>(name); }
  const publicUser = (user: UserRecord): User => ({ id: user.id, email: user.email, role: user.role, courses: user.courses });
  return {
    connect,
    async close() { await client.close(); connection = undefined; },
    async createUser(user: UserRecord) { await (await collection<UserRecord>('users')).insertOne(user); return publicUser(user); },
    async findUser(email: string, role: string) { return (await collection<UserRecord>('users')).findOne({ email, role: role as User['role'] }); },
    async user(id: string) { const result = await (await collection<UserRecord>('users')).findOne({ _id: id }); return result ? publicUser(result) : null; },
    async join(userId: string, courseId: string) { await (await collection<UserRecord>('users')).updateOne({ _id: userId }, { $addToSet: { courses: courseId } }); return this.user(userId); },
    async saveAuth(hash: string, userId: string, expiresAt: Date) { await (await collection<{ _id: string; userId: string; expiresAt: Date }>('auth_sessions')).insertOne({ _id: hash, userId, expiresAt }); },
    async authenticate(hash: string) { const session = await (await collection<{ _id: string; userId: string; expiresAt: Date }>('auth_sessions')).findOne({ _id: hash, expiresAt: { $gt: new Date() } }); return session ? this.user(session.userId) : null; },
    async logout(hash: string) { await (await collection<{ _id: string }>('auth_sessions')).deleteOne({ _id: hash }); },
    async saveNotes(notes: PreparedNotes) { await (await collection<PreparedNotes>('course_notes')).replaceOne({ _id: notes._id }, notes, { upsert: true }); },
    async notes(courseId: string, lectureId: string) { return (await collection<PreparedNotes>('course_notes')).findOne({ _id: courseId + '/' + lectureId }); },
    async notesCatalog() { return (await collection<PreparedNotes>('course_notes')).find({}, { projection: { courseId: 1, lectureId: 1, title: 1, basis: 1, createdAt: 1, generationId: 1,'sources.id':1,'sources.title':1,'sources.path':1,'sources.kind':1,'sources.url':1 } }).toArray(); },
    async artifactRequest(userId:string,runId:string,requestId:string){return (await (await collection<{_id:string;userId:string;artifact:GeneratedArtifact}>('lecture_artifacts')).findOne({userId,'artifact.runId':runId,'artifact.requestId':requestId}))?.artifact??null;},
    async slideNotes(userId:string,id:string){return (await (await collection<{_id:string;userId:string;notes:SlideCoaching}>('lecture_slide_notes')).findOne({_id:userId+'/'+id}))?.notes??null;},
    async saveSlideNotes(userId:string,id:string,notes:SlideCoaching){await (await collection<{_id:string;userId:string;notes:SlideCoaching}>('lecture_slide_notes')).replaceOne({_id:userId+'/'+id},{userId,notes},{upsert:true});},
    async saveRun(run: SavedRun) { await (await collection<SavedRun>('lecture_runs')).replaceOne({ _id: run._id }, run, { upsert: true }); },
    async latestRun(userId: string, courseId: string, lectureId: string, kind?: SavedRun['kind']) { return (await collection<SavedRun>('lecture_runs')).findOne({ userId, courseId, lectureId, kind:kind??{$ne:'study'} }, { sort: { updatedAt: -1 } }); },
    async run(userId: string, runId: string) { return (await collection<SavedRun>('lecture_runs')).findOne({ _id: userId + '/' + runId }); },
    async runs(userId: string, courseId?: string) { return (await collection<SavedRun>('lecture_runs')).find({ userId, ...(courseId ? { courseId } : {}) }, { projection: { snapshot: 0, chunks: 0, summary: 0 } }).sort({ updatedAt: -1 }).limit(100).toArray(); },
    async saveChat(chat: SavedChat) { await (await collection<SavedChat>('lecture_chats')).replaceOne({ _id: chat._id }, chat, { upsert: true }); },
    async chat(userId: string, requestId: string) { return (await collection<SavedChat>('lecture_chats')).findOne({ _id: userId + '/' + requestId }); },
    async chats(userId: string, courseId: string, lectureId: string, runId: string) { return (await collection<SavedChat>('lecture_chats')).find({ userId, courseId, lectureId, runId }).sort({ createdAt: 1 }).limit(100).toArray(); },
    async setDoubt(doubt: Doubt, unclear: boolean) { const c = await collection<Doubt>('lecture_doubts'); if (unclear) await c.replaceOne({ _id: doubt._id }, doubt, { upsert: true }); else await c.deleteOne({ _id: doubt._id }); },
    async doubts(courseId: string, lectureId?: string, userId?: string) { return (await collection<Doubt>('lecture_doubts')).find({ courseId, ...(lectureId ? { lectureId } : {}), ...(userId ? { userId } : {}) }).toArray(); },
    async saveArtifact(userId: string, artifact: GeneratedArtifact) { await (await collection<{ _id: string; userId: string; artifact: GeneratedArtifact }>('lecture_artifacts')).replaceOne({ _id: userId + '/' + artifact.id }, { userId, artifact }, { upsert: true }); },
    async artifact(userId: string, id: string) { return (await (await collection<{ _id: string; userId: string; artifact: GeneratedArtifact }>('lecture_artifacts')).findOne({ _id: userId + '/' + id }))?.artifact ?? null; },
  };
}
export type PlatformRepository = ReturnType<typeof createPlatformRepository>;
