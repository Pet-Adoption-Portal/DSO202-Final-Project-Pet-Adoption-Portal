// HTTP routes. This is the part each real service replaces with the endpoints listed for it
// in docs/API-CONTRACT.md. The example below shows every pattern a service needs:
// a public read, a validated write that needs a login, a 404, a conflict, and publishing an event.
import { conflict, need, notFound, requireRole } from '@pet-portal/common';

// JSON Schema validation: Fastify rejects bad bodies with 400 before the handler runs.
const createBody = {
  type: 'object',
  required: ['name'],
  additionalProperties: false,
  properties: {
    name: { type: 'string', minLength: 1, maxLength: 80 },
    note: { type: 'string', maxLength: 500 },
  },
};

const toJson = (row) => ({ id: row.id, name: row.name, note: row.note, createdBy: row.created_by, createdAt: row.created_at });

export async function routes(app, { db, events, metrics }) {
  // Example business metric, visible on /metrics as examples_created_total{service="template"}.
  const created = metrics.counter('examples_created_total', 'Examples created');

  // Public: list
  app.get('/examples', async () => {
    const { rows } = await db.query('SELECT * FROM examples ORDER BY created_at DESC LIMIT 100');
    return rows.map(toJson);
  });

  // Public: one item, 404 if missing
  app.get('/examples/:id', async (req) => {
    const { rows } = await db.query('SELECT * FROM examples WHERE id = $1', [req.params.id]);
    return toJson(need(rows[0], notFound('Example not found.')));
  });

  // Staff only: create, then publish an event for other services
  app.post('/examples', { schema: { body: createBody } }, async (req, reply) => {
    const user = requireRole(req, 'staff', 'admin');
    const { rows } = await db
      .query('INSERT INTO examples (name, note, created_by) VALUES ($1, $2, $3) RETURNING *', [req.body.name.trim(), req.body.note ?? '', user.id])
      .catch((err) => {
        if (err.code === '23505') throw conflict('An example with this name already exists.', 'DUPLICATE'); // unique_violation
        throw err;
      });
    created.inc();
    await events?.publish('example.created', { exampleId: rows[0].id, name: rows[0].name });
    return reply.code(201).send(toJson(rows[0]));
  });
}
