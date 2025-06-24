import fs from 'fs';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';
import { ObjectId } from 'mongodb';
import mime from 'mime-types';
import Bull from 'bull';
import dbClient from '../utils/db.js';
import redisClient from '../utils/redis.js';

const fileQueue = new Bull('fileQueue');

class FilesController {
  static async postUpload(req, res) {
    const token = req.headers['x-token'];
    
    if (!token) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    try {
      // Retrieve user based on token
      const key = `auth_${token}`;
      const userId = await redisClient.get(key);

      if (!userId) {
        return res.status(401).json({ error: 'Unauthorized' });
      }

      const { name, type, parentId = 0, isPublic = false, data } = req.body;

      // Validate required fields
      if (!name) {
        return res.status(400).json({ error: 'Missing name' });
      }

      if (!type || !['folder', 'file', 'image'].includes(type)) {
        return res.status(400).json({ error: 'Missing type' });
      }

      if (!data && type !== 'folder') {
        return res.status(400).json({ error: 'Missing data' });
      }

      const db = dbClient.client.db(dbClient.dbName);
      const filesCollection = db.collection('files');

      // Validate parentId if provided
      if (parentId && parentId !== 0) {
        const parentFile = await filesCollection.findOne({ _id: new ObjectId(parentId) });
        
        if (!parentFile) {
          return res.status(400).json({ error: 'Parent not found' });
        }

        if (parentFile.type !== 'folder') {
          return res.status(400).json({ error: 'Parent is not a folder' });
        }
      }

      // Prepare the file document
      const fileDocument = {
        userId: new ObjectId(userId),
        name,
        type,
        isPublic,
        parentId: parentId === 0 ? 0 : new ObjectId(parentId)
      };

      // Handle folder creation
      if (type === 'folder') {
        const result = await filesCollection.insertOne(fileDocument);
        
        return res.status(201).json({
          id: result.insertedId.toString(),
          userId,
          name,
          type,
          isPublic,
          parentId
        });
      }

      // Handle file/image creation
      const folderPath = process.env.FOLDER_PATH || '/tmp/files_manager';
      
      // Create folder if it doesn't exist
      if (!fs.existsSync(folderPath)) {
        fs.mkdirSync(folderPath, { recursive: true });
      }

      // Generate unique filename
      const filename = uuidv4();
      const localPath = path.join(folderPath, filename);

      // Decode Base64 data and save to file
      const fileContent = Buffer.from(data, 'base64');
      fs.writeFileSync(localPath, fileContent);

      // Add localPath to document
      fileDocument.localPath = localPath;

      // Save to database
      const result = await filesCollection.insertOne(fileDocument);

      // Add job to queue for image thumbnail generation
      if (type === 'image') {
        await fileQueue.add({
          userId,
          fileId: result.insertedId.toString()
        });
      }

      // Return response
      res.status(201).json({
        id: result.insertedId.toString(),
        userId,
        name,
        type,
        isPublic,
        parentId
      });

    } catch (err) {
      console.log(`Error in postUpload: ${err}`);
      res.status(500).json({ error: 'Internal server error' });
    }
  }

  static async getShow(req, res) {
    const token = req.headers['x-token'];
    
    if (!token) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    try {
      // Retrieve user based on token
      const key = `auth_${token}`;
      const userId = await redisClient.get(key);

      if (!userId) {
        return res.status(401).json({ error: 'Unauthorized' });
      }

      const fileId = req.params.id;
      const db = dbClient.client.db(dbClient.dbName);
      const filesCollection = db.collection('files');

      // Find file document linked to the user and the ID
      const file = await filesCollection.findOne({
        _id: new ObjectId(fileId),
        userId: new ObjectId(userId)
      });

      if (!file) {
        return res.status(404).json({ error: 'Not found' });
      }

      // Return file document
      res.status(200).json({
        id: file._id.toString(),
        userId: file.userId.toString(),
        name: file.name,
        type: file.type,
        isPublic: file.isPublic,
        parentId: file.parentId === 0 ? 0 : file.parentId.toString()
      });

    } catch (err) {
      console.log(`Error in getShow: ${err}`);
      res.status(500).json({ error: 'Internal server error' });
    }
  }

  static async getIndex(req, res) {
    const token = req.headers['x-token'];
    
    if (!token) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    try {
      // Retrieve user based on token
      const key = `auth_${token}`;
      const userId = await redisClient.get(key);

      if (!userId) {
        return res.status(401).json({ error: 'Unauthorized' });
      }

      const parentId = req.query.parentId || '0';
      const page = parseInt(req.query.page) || 0;
      const limit = 20;
      const skip = page * limit;

      const db = dbClient.client.db(dbClient.dbName);
      const filesCollection = db.collection('files');

      // Build match criteria
      const matchCriteria = {
        userId: new ObjectId(userId)
      };

      if (parentId === '0') {
        matchCriteria.parentId = 0;
      } else {
        matchCriteria.parentId = new ObjectId(parentId);
      }

      // Use MongoDB aggregation for pagination
      const files = await filesCollection.aggregate([
        { $match: matchCriteria },
        { $skip: skip },
        { $limit: limit }
      ]).toArray();

      // Format response
      const formattedFiles = files.map(file => ({
        id: file._id.toString(),
        userId: file.userId.toString(),
        name: file.name,
        type: file.type,
        isPublic: file.isPublic,
        parentId: file.parentId === 0 ? 0 : file.parentId.toString()
      }));

      res.status(200).json(formattedFiles);

    } catch (err) {
      console.log(`Error in getIndex: ${err}`);
      res.status(500).json({ error: 'Internal server error' });
    }
  }

