import { before, after } from 'mocha';
import dbClient from '../utils/db.js';
import redisClient from '../utils/redis.js';

before(async function() {
  this.timeout(10000);
  console.log('Setting up test environment...');
  
  // Wait for connections to be established
  let attempts = 0;
  const maxAttempts = 10;
  
  while (attempts < maxAttempts) {
    if (dbClient.isAlive() && redisClient.isAlive()) {
      console.log('Database and Redis connections established');
      break;
    }
    await new Promise(resolve => setTimeout(resolve, 1000));
    attempts++;
  }
  
  if (attempts === maxAttempts) {
    throw new Error('Failed to establish database connections');
  }
});

after(async function() {
  console.log('Test environment cleanup completed');
});
