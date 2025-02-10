// src/components/PaginatedJustification.js

import React, { useState, useEffect } from 'react';

// Simple arrow components to avoid external dependency
const ChevronLeft = () => (
  <svg 
    xmlns="http://www.w3.org/2000/svg" 
    width="24" 
    height="24" 
    viewBox="0 0 24 24" 
    fill="none" 
    stroke="currentColor" 
    strokeWidth="2" 
    strokeLinecap="round" 
    strokeLinejoin="round"
  >
    <path d="M15 18l-6-6 6-6"/>
  </svg>
);

const ChevronRight = () => (
  <svg 
    xmlns="http://www.w3.org/2000/svg" 
    width="24" 
    height="24" 
    viewBox="0 0 24 24" 
    fill="none" 
    stroke="currentColor" 
    strokeWidth="2" 
    strokeLinecap="round" 
    strokeLinejoin="round"
  >
    <path d="M9 18l6-6-6-6"/>
  </svg>
);

const PaginatedJustification = ({ resultCid, fetchWithRetry, tryParseJustification, setOutcomes, setResultTimestamp, setOutcomeLabels }) => {
  const [currentPage, setCurrentPage] = useState(0);
  const [justifications, setJustifications] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  // Split CIDs and clean them
  const cids = resultCid?.split(',').map(cid => cid.trim()).filter(Boolean) || [];

  useEffect(() => {
    const loadJustification = async (cid) => {
      setLoading(true);
      setError(null);
      try {
        const response = await fetchWithRetry(`https://ipfs.io/ipfs/${cid}`);
        const justificationText = await tryParseJustification(
          response,
          cid,
          setOutcomes,
          setResultTimestamp,
          setOutcomeLabels
        );
        return justificationText;
      } catch (error) {
        console.error('Error loading justification:', error);
        return `Error loading justification: ${error.message}`;
      }
    };

    // Reset state when resultCid changes
    setCurrentPage(0);
    setJustifications([]);

    // Load all justifications if they haven't been loaded yet
    if (cids.length > 0) {
      Promise.all(cids.map(loadJustification))
        .then(results => {
          setJustifications(results);
          setLoading(false);
        })
        .catch(error => {
          setError(error.message);
          setLoading(false);
        });
    }
  }, [resultCid, fetchWithRetry, tryParseJustification, setOutcomes, setResultTimestamp, setOutcomeLabels]);

  if (cids.length === 0) {
    return <div className="text-red-500">No justification CIDs available</div>;
  }

  const currentJustification = justifications[currentPage] || '';

  return (
    <div className="w-full space-y-4">
      {/* Navigation controls - only show if multiple CIDs */}
      {cids.length > 1 && (
        <div className="flex items-center justify-between bg-gray-100 p-4 rounded-lg">
          <button
            onClick={() => setCurrentPage(prev => Math.max(0, prev - 1))}
            disabled={currentPage === 0 || loading}
            className="flex items-center px-3 py-2 bg-white rounded-md shadow 
                     disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <ChevronLeft />
            <span className="ml-2">Previous</span>
          </button>
          
          <div className="text-sm text-gray-600">
            Justification {currentPage + 1} of {cids.length}
          </div>
          
          <button
            onClick={() => setCurrentPage(prev => Math.min(cids.length - 1, prev + 1))}
            disabled={currentPage === cids.length - 1 || loading}
            className="flex items-center px-3 py-2 bg-white rounded-md shadow
                     disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <span className="mr-2">Next</span>
            <ChevronRight />
          </button>
        </div>
      )}

      {/* Current CID display */}
      <div className="text-sm text-gray-500 mb-4">
        Current CID: {cids[currentPage]}
      </div>

      {/* Justification content */}
      <div className="bg-white p-6 rounded-lg shadow whitespace-pre-wrap">
        {loading ? (
          <div className="flex items-center justify-center py-8">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900"></div>
          </div>
        ) : error ? (
          <div className="text-red-500">{error}</div>
        ) : (
          currentJustification
        )}
      </div>
    </div>
  );
};

export default PaginatedJustification;
