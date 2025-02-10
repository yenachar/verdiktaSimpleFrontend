// src/utils/ipfsUtils.js

export const SERVER_URL = process.env.REACT_APP_SERVER_URL || 'http://localhost:5000';

/**
 * Upload a file (or Blob) to your server endpoint: POST /api/upload
 * The server then pins it to IPFS (via Pinata) and returns { cid }.
 *
 * @param {File|Blob} file The ZIP file or other data to upload.
 * @param {Function} [setUploadProgress] Optional, if you want to track progress.
 * @returns {Promise<string>} The IPFS CID (string).
 */
export async function uploadToServer(file, setUploadProgress) {
  const formData = new FormData();
  formData.append('file', file);

  try {
    console.log(`Uploading file to server: ${SERVER_URL}/api/upload`);
    
    // If you need progress events in the browser, you'd have to use XHR manually.
    // For simplicity, we just do a normal fetch here:
    const response = await fetch(`${SERVER_URL}/api/upload`, {
      method: 'POST',
      body: formData,
      // "mode: 'cors'" may or may not be necessary depending on your CORS setup
      mode: 'cors'
    });

    if (!response.ok) {
      const errorObj = await response.json().catch(() => ({}));
      throw new Error(errorObj.details || `Upload failed with HTTP ${response.status}`);
    }

    const data = await response.json();
    if (!data.cid) {
      throw new Error('Server did not return a cid field.');
    }
    console.log('Upload successful. CID:', data.cid);
    return data.cid;

  } catch (error) {
    console.error('Upload error:', error);
    if (error.message.includes('Failed to fetch') || error.message.includes('ERR_CONNECTION_REFUSED')) {
      throw new Error(
        'Unable to connect to server. Please check:\n' +
        ` 1) Server is running at ${SERVER_URL}\n` +
        ' 2) The server code is correct\n' +
        ' 3) The .env REACT_APP_SERVER_URL is correct\n' +
        `Error detail: ${error.message}`
      );
    }
    throw error;
  }
}

/**
 * Fetch file/text from IPFS by calling your server route: GET /api/fetch/:cid
 * The server automatically attempts multiple gateways and returns the raw data.
 *
 * @param {string} cid The IPFS CID
 * @param {number} [retries=3] Not strictly necessary here; the server already retries.
 * @param {number} [delay=2000] Same note: your server does its own exponential backoff.
 * @returns {Promise<Response>} The fetch Response object.
 */
export async function fetchWithRetry(cid, retries = 3, delay = 2000) {
  // We call your Node server’s endpoint directly:
  const url = `${SERVER_URL}/api/fetch/${cid.trim()}`;

  for (let i = 0; i < retries; i++) {
    try {
      console.log(`Fetching from server route: ${url} (attempt ${i + 1}/${retries})`);
      const response = await fetch(url, { mode: 'cors' });
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      // Return the raw fetch Response so the caller can do .text() or .json().
      return response;
    } catch (err) {
      console.error(`Fetch attempt ${i + 1} failed:`, err.message);
      if (i === retries - 1) {
        // Exhausted all retries
        throw err;
      }
      // Wait and retry
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }
  // Should never get here
  throw new Error(`Failed to fetch after ${retries} attempts`);
}