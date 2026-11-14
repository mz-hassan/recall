import { MongoClient, type Db, type Collection } from 'mongodb';
import { emptyGraph, type Concept, type Edge, type Graph, type Job } from '../../../shared/contracts/graph.ts';
import type { SegmentResult } from '../features/graph/harness.ts';

export interface GraphRepository {
  graph(courseId: string): Promise<Graph>;
  publish(courseId: string, graph: Graph): Promise<void>;
  jobs(courseId?: string): Promise<Job[]>;
  job(id: string): Promise<Job | null>;
  saveJob(job: Job): Promise<void>;
  segment(key: string): Promise<SegmentResult | null>;
  saveSegment(key: string, result: SegmentResult): Promise<void>;
}
type Head = Omit<Graph, 'nodes' | 'edges'> & { _id: string };
type NodeDocument = Concept & { courseId: string; version: string };
type EdgeDocument = Edge & { courseId: string; version: string };

export class MongoGraphRepository implements GraphRepository {
  private heads: Collection<Head>;
  private nodes: Collection<NodeDocument>;
  private edges: Collection<EdgeDocument>;
  private indexingJobs: Collection<Job & { _id: string }>;
  private segments: Collection<SegmentResult & { _id: string }>;
  constructor(db: Db) {
    this.heads = db.collection('graphHeads'); this.nodes = db.collection('concepts');
    this.edges = db.collection('conceptEdges'); this.indexingJobs = db.collection('graphJobs');
    this.segments = db.collection('graphSegments');
  }
  async initialize() {
    await Promise.all([
      this.nodes.createIndex({ courseId: 1, version: 1, id: 1 }, { unique: true }),
      this.edges.createIndex({ courseId: 1, version: 1, id: 1 }, { unique: true }),
      this.indexingJobs.createIndex({ courseId: 1, lectureId: 1, revision: 1 }, { unique: true }),
    ]);
  }
  async graph(courseId: string): Promise<Graph> {
    const head = await this.heads.findOne({ _id: courseId });
    if (!head) return emptyGraph();
    const [nodes, edges] = await Promise.all([
      this.nodes.find({ courseId, version: head.version }, { projection: { _id: 0, courseId: 0, version: 0 } }).toArray(),
      this.edges.find({ courseId, version: head.version }, { projection: { _id: 0, courseId: 0, version: 0 } }).toArray(),
    ]);
    const { _id, ...metadata } = head;
    return { ...metadata, nodes, edges };
  }
  async publish(courseId: string, graph: Graph) {
    const { nodes, edges, ...metadata } = graph;
    // Immutable version documents first; the single head replacement publishes atomically.
    if (nodes.length) await this.nodes.insertMany(nodes.map(node => ({ ...node, courseId, version: graph.version })));
    if (edges.length) await this.edges.insertMany(edges.map(edge => ({ ...edge, courseId, version: graph.version })));
    await this.heads.replaceOne({ _id: courseId }, metadata, { upsert: true });
  }
  async jobs(courseId?: string) {
    return this.indexingJobs.find(courseId ? { courseId } : {}, { projection: { _id: 0 } }).sort({ updatedAt: -1 }).toArray();
  }
  async job(id: string) {
    return this.indexingJobs.findOne({ _id: id }, { projection: { _id: 0 } });
  }
  async saveJob(job: Job) {
    await this.indexingJobs.replaceOne({ _id: job.id }, job, { upsert: true });
  }
  async segment(key: string) { return this.segments.findOne({ _id: key }, { projection: { _id: 0 } }); }
  async saveSegment(key: string, result: SegmentResult) { await this.segments.replaceOne({ _id: key }, result, { upsert: true }); }
}
export async function connectGraphRepository(uri: string, name: string) {
  const client = new MongoClient(uri, { serverSelectionTimeoutMS: 5000 });
  await client.connect();
  const repository = new MongoGraphRepository(client.db(name));
  await repository.initialize();
  return { client, repository };
}
