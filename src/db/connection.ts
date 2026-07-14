import { MongoClient } from "mongodb";

const CONNECT_DB = process.env.MONGODB_CONNECT_DB_URL!.replace(
  "<password>",
  process.env.MONGODB_CONNECT_DB_PASSWORD!
);

const client = new MongoClient(CONNECT_DB, { monitorCommands: true });
const mongoDbClient = client.db();

let isConnected = false;

const connectToMongo = async () => {
  if (isConnected) {
    return;
  }

  await client.connect();
  isConnected = true;
};

const disconnectFromMongo = async () => {
  if (!isConnected) {
    return;
  }

  await client.close();
  isConnected = false;
};

export { mongoDbClient, connectToMongo, disconnectFromMongo };
