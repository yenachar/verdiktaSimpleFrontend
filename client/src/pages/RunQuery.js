// src/pages/RunQuery.js
import React, { useState } from 'react';
import { ethers } from 'ethers';
import { PAGES } from '../App';
import { fetchWithRetry, tryParseJustification } from '../utils/fetchUtils';
import { createQueryPackageArchive } from '../utils/packageUtils';
import { uploadToServer } from '../utils/serverUtils';
import { getAugmentedQueryText } from '../utils/queryUtils';
import {
  CONTRACT_ABI,
  switchToBaseSepolia,
  checkContractFunding,
} from '../utils/contractUtils';

// Default query package CID for example/testing
const DEFAULT_QUERY_CID = 'QmSnynnZVufbeb9GVNLBjxBJ45FyHgjPYUHTvMK5VmQZcS';

// Helper function to request AI evaluation and get requestId
async function requestAIEvaluation(contract, cid, setTransactionStatus) {
  const tx = await contract.requestAIEvaluation([cid], {
    gasLimit: 5000000,
    value: 0
  });
  console.log('Transaction sent:', tx);
  setTransactionStatus?.('Waiting for confirmation...');
  const receipt = await tx.wait();
  console.log('Transaction confirmed:', receipt);

  if (!receipt.logs?.length) {
    throw new Error('No logs in transaction receipt');
  }

  // Find the RequestAIEvaluation event in the receipt
  const event = receipt.logs
    .map(log => {
      try {
        return contract.interface.parseLog({ 
          topics: log.topics, 
          data: log.data 
        });
      } catch (e) {
        return null;
      }
    })
    .find(parsed => parsed && parsed.name === 'RequestAIEvaluation');

  if (!event) {
    throw new Error('RequestAIEvaluation event not found in transaction receipt');
  }

  return event.args.requestId;
}

