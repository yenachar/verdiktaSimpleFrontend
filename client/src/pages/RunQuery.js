/* global BigInt */
// src/pages/RunQuery.js
import React, { useState } from 'react';
// Import ethers along with parseEther from ethers v6 (we no longer import BigNumber)
import { ethers, parseEther } from 'ethers';
import { PAGES } from '../App';
import { fetchWithRetry, tryParseJustification } from '../utils/fetchUtils';
import { createQueryPackageArchive } from '../utils/packageUtils';
import { uploadToServer } from '../utils/serverUtils';
import { getAugmentedQueryText } from '../utils/queryUtils';
import {
  CONTRACT_ABI,
  switchToBaseSepolia,
  // checkContractFunding,
} from '../utils/contractUtils';

// Import the LINK token ABI (make sure this file exists at src/utils/LINKTokenABI.json)
import LINK_TOKEN_ABI from '../utils/LINKTokenABI.json';

// Set the LINK token address for your network (example for Sepolia)
const LINK_TOKEN_ADDRESS = "0x779877A7B0D9E8603169DdbD7836e478b4624789";

// Default query package CID for example/testing
const DEFAULT_QUERY_CID = 'QmSnynnZVufbeb9GVNLBjxBJ45FyHgjPYUHTvMK5VmQZcS';

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

// Check and prompt for LINK approval if needed.
async function approveLinkSpending(requiredAmount, provider, walletAddress, aggregatorAddress, linkTokenAddress) {
  try {
    console.log("Current allowance check skipped - proceeding with approval");
    
    // Use the provider's signer directly
    const signer = await provider.getSigner();
    
    // Create contract instance with signer
    const linkContract = new ethers.Contract(linkTokenAddress, LINK_TOKEN_ABI, signer);
    
    console.log("Approving LINK tokens...");
    const tx = await linkContract.approve(aggregatorAddress, requiredAmount);
    
    console.log("Approval transaction sent:", tx.hash);
    await tx.wait();
    console.log("Approval confirmed");
  } catch (error) {
    console.error("Error in LINK approval:", error);
    throw new Error(`LINK approval failed: ${error.message}`);
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
  setOutcomeLabels,
  // New props for the aggregator parameters (passed from App.js)
  alpha,
  maxFee,
  estimatedBaseCost,
  maxFeeBasedScalingFactor,
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

    // 1) Connect and switch to Base Sepolia
    let provider = new ethers.BrowserProvider(window.ethereum);
    provider = await switchToBaseSepolia(provider);
    const signer = await provider.getSigner();
    const contract = new ethers.Contract(contractAddress, CONTRACT_ABI, signer);

    // 2) Check contract funding
    // setTransactionStatus?.('Checking contract funding...');
    // await checkContractFunding(contract, provider);
    const config = await contract.getContractConfig();
    const linkTokenAddress = config.linkAddr;


      // 3) Process query package based on selected method (config, file, or IPFS)
      let cid;
      switch (selectedMethod) {
        case 'config': {
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
          const augmentedQueryText = getAugmentedQueryText(queryText, hyperlinks);
          const queryFileContent = {
            query: augmentedQueryText,
            references: [
              ...supportingFiles.map((_, i) => `supportingFile${i + 1}`),
              ...ipfsCids.map((c) => c.name)
            ],
            outcomes: outcomeLabels
          };
          setTransactionStatus?.('Creating ZIP package...');
          const archiveBlob = await createQueryPackageArchive(
            queryFileContent,
            supportingFiles,
            ipfsCids,
            manifest
          );
          setTransactionStatus?.('Uploading ZIP to server...');
          cid = await uploadToServer(archiveBlob, setUploadProgress);
          break;
        }
        case 'file': {
          if (!queryPackageFile) {
            throw new Error('No query package file provided');
          }
          setTransactionStatus?.('Uploading file to server...');
          cid = await uploadToServer(queryPackageFile, setUploadProgress);
          break;
        }
        case 'ipfs': {
          cid = queryPackageCid.trim() || DEFAULT_QUERY_CID;
          break;
        }
        default:
          throw new Error(`Invalid method: ${selectedMethod}`);
      }
      setCurrentCid?.(cid);



      // 4) Insert the LINK approval step seamlessly.
      // For example, if the aggregator requires approval for maxFee * (oraclesToPoll + clusterSize)
      const ORACLES_TO_POLL = 4;
      const CLUSTER_SIZE = 2;
    try {
      // Directly approve without checking allowance first
      const requiredApprovalAmount = maxFee*BigInt(ORACLES_TO_POLL+CLUSTER_SIZE);
      setTransactionStatus?.('Requesting LINK approval...');

      await approveLinkSpending(requiredApprovalAmount, provider, walletAddress, contractAddress, linkTokenAddress);
      console.log('Approval amount: ', requiredApprovalAmount.toString());  
      
    } catch (error) {
      console.error("LINK approval error:", error);
      // Continue even if approval fails - the contract will check if enough allowance exists
    }

      // 5) Send the transaction using the new aggregator method

      // Get the provider's fee data before sending the transaction
      const feeData = await provider.getFeeData();

      // Set your desired multipliers (using whole numbers and then dividing for precision)
      const priorityFeeMultiplier = 110; // 1.1 as an integer (110%)
      const maxFeeMultiplier = 110; // 1.1 as an integer (110%)
      const divider = 100; // Divider to get back to the correct scale

      // Apply multipliers and divide by 1000 to fix the scaling issue
      const adjustedPriorityFee = (feeData.maxPriorityFeePerGas * BigInt(priorityFeeMultiplier)) / BigInt(divider) / BigInt(1000);
      const adjustedMaxFee = (feeData.maxFeePerGas * BigInt(maxFeeMultiplier)) / BigInt(divider) / BigInt(1000);

      setTransactionStatus?.('Sending transaction...');
      const tx = await contract.requestAIEvaluationWithApproval(
        [cid],
        alpha,
        maxFee,
        estimatedBaseCost,
        maxFeeBasedScalingFactor,
        { 
          gasLimit: 5000000, // high current gas limit
          maxFeePerGas: adjustedMaxFee,
          maxPriorityFeePerGas: adjustedPriorityFee
        }
      );
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
            return contract.interface.parseLog({ topics: log.topics, data: log.data });
          } catch (e) {
            return null;
          }
        })
        .find(parsed => parsed && parsed.name === 'RequestAIEvaluation');
      if (!event) {
        throw new Error('RequestAIEvaluation event not found in transaction receipt');
      }
      const requestId = event.args.requestId;
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
      // 6) Navigate to the RESULTS page on success
      setTransactionStatus('');
      setCurrentPage(PAGES.RESULTS);
    } catch (error) {
      console.error('Error running query:', error);
      if (error.message.includes('Insufficient LINK tokens')) {
        const errorMessage = `Contract doesn't have enough LINK tokens to perform this operation.

This blockchain operation requires LINK tokens to pay for the AI jury service. Please contact the administrator to fund the contract.`;
        setTransactionStatus(`Error: Insufficient LINK tokens`);
        alert(errorMessage);
      } else if (error.message.includes('User rejected')) {
        setTransactionStatus(`Error: Transaction rejected`);
        alert('You rejected the transaction in your wallet. Please try again and approve the transaction.');
      } else {
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
                      <div className="progress-bar" style={{ width: `${uploadProgress}%` }} />
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
            disabled={loadingResults || (selectedMethod === 'file' && !queryPackageFile)}
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

