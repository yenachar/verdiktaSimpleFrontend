const express = require('express');
const cors = require('cors');
const multer = require('multer');
const path = require('path');
const fs = require('fs').promises;
require('dotenv').config();

const app = express();
const ipfsClient = require('./services/ipfsClient'); 

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

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`);
  console.log('Environment variables loaded:', {
    IPFS_PINNING_SERVICE: process.env.IPFS_PINNING_SERVICE ? 'Set' : 'Not set',
    IPFS_PINNING_KEY: process.env.IPFS_PINNING_KEY ? 'Set' : 'Not set'
  });
});

