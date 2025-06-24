import sha1 from 'sha1';
import { ObjectId } from 'mongodb';
import Bull from 'bull';
import dbClient from '../utils/db.js';
import redisClient from '../utils/redis.js';

const userQueue = new Bull('userQueue');

class UsersController {
  static async postNew(req, res) {
    const { email, password } = req.body;

    if (!email) {
      return res.status(400).json({ error: 'Missing email' });
    }

    if (!password) {
      return res.status(400).json({ error: 'Missing password' });
    }

    try {
      const db = dbClient.client.db(dbClient.dbName);
      const usersCollection = db.collection('users');

      // Check if user already exists
      const existingUser = await usersCollection.findOne({ email });
      if (existingUser) {
        return res.status(400).json({ error: 'Already exist' });
      }

      // Hash password and create new user
      const hashedPassword = sha1(password);
      const result = await usersCollection.insertOne({
        email,
        password: hashedPassword
      });

      // Add job to user queue for welcome email
      await userQueue.add({
        userId: result.insertedId.toString()
      });

      // Return user without password
      res.status(201).json({
        id: result.insertedId.toString(),
        email
      });

    } catch (err) {
      console.log(`Error in postNew: ${err}`);
      res.status(500).json({ error: 'Internal server error' });
    }
  }

  static async getMe(req, res) {
    const token = req.headers['x-token'];
    
    if (!token) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    try {
      const key = `auth_${token}`;
      const userId = await redisClient.get(key);

      if (!userId) {
        return res.status(401).json({ error: 'Unauthorized' });
      }

      const db = dbClient.client.db(dbClient.dbName);
      const usersCollection = db.collection('users');

      const user = await usersCollection.findOne({ _id: new ObjectId(userId) });

      if (!user) {
        return res.status(401).json({ error: 'Unauthorized' });
      }

      res.status(200).json({
        id: user._id.toString(),
        email: user.email
      });

    } catch (err) {
      console.log(`Error in getMe: ${err}`);
      res.status(500).json({ error: 'Internal server error' });
    }
  }
}

export default UsersController;
