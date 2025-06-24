import redis from 'redis';

class RedisClient {
  constructor() {
    // Create Redis client
    this.client = redis.createClient();
    
    // Set initial connection status
    this.isConnected = false;

    // Handle Redis connection errors
    this.client.on('error', (err) => {
      console.log(`Redis client not connected to the server: ${err.message}`);
      this.isConnected = false;
    });

    // Handle successful connection
    this.client.on('connect', () => {
      this.isConnected = true;
    });

    // Handle ready state
    this.client.on('ready', () => {
      this.isConnected = true;
    });

    // Handle disconnection
    this.client.on('end', () => {
      this.isConnected = false;
    });
  }

  /**
   * Check if Redis connection is alive
   * @returns {boolean} true if connected, false otherwise
   */
  isAlive() {
    return this.isConnected;
  }

  /**
   * Get value from Redis by key
   * @param {string} key - The key to retrieve
   * @returns {Promise<string|null>} The value stored for the key
   */
  async get(key) {
    return new Promise((resolve, reject) => {
      this.client.get(key, (err, result) => {
        if (err) {
          reject(err);
        } else {
          resolve(result);
        }
      });
    });
  }

  /**
   * Set a key-value pair in Redis with expiration
   * @param {string} key - The key to set
   * @param {any} value - The value to store
   * @param {number} duration - Expiration time in seconds
   * @returns {Promise<void>}
   */
  async set(key, value, duration) {
    return new Promise((resolve, reject) => {
      this.client.setex(key, duration, value, (err) => {
        if (err) {
          reject(err);
        } else {
          resolve();
        }
      });
    });
  }

  /**
   * Delete a key from Redis
   * @param {string} key - The key to delete
   * @returns {Promise<number>} Number of keys that were removed
   */
  async del(key) {
    return new Promise((resolve, reject) => {
      this.client.del(key, (err, result) => {
        if (err) {
          reject(err);
        } else {
          resolve(result);
        }
      });
    });
  }
}

// Create and export an instance of RedisClient
const redisClient = new RedisClient();
export default redisClient;
