import http from 'node:http';
import { MongoClient } from 'mongodb';
import worker from './dist/server/index.js';

const port = Number(process.env.PORT || 10000);
const uri = process.env.MONGODB_URI;
if (!uri) throw new Error('MONGODB_URI is required');

class MongoBucket {
  constructor(collection) { this.collection = collection; }
  async get(key) {
    const doc = await this.collection.findOne({ _id: key });
    return doc ? { json: async () => doc.value } : null;
  }
  async put(key, value) {
    const parsed = typeof value === 'string' ? JSON.parse(value) : value;
    await this.collection.replaceOne({ _id: key }, { _id: key, value: parsed }, { upsert: true });
  }
  async delete(key) { await this.collection.deleteOne({ _id: key }); }
  async list({ prefix = '', startAfter, limit = 1000 } = {}) {
    const query = { _id: { $regex: `^${prefix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}` } };
    if (startAfter) query._id.$gt = startAfter;
    const objects = await this.collection.find(query, { projection: { _id: 1 } }).sort({ _id: 1 }).limit(limit).toArray();
    return { objects: objects.map(({ _id }) => ({ key: _id })) };
  }
}

const client = new MongoClient(uri);
await client.connect();
const db = client.db(process.env.MONGODB_DB || 'couchclub');
const bucket = new MongoBucket(db.collection('kv'));
const env = { BUCKET: bucket, RENDER: true, TURN_URL: process.env.TURN_URL, TURN_USERNAME: process.env.TURN_USERNAME, TURN_CREDENTIAL: process.env.TURN_CREDENTIAL };

const server = http.createServer(async (req, res) => {
  if (req.url === '/healthz') { res.writeHead(200, { 'Content-Type': 'text/plain' }); res.end('ok'); return; }
  try {
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    const body = Buffer.concat(chunks);
    const headers = new Headers();
    for (const [key, value] of Object.entries(req.headers)) if (value) headers.set(key, Array.isArray(value) ? value.join(', ') : value);
    const response = await worker.fetch(new Request(`https://${req.headers.host || 'render.local'}${req.url}`, { method: req.method, headers, body: ['GET', 'HEAD'].includes(req.method) ? undefined : body } ), env);
    const responseHeaders = {};
    response.headers.forEach((value, key) => { responseHeaders[key] = value; });
    res.writeHead(response.status, responseHeaders);
    res.end(Buffer.from(await response.arrayBuffer()));
  } catch (error) {
    console.error(error);
    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Internal server error.' }));
  }
});

server.listen(port, '0.0.0.0', () => console.log(`Couch Club listening on port ${port}`));
const shutdown = async () => { await client.close(); server.close(() => process.exit(0)); };
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
