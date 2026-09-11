const mongoose = require("mongoose");

// Promise-based caching prevents race conditions on concurrent cold starts
if (!global._mongooseCache) {
  global._mongooseCache = { conn: null, promise: null };
}

const connectDB = async () => {
  const cache = global._mongooseCache;

  if (cache.conn && cache.conn.readyState === 1) {
    return cache.conn;
  }

  if (!cache.promise) {
    cache.promise = mongoose
      .connect(process.env.MONGO_URL, {
        dbName: "timestin_crm",
        bufferCommands: false,
        maxPoolSize: 5,
        serverSelectionTimeoutMS: 5000,
        socketTimeoutMS: 45000,
      })
      .then((m) => {
        console.log(`MongoDB connected: ${m.connection.host}`);
        return m.connection;
      })
      .catch((error) => {
        cache.promise = null;
        console.error(`MongoDB connection error: ${error.message}`);
        if (!process.env.VERCEL) {
          process.exit(1);
        }
        throw error;
      });
  }

  cache.conn = await cache.promise;
  return cache.conn;
};

module.exports = connectDB;