// Helper function to poll for evaluation results
async function pollForEvaluationResults(
  contract,
  requestId,
  setTransactionStatus,
  setOutcomes,
  setJustification,
  setResultCid,
  setResultTimestamp,
  setOutcomeLabels
) {
  setTransactionStatus?.('Waiting for evaluation results...');

  // Poll for results
  let attempts = 0;
  const maxAttempts = 60;
  let foundEvaluation = null;

  while (!foundEvaluation && attempts < maxAttempts) {
    attempts++;
    try {
      const result = await contract.getEvaluation(requestId);
      const [likelihoods, justificationCid, exists] = result;
      if (exists && likelihoods?.length > 0) {
        foundEvaluation = result;
        break;
      }
    } catch (err) {
      console.error('Polling error:', err);
    }
    await new Promise((resolve) => setTimeout(resolve, 5000));
  }
  if (!foundEvaluation) {
    throw new Error('Evaluation results not received in time');
  }

  const [likelihoods, justificationCid] = foundEvaluation;
  setOutcomes?.(likelihoods.map(Number));
  setJustification?.('Loading justification...');
  setResultCid?.(justificationCid);

  // Fetch justification
  setTransactionStatus?.('Fetching justification from server...');
  try {
    const response = await fetchWithRetry(justificationCid);
    const justificationText = await tryParseJustification(
      response,
      justificationCid,
      setOutcomes,
      setResultTimestamp,
      setOutcomeLabels
    );
    setJustification?.(justificationText);
  } catch (error) {
    console.error('Justification fetch error:', error);
    setJustification?.(`Error loading justification: ${error.message}`);
  }
}

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
  setCurrentPage,
  hyperlinks,
  setOutcomeLabels
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

      // 1) Connect + switch to Base Sepolia
      let provider = new ethers.BrowserProvider(window.ethereum);
      provider = await switchToBaseSepolia(provider);
      const signer = await provider.getSigner();
      const contract = new ethers.Contract(contractAddress, CONTRACT_ABI, signer);

      // 2) Check contract funding
      setTransactionStatus?.('Checking contract funding...');
      await checkContractFunding(contract, provider);

      // 3) Different logic per method
      switch (selectedMethod) {
        case 'config': {
          // Build + upload from current config
          setTransactionStatus?.('Building archive from config...');
          const manifest = {
            version: '1.0',
            primary: { filename: 'primary_query.json' },
            juryParameters: {
              NUMBER_OF_OUTCOMES: outcomeLabels.length,
              AI_NODES: juryNodes.map((node) => ({
                AI_PROVIDER: node.provider,
                AI_MODEL: node.model,
                NO_COUNTS: node.runs,
                WEIGHT: node.weight
              })),
              ITERATIONS: iterations
            }
          };

          // Primary query JSON with hyperlinks
          const augmentedQueryText = getAugmentedQueryText(queryText, hyperlinks);
          const queryFileContent = {
            query: augmentedQueryText,
            references: [
              ...supportingFiles.map((_, i) => `supportingFile${i + 1}`),
              ...ipfsCids.map((c) => c.name)
            ],
            outcomes: outcomeLabels
          };

          // Create ZIP
          setTransactionStatus?.('Creating ZIP package...');
          const archiveBlob = await createQueryPackageArchive(
            queryFileContent,
            supportingFiles,
            ipfsCids,
            manifest
          );

          // Upload to server => get CID
          setTransactionStatus?.('Uploading ZIP to server...');
          const cid = await uploadToServer(archiveBlob, setUploadProgress);
          setCurrentCid?.(cid);

          // Send request to contract and get requestId
          setTransactionStatus?.('Sending transaction...');
          const requestId = await requestAIEvaluation(contract, cid, setTransactionStatus);

          // Poll for results using requestId
          await pollForEvaluationResults(
            contract,
            requestId,
            setTransactionStatus,
            setOutcomes,
            setJustification,
            setResultCid,
            setResultTimestamp,
            setOutcomeLabels
          );
          break;
        }

        case 'file': {
          if (!queryPackageFile) {
            throw new Error('No query package file provided');
          }
          setTransactionStatus?.('Uploading file to server...');
          const cid = await uploadToServer(queryPackageFile, setUploadProgress);
          setCurrentCid?.(cid);

          setTransactionStatus?.('Sending transaction...');
          const requestId = await requestAIEvaluation(contract, cid, setTransactionStatus);

          await pollForEvaluationResults(
            contract,
            requestId,
            setTransactionStatus,
            setOutcomes,
            setJustification,
            setResultCid,
            setResultTimestamp,
            setOutcomeLabels
          );
          break;
        }

        case 'ipfs': {
          const cidToUse = queryPackageCid.trim() || DEFAULT_QUERY_CID;
          setCurrentCid?.(cidToUse);

          setTransactionStatus?.('Sending transaction...');
          const requestId = await requestAIEvaluation(contract, cidToUse, setTransactionStatus);

          await pollForEvaluationResults(
            contract,
            requestId,
            setTransactionStatus,
            setOutcomes,
            setJustification,
            setResultCid,
            setResultTimestamp,
            setOutcomeLabels
          );
          break;
        }

        default:
          throw new Error(`Invalid method: ${selectedMethod}`);
      }

      // If successful, go to the RESULTS page
      setTransactionStatus('');
      setCurrentPage(PAGES.RESULTS);
    } catch (error) {
      console.error('Error running query:', error);
      
      // Check if the error is related to insufficient LINK tokens
      if (error.message.includes('Insufficient LINK tokens')) {
        const errorMessage = `Contract doesn't have enough LINK tokens to perform this operation. 
        
This is a blockchain operation that requires LINK tokens to pay for the AI jury service. Please contact the administrator to fund the contract with LINK tokens.`;
        
        setTransactionStatus(`Error: Insufficient LINK tokens`);
        alert(errorMessage);
      } else if (error.message.includes('User rejected')) {
        // User rejected the transaction in their wallet
        setTransactionStatus(`Error: Transaction rejected`);
        alert('You rejected the transaction in your wallet. Please try again and approve the transaction.');
      } else {
        // Generic error handling for other errors
        setTransactionStatus(`Error: ${error.message}`);
        alert('An error occurred while processing the query. Check the console for details.');
      }
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
                {hyperlinks && hyperlinks.length > 0 && (
                  <div>
                    <strong>Reference URLs:</strong>
                    <ul>
                      {hyperlinks.map((link, index) => (
                        <li key={index}>
                          <a href={link.url} target="_blank" rel="noopener noreferrer" className="url-value">
                            {link.url}
                          </a>
                          {link.description && (
                            <span className="url-description">- {link.description}</span>
                          )}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
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
              <label>Enter Query Package CID</label>
              <input
                type="text"
                className={!queryPackageCid ? 'default-value' : ''}
                value={queryPackageCid || DEFAULT_QUERY_CID}
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
              (selectedMethod === 'file' && !queryPackageFile)
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
