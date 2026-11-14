import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { MongoClient } from 'mongodb';
import { MongoGraphRepository } from '../../db/graphRepository.ts';
import { GraphService } from './service.ts';
import { TestProvider, TestSource } from './testSupport.ts';

test('native MongoDB persists graph documents and jobs across repository/service restarts without storing lecture text', { timeout: 120000 }, async () => {
  const mongo = await MongoMemoryServer.create({ binary: { version: '8.0.17' } });
  const client = new MongoClient(mongo.getUri());
  try {
    await client.connect();
    const db = client.db('graph-integration');
    const repository = new MongoGraphRepository(db); await repository.initialize();
    const provider = new TestProvider(), source = new TestSource();
    const service = new GraphService(repository, source, provider);
    await service.complete({ courseId: 'ai', lectureId: '1', revision: 1 }); await service.idle();
    await service.complete({ courseId: 'ai', lectureId: '3', revision: 1 }); await service.idle();
    assert.equal((await repository.graph('ai')).nodes.length, 3);
    const restarted = new MongoGraphRepository(db);
    const recovered = new GraphService(restarted, source, provider);
    await recovered.recover();
    await recovered.complete({ courseId: 'ai', lectureId: '3', revision: 1 }); await recovered.idle();
    assert.equal(provider.calls, 2);
    assert.equal((await restarted.jobs()).filter(job => job.state === 'completed').length, 2);
    const head = await db.collection('graphHeads').findOne({ _id: 'ai' } as never);
    assert.ok(head);
    assert.ok(!JSON.stringify(head).includes('expert demonstrations'));
    const node = await db.collection('concepts').findOne({});
    assert.ok(node && !('text' in node) && !('sources' in node));
    // Staged nodes cannot leak into readers before their head is published.
    await db.collection('concepts').insertOne({ id: 'unpublished', courseId: 'ai', version: 'pending', references: [] });
    assert.equal((await restarted.graph('ai')).nodes.length, 3);
  } finally { await client.close(); await mongo.stop(); }
});
