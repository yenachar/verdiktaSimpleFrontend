const express = require('express');
const cors = require('cors');
const multer = require('multer');
const path = require('path');
const fs = require('fs').promises;
require('dotenv').config();
const fetch = require('node-fetch');

const app = express();
const ipfsClient = require('./services/ipfsClient'); 

// Apply CORS middleware before defining routes
app.use(cors());
app.use(express.json());

// Configure multer for temporary file storage
const upload = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => {
      cb(null, path.join(__dirname, 'tmp'));
    },
    filename: (req, file, cb) => {
      cb(null, `${Date.now()}-${file.originalname}`);
    }
  }),
  fileFilter: (req, file, cb) => {
    console.log('Received file mimetype:', file.mimetype);
    // Check either mimetype or file extension
    if (file.mimetype === 'application/zip' || 
        file.mimetype === 'application/x-zip-compressed' ||
        file.mimetype === 'application/octet-stream' && file.originalname.endsWith('.zip')) {
      cb(null, true);
    } else {
      cb(new Error(`Only ZIP files are allowed. Received: ${file.mimetype}`));
    }
  },
  limits: {
    fileSize: 50 * 1024 * 1024
  }
});

// Ensure tmp directory exists
const tmpDir = path.join(__dirname, 'tmp');
fs.mkdir(tmpDir, { recursive: true }).catch(console.error);

// File upload endpoint
app.post('/api/upload', upload.single('file'), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'No file uploaded' });
  }

  try {
    console.log('Processing upload:', {
      originalname: req.file.originalname,
      path: req.file.path,
      size: req.file.size
    });

    // Upload to IPFS
    const cid = await ipfsClient.uploadToIPFS(req.file.path);
    
    // Clean up temporary file
    await fs.unlink(req.file.path).catch(console.error);
    
    console.log('Upload successful:', { cid });
    
    res.json({
      success: true,
      cid,
      filename: req.file.originalname
    });

  } catch (error) {
    console.error('Upload failed:', error);
    
    // Clean up temporary file on error
    if (req.file) {
      await fs.unlink(req.file.path).catch(console.error);
    }
    
    res.status(500).json({
      error: 'Upload failed',
      details: error.message
    });
  }
});

// Test endpoint
app.get('/test', (req, res) => {
  res.json({ message: 'Server is running' });
});

app.get('/test-cors', (req, res) => {
  res.json({ message: 'CORS is working' });
});

// Add this new endpoint to handle IPFS fetching
app.get('/api/fetch/:cid', async (req, res) => {
  try {
    const { cid } = req.params;
    console.log('Fetching from IPFS:', cid);
    
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 30000); // 30 second timeout

    const response = await fetch(`https://ipfs.io/ipfs/${cid}`, {
      signal: controller.signal,
      timeout: 30000
    });

    clearTimeout(timeout);

    if (!response.ok) {
      throw new Error(`IPFS fetch failed with status: ${response.status}`);
    }

    // Get the response data as a buffer
    const data = await response.buffer();
    
    // Forward the content type and length
    res.set({
      'Content-Type': response.headers.get('content-type'),
      'Content-Length': response.headers.get('content-length'),
      'Access-Control-Allow-Origin': '*'
    });
    
    // Send the data
    res.send(data);

  } catch (error) {
    console.error('Error fetching from IPFS:', error);
    if (error.name === 'AbortError') {
      res.status(504).json({
        error: 'Request timeout',
        details: 'IPFS fetch timed out after 30 seconds'
      });
    } else {
      res.status(500).json({
        error: 'Failed to fetch from IPFS',
        details: error.message
      });
    }
  }
});

// Load environment variables from .env file
require('dotenv').config();

// Validate required environment variables
const PORT = process.env.PORT || 5000;
if (!process.env.PORT) {
  console.warn('Warning: PORT not set in environment, using default: 5000');
}

// Add error handling for the server
const server = app.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`);
  console.log('Environment variables loaded:', {
    PORT: PORT,
    IPFS_PINNING_SERVICE: process.env.IPFS_PINNING_SERVICE ? 'Set' : 'Not set',
    IPFS_PINNING_KEY: process.env.IPFS_PINNING_KEY ? 'Set' : 'Not set'
  });
}).on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    const newPort = PORT + 1;
    console.log(`Port ${PORT} is busy, trying ${newPort}`);
    server.close();
    app.listen(newPort, () => {
      console.log(`Server now listening on port ${newPort}`);
    });
  } else {
    console.error('Server error:', err);
  }
});

