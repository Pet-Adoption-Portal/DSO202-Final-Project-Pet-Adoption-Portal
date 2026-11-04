// Container entry point: `node src/index.js`.
import { buildService } from './app.js';

const service = await buildService();
await service.run();
