// src/pages/RunQuery.js
import React, { useState } from 'react';
import { PAGES } from '../App';
import {
  runQueryOnContract // A hypothetical helper you might implement in contractUtils
} from '../utils/contractUtils';

function RunQuery({
  queryText,
  outcomeLabels,
  supportingFiles,
  ipfsCids,
  juryNodes,
  iterations,
  selectedMethod,
  setSelectedMethod,
  queryPackageFile,
  setQueryPackageFile,
  queryPackageCid,
  setQueryPackageCid,
  isConnected,
  walletAddress,
  contractAddress,
  transactionStatus,
  setTransactionStatus,
  loadingResults,
  setLoadingResults,
  uploadProgress,
  setUploadProgress,
  setCurrentCid,
  setPackageDetails,
  setResultCid,
  setJustification,
  setOutcomes,
  setResultTimestamp,
  setCurrentPage
}) {
  const [activeTooltipId, setActiveTooltipId] = useState(null);

  const handleFileUpload = (event) => {
    const file = event.target.files[0];
    if (file && (file.type === 'application/zip' || file.name.endsWith('.zip'))) {
      setQueryPackageFile(file);
    } else {
      alert('Please upload a ZIP file');
    }
  };

  const handleRunQuery = async () => {
    if (!isConnected && selectedMethod !== 'config') {
      alert('Please connect your wallet first');
      return;
    }
    try {
      setLoadingResults(true);
      setTransactionStatus('Processing...');
      // This is where you'd either call your original logic from `App.js`
      // or call a helper function that does the same steps:
      //   1) Possibly upload file to IPFS
      //   2) Send transaction to contract
      //   3) Poll for results
      //   4) Set outcomes/justification in state

      // This example just demonstrates a placeholder call:
      await runQueryOnContract({
        selectedMethod,
        queryText,
        outcomeLabels,
        supportingFiles,
        ipfsCids,
        juryNodes,
        iterations,
        queryPackageFile,
        queryPackageCid,
        contractAddress,
        setTransactionStatus,
        setOutcomes,
        setJustification,
        setResultCid,
        setResultTimestamp,
        setCurrentCid,
        setPackageDetails,
        setUploadProgress
      });

      // If successful, go to the RESULTS page
      setTransactionStatus('');
      setCurrentPage(PAGES.RESULTS);
    } catch (error) {
      console.error('Error running query:', error);
      setTransactionStatus(`Error: ${error.message}`);
      alert('An error occurred while processing the query. Check the console for details.');
    } finally {
      setLoadingResults(false);
    }
  };

  return (
    <div className="page run">
      <h2>Run Query</h2>

      <div className="method-selector">
        <h3>Select Query Method</h3>

        <div className="method-options">
          <div
            className={`method-option ${selectedMethod === 'config' ? 'selected' : ''}`}
            onClick={() => setSelectedMethod('config')}
          >
            <h4>Use Current Configuration</h4>
            <p>Use the query and jury settings defined in the previous steps</p>
          </div>

          <div
            className={`method-option ${selectedMethod === 'file' ? 'selected' : ''}`}
            onClick={() => setSelectedMethod('file')}
          >
            <h4>Upload Query Package</h4>
            <p>Upload a ZIP file containing a complete query package</p>
          </div>

          <div
            className={`method-option ${selectedMethod === 'ipfs' ? 'selected' : ''}`}
            onClick={() => setSelectedMethod('ipfs')}
          >
            <h4>Use IPFS CID</h4>
            <p>Provide a CID for an existing query package on IPFS</p>
          </div>
        </div>

        <div className="method-details">
          {selectedMethod === 'config' && (
            <div className="config-summary">
              <h4>Current Configuration Summary</h4>
              <div className="summary-details">
                <p>
                  <strong>Query Text:</strong> {queryText}
                </p>
                <p>
                  <strong>Outcomes ({outcomeLabels?.length || 0}):</strong>
                  <ul>
                    {outcomeLabels?.map((label, index) => (
                      <li key={index}>{label}</li>
                    ))}
                  </ul>
                </p>
                <p>
                  <strong>Supporting Files:</strong> {supportingFiles.length}
                </p>
                <p>
                  <strong>IPFS CIDs:</strong> {ipfsCids.length}
                </p>
                <p>
                  <strong>Jury Members:</strong> {juryNodes.length}
                </p>
                <p>
                  <strong>Iterations:</strong> {iterations}
                </p>
              </div>
            </div>
          )}

          {selectedMethod === 'file' && (
            <div className="file-upload">
              <input
                type="file"
                accept=".zip"
                onChange={handleFileUpload}
                className="file-input"
              />
              {queryPackageFile && (
                <div className="file-info">
                  <p className="file-name">Selected: {queryPackageFile.name}</p>
                  {uploadProgress > 0 && uploadProgress < 100 && (
                    <div className="upload-progress">
                      <div
                        className="progress-bar"
                        style={{ width: `${uploadProgress}%` }}
                      />
                      <span className="progress-text">{uploadProgress}%</span>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {selectedMethod === 'ipfs' && (
            <div className="cid-input">
              <input
                type="text"
                placeholder="Enter Query Package CID"
                value={queryPackageCid}
                onChange={(e) => setQueryPackageCid(e.target.value)}
              />
            </div>
          )}
        </div>

        <div className="actions">
          <button
            className="primary"
            onClick={handleRunQuery}
            disabled={
              loadingResults ||
              (selectedMethod === 'file' && !queryPackageFile) ||
              (selectedMethod === 'ipfs' && !queryPackageCid.trim())
            }
          >
            {loadingResults ? (
              <>
                <span className="spinner"></span>
                {transactionStatus || 'Processing...'}
              </>
            ) : (
              'Run Query'
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

export default RunQuery;