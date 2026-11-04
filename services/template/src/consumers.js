// Stream consumers. Each real service subscribes here to the streams listed for it in the
// API contract (for example notification consumes application.decided). The handler runs in a
// Postgres transaction `tx` together with the duplicate check, so an event is applied exactly once.
export function consumers({ events, log }) {
  if (!events) return;
  events.consume('example.created', async (event, tx) => {
    await tx.query('INSERT INTO example_events (event_id, example_id) VALUES ($1, $2)', [event.id, event.exampleId]);
    log.info({ eventId: event.id, exampleId: event.exampleId }, 'example.created handled');
  });
}