  static async getFile(req, res) {
    try {
      const fileId = req.params.id;
      const token = req.headers['x-token'];
      const size = req.query.size;

      const db = dbClient.client.db(dbClient.dbName);
      const filesCollection = db.collection('files');

      // Find file document by ID
      const file = await filesCollection.findOne({ _id: new ObjectId(fileId) });

      if (!file) {
        return res.status(404).json({ error: 'Not found' });
      }

      // Check if file is public or user is authenticated and is the owner
      let isAuthorized = file.isPublic;

      if (!isAuthorized && token) {
        const key = `auth_${token}`;
        const userId = await redisClient.get(key);
        
        if (userId && file.userId.toString() === userId) {
          isAuthorized = true;
        }
      }

      if (!isAuthorized) {
        return res.status(404).json({ error: 'Not found' });
      }

      // Check if file type is folder
      if (file.type === 'folder') {
        return res.status(400).json({ error: "A folder doesn't have content" });
      }

      // Determine file path based on size parameter
      let filePath = file.localPath;
      
      if (size && ['500', '250', '100'].includes(size)) {
        const pathParts = file.localPath.split('.');
        const extension = pathParts.pop();
        const basePath = pathParts.join('.');
        filePath = `${basePath}_${size}.${extension}`;
      }

      // Check if file exists locally
      if (!filePath || !fs.existsSync(filePath)) {
        return res.status(404).json({ error: 'Not found' });
      }

      // Get MIME type based on file name
      const mimeType = mime.lookup(file.name) || 'application/octet-stream';

      // Read and return file content with correct MIME type
      const fileContent = fs.readFileSync(filePath);
      
      res.setHeader('Content-Type', mimeType);
      res.status(200).send(fileContent);

    } catch (err) {
      console.log(`Error in getFile: ${err}`);
      res.status(500).json({ error: 'Internal server error' });
    }
  }

  static async putPublish(req, res) {
    const token = req.headers['x-token'];
    
    if (!token) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    try {
      // Retrieve user based on token
      const key = `auth_${token}`;
      const userId = await redisClient.get(key);

      if (!userId) {
        return res.status(401).json({ error: 'Unauthorized' });
      }

      const fileId = req.params.id;
      const db = dbClient.client.db(dbClient.dbName);
      const filesCollection = db.collection('files');

      // Find and update file document
      const result = await filesCollection.findOneAndUpdate(
        {
          _id: new ObjectId(fileId),
          userId: new ObjectId(userId)
        },
        { $set: { isPublic: true } },
        { returnDocument: 'after' }
      );

      if (!result.value) {
        return res.status(404).json({ error: 'Not found' });
      }

      const file = result.value;

      // Return updated file document
      res.status(200).json({
        id: file._id.toString(),
        userId: file.userId.toString(),
        name: file.name,
        type: file.type,
        isPublic: file.isPublic,
        parentId: file.parentId === 0 ? 0 : file.parentId.toString()
      });

    } catch (err) {
      console.log(`Error in putPublish: ${err}`);
      res.status(500).json({ error: 'Internal server error' });
    }
  }

  static async putUnpublish(req, res) {
    const token = req.headers['x-token'];
    
    if (!token) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    try {
      // Retrieve user based on token
      const key = `auth_${token}`;
      const userId = await redisClient.get(key);

      if (!userId) {
        return res.status(401).json({ error: 'Unauthorized' });
      }

      const fileId = req.params.id;
      const db = dbClient.client.db(dbClient.dbName);
      const filesCollection = db.collection('files');

      // Find and update file document
      const result = await filesCollection.findOneAndUpdate(
        {
          _id: new ObjectId(fileId),
          userId: new ObjectId(userId)
        },
        { $set: { isPublic: false } },
        { returnDocument: 'after' }
      );

      if (!result.value) {
        return res.status(404).json({ error: 'Not found' });
      }

      const file = result.value;

      // Return updated file document
      res.status(200).json({
        id: file._id.toString(),
        userId: file.userId.toString(),
        name: file.name,
        type: file.type,
        isPublic: file.isPublic,
        parentId: file.parentId === 0 ? 0 : file.parentId.toString()
      });

    } catch (err) {
      console.log(`Error in putUnpublish: ${err}`);
      res.status(500).json({ error: 'Internal server error' });
    }
  }
}

export default FilesController;
