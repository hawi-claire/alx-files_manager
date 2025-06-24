import Bull from 'bull';
import { ObjectId } from 'mongodb';
import imageThumbnail from 'image-thumbnail';
import fs from 'fs';
import dbClient from './utils/db.js';

const fileQueue = new Bull('fileQueue');

fileQueue.process(async (job) => {
  const { userId, fileId } = job.data;

  // Check if fileId is present
  if (!fileId) {
    throw new Error('Missing fileId');
  }

  // Check if userId is present
  if (!userId) {
    throw new Error('Missing userId');
  }

  try {
    const db = dbClient.client.db(dbClient.dbName);
    const filesCollection = db.collection('files');

    // Find file document in DB
    const file = await filesCollection.findOne({
      _id: new ObjectId(fileId),
      userId: new ObjectId(userId)
    });

    if (!file) {
      throw new Error('File not found');
    }

    // Check if the original file exists
    if (!fs.existsSync(file.localPath)) {
      throw new Error('File not found locally');
    }

    // Generate thumbnails with different sizes
    const sizes = [500, 250, 100];
    
    for (const size of sizes) {
      try {
        // Generate thumbnail
        const thumbnail = await imageThumbnail(file.localPath, { width: size });
        
        // Create thumbnail file path
        const pathParts = file.localPath.split('.');
        const extension = pathParts.pop();
        const basePath = pathParts.join('.');
        const thumbnailPath = `${basePath}_${size}.${extension}`;
        
        // Save thumbnail to file system
        fs.writeFileSync(thumbnailPath, thumbnail);
        
        console.log(`Thumbnail ${size}x generated for file ${fileId}`);
      } catch (thumbnailError) {
        console.error(`Error generating ${size}x thumbnail for file ${fileId}:`, thumbnailError);
      }
    }

    console.log(`Thumbnails generated successfully for file ${fileId}`);
  } catch (error) {
    console.error(`Error processing job for file ${fileId}:`, error);
    throw error;
  }
});

fileQueue.on('completed', (job) => {
  console.log(`Job ${job.id} completed`);
});

fileQueue.on('failed', (job, err) => {
  console.log(`Job ${job.id} failed:`, err.message);
});

console.log('Worker started and waiting for jobs...');
