const { MongoClient } = require('mongodb');

class DBClient {
  constructor() {
    // Get configuration from environment variables or use defaults
    const host = process.env.DB_HOST || 'localhost';
    const port = process.env.DB_PORT || 27017;
    const database = process.env.DB_DATABASE || 'files_manager';
    
    // Create MongoDB connection URL
    const url = `mongodb://${host}:${port}`;
    
    // Initialize MongoDB client
    this.client = new MongoClient(url, { useUnifiedTopology: true });
    this.dbName = database;
    this.db = null;
    
    // Connect to MongoDB
    this.client.connect()
      .then(() => {
        this.db = this.client.db(this.dbName);
        console.log('Connected to MongoDB');
      })
      .catch((err) => {
        console.error('MongoDB connection error:', err);
      });
  }

  /**
   * Check if the connection to MongoDB is alive
   * @returns {boolean} true if connected, false otherwise
   */
  isAlive() {
    return this.client && this.client.topology && this.client.topology.isConnected();
  }

  /**
   * Get the number of documents in the users collection
   * @returns {Promise<number>} Number of users
   */
  async nbUsers() {
    try {
      if (!this.db) {
        return 0;
      }
      const collection = this.db.collection('users');
      return await collection.countDocuments();
    } catch (error) {
      console.error('Error counting users:', error);
      return 0;
    }
  }

  /**
   * Get the number of documents in the files collection
   * @returns {Promise<number>} Number of files
   */
  async nbFiles() {
    try {
      if (!this.db) {
        return 0;
      }
      const collection = this.db.collection('files');
      return await collection.countDocuments();
    } catch (error) {
      console.error('Error counting files:', error);
      return 0;
    }
  }
}

// Create and export an instance of DBClient
const dbClient = new DBClient();
module.exports = dbClient;
