import { createApp } from './app';
import { connectDb } from './config/db';
import { env } from './config/env';

async function bootstrap() {
  // Connect to MongoDB before accepting traffic.
  // Commented out so the skeleton boots without a database available — enable
  // once your MONGODB_URI is configured and models/routes are implemented.
  // await connectDb();

  const app = createApp();
  app.listen(env.port, () => {
    // eslint-disable-next-line no-console
    console.log(`API ready on http://localhost:${env.port}${env.apiPrefix}`);
  });
}

void connectDb; // referenced above once enabled
bootstrap();
