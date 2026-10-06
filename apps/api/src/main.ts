import { createApp } from './bootstrap.js';
import { loadConfig } from './config.js';

const config = loadConfig();
const app = await createApp(config);
await app.listen(config.API_PORT, '127.0.0.1');
