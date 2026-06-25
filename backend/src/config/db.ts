import mongoose from 'mongoose';
import { env } from './env';

mongoose.set('strictQuery', true);

/** Connect to MongoDB. Call once on server startup. */
export async function connectDb(): Promise<void> {
  // TODO: implement real connection handling / retries as needed.
  await mongoose.connect(env.mongoUri);
}

export async function disconnectDb(): Promise<void> {
  await mongoose.disconnect();
}
