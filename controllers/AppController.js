import redisClient from '../utils/redis.js';
import dbClient from '../utils/db.js';

class AppController {
  static getStatus(req, res) {
    const redisStatus = redisClient.isAlive();
    const dbStatus = dbClient.isAlive();
    
    res.status(200).json({
      redis: redisStatus,
      db: dbStatus
    });
  }

  static async getStats(req, res) {
    try {
      const users = await dbClient.nbUsers();
      const files = await dbClient.nbFiles();
      
      res.status(200).json({
        users: users,
        files: files
      });
    } catch (err) {
      res.status(500).json({ error: 'Internal server error' });
    }
  }
}

export default AppController;
