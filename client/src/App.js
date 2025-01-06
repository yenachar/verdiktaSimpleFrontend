// src/App.js

import React, { useState } from 'react';
import { Chart, CategoryScale, LinearScale, BarElement } from 'chart.js';
import { Bar } from 'react-chartjs-2';
import './App.css';
import { ethers } from 'ethers';
import FormData from 'form-data';

// Register Chart.js components
Chart.register(CategoryScale, LinearScale, BarElement);

// Navigation constants
const PAGES = {
  DEFINE_QUERY: 'DEFINE_QUERY',
  JURY_SELECTION: 'JURY_SELECTION',
  RUN: 'RUN',
  RESULTS: 'RESULTS'
};

// Add the contract ABI near the top of the file
const CONTRACT_ABI = [
  'function requestAIEvaluation(string[] memory cids) public returns (bytes32 requestId)',
  'function evaluations(bytes32 requestId) public view returns (uint256[] likelihoods, string justificationCID)',
  'function setChainlinkToken(address _link)',
  'function setChainlinkOracle(address _oracle)',
  'event RequestAIEvaluation(bytes32 indexed requestId, string[] cids)',
  'event FulfillAIEvaluation(bytes32 indexed requestId, uint256[] likelihoods, string justificationCID)',
  'event ChainlinkRequested(bytes32 indexed id)',
  'event ChainlinkFulfilled(bytes32 indexed id)',
  'function getContractConfig() public view returns (address oracleAddr, address linkAddr, bytes32 jobid, uint256 currentFee)',
  'event Debug1(address linkToken, address oracle, uint256 fee, uint256 balance, bytes32 jobId)',
  'function getEvaluation(bytes32 _requestId) public view returns (uint256[] memory likelihoods, string memory justificationCID, bool exists)'
];

// Add near the top with other constants
const CONTRACT_ADDRESSES = (process.env.REACT_APP_CONTRACT_ADDRESSES || '').split(',');
const CONTRACT_NAMES = (process.env.REACT_APP_CONTRACT_NAMES || '').split(',');

// Create a mapping of addresses to names
const CONTRACT_OPTIONS = CONTRACT_ADDRESSES.map((address, index) => ({
  address,
  name: CONTRACT_NAMES[index] || `Contract ${index + 1}`
}));

// Add this function near the top with other utility functions
const checkContractFunding = async (contract, provider) => {
  const config = await contract.getContractConfig();
  const linkToken = new ethers.Contract(
    config.linkAddr,
    ['function balanceOf(address) view returns (uint256)'],
    provider
  );
  
  const balance = await linkToken.balanceOf(contract.target);
  const fee = config.currentFee;
  
  console.log("Contract LINK balance:", ethers.formatEther(balance));
  console.log("Required fee:", ethers.formatEther(fee));
  
  if (balance < fee) {
    throw new Error(`Insufficient LINK tokens. Contract needs at least ${ethers.formatEther(fee)} LINK but has ${ethers.formatEther(balance)} LINK`);
  }
  
  return config;
};

// Replace the SERVER_URL constant with one that reads from env
const SERVER_URL = process.env.REACT_APP_SERVER_URL || 'http://localhost:5000';

// Update uploadToServer to use the full URL
const uploadToServer = async (file) => {
  const formData = new FormData();
  formData.append('file', file);

  try {
    const response = await fetch(`${SERVER_URL}/api/upload`, {
      method: 'POST',
      body: formData,
      mode: 'cors',
      headers: {
        'Accept': 'application/json',
      }
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.details || 'Upload failed');
    }

    const data = await response.json();
    return data.cid;
  } catch (error) {
    console.error('Error uploading to server:', error);
    throw new Error('Failed to upload file to IPFS');
  }
};

// Add this utility function near the top with other utility functions
const fetchWithRetry = async (url, retries = 3, delay = 2000) => {
  for (let i = 0; i < retries; i++) {
    try {
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      return response;
    } catch (error) {
      console.log(`Attempt ${i + 1} failed:`, error);
      if (i === retries - 1) throw error;
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
};

// Add this utility function to help with debugging IPFS responses
const tryParseJustification = async (response, cid, setOutcomes, setResultTimestamp) => {
  const rawText = await response.text();
  console.log('Raw IPFS response:', {
    cid,
    contentType: response.headers.get('content-type'),
    length: rawText.length,
    preview: rawText.slice(0, 200)
  });

  try {
    // Try to parse as JSON first
    const data = JSON.parse(rawText);
    console.log('Parsed JSON data:', data);
    
    // If we have a justification field, use it
    if (data.justification) {
      // Also set the outcomes if they exist
      if (data.aggregatedScore) {
        setOutcomes(data.aggregatedScore);
      }
      // Also set the timestamp if it exists
      if (data.timestamp) {
        setResultTimestamp(data.timestamp);
      }
      return data.justification;
    }
    
    // Fallback to stringifying the whole response if no justification field
    return JSON.stringify(data, null, 2);
  } catch (parseError) {
    console.log('Not valid JSON, using as plain text');
    return rawText;
  }
};

function App() {
  // Navigation state
  const [currentPage, setCurrentPage] = useState(PAGES.DEFINE_QUERY);
  
  // Query Definition state
  const [queryText, setQueryText] = useState('');
  const [numOutcomes, setNumOutcomes] = useState(2);
  const [supportingFiles, setSupportingFiles] = useState([]);
  const [ipfsCids, setIpfsCids] = useState([]);
  
  // Jury Selection state
  const [iterations, setIterations] = useState(1);
  const [juryNodes, setJuryNodes] = useState([{
    provider: 'OpenAI',
    model: 'gpt-4o',
    runs: 1,
    weight: 1.0,
    id: Date.now() // unique ID for each node
  }]);
  
  // Results state
  const [resultCid, setResultCid] = useState('QmExample...123');
  const [justification, setJustification] = useState(
    "Based on the provided query and supporting documentation, the AI Jury has reached the following conclusion:\n\n" +
    "The majority opinion (60%) favors Outcome 2, with a significant minority (40%) supporting Outcome 1. " +
    "This decision was reached after careful consideration of all submitted evidence and multiple rounds of deliberation. " +
    "Key factors influencing this decision include...\n\n" +
    "The jury particularly noted the strength of arguments presented in supporting document A, while also considering " +
    "the counterpoints raised in document B. The final distribution of opinions reflects both the complexity of the " +
    "issue and the relative weight of evidence presented."
  );
  const [outcomes, setOutcomes] = useState([400000, 600000]);

  // Add these new state variables for the Results page
  const [lookupCid, setLookupCid] = useState('');
  const [loadingResults, setLoadingResults] = useState(false);

  // Add this state near your other state declarations
  const [activeTooltipId, setActiveTooltipId] = useState(null);

  const [currentCid, setCurrentCid] = useState('');

  // Add new state for the Run page
  const [selectedMethod, setSelectedMethod] = useState('config'); // 'config', 'file', or 'ipfs'
  const [queryPackageFile, setQueryPackageFile] = useState(null);
  const [queryPackageCid, setQueryPackageCid] = useState('QmcMjSr4pL8dpNzjhGWaZ6vRmvv7fN3xsLJCDpqVsH7gv7');

  const [isConnected, setIsConnected] = useState(false);
  const [walletAddress, setWalletAddress] = useState('');
  const [contractAddress, setContractAddress] = useState(CONTRACT_ADDRESSES[0] || '0x2E67c4D565C55E31514eDd68E42bFBb50a2C49F1');

  // Add new state for transaction status
  const [transactionStatus, setTransactionStatus] = useState('');

  // Add new state for timestamp
  const [resultTimestamp, setResultTimestamp] = useState('');

  // Add new state for upload progress
  const [uploadProgress, setUploadProgress] = useState(0);

  const connectWallet = async () => {
    try {
      console.log('Connecting wallet...');
      if (!window.ethereum) {
        alert('Please install MetaMask!');
        return;
      }

      console.log('MetaMask detected, requesting accounts...');
      const provider = new ethers.BrowserProvider(window.ethereum);
      const accounts = await provider.send('eth_requestAccounts', []);
      console.log('Accounts:', accounts);
      const address = accounts[0];
      setWalletAddress(address);
      setIsConnected(true);
      console.log('Wallet connected:', address);

      // Add event listener for account changes
      window.ethereum.on('accountsChanged', (accounts) => {
        if (accounts.length === 0) {
          // User disconnected wallet
          setIsConnected(false);
          setWalletAddress('');
        } else {
          // User switched accounts
          setWalletAddress(accounts[0]);
        }
      });

    } catch (error) {
      console.error('Error connecting to MetaMask:', error);
      alert('Failed to connect to MetaMask.');
    }
  };

  const renderHeader = () => (
    <header className="app-header">
      <div className="brand">AI Jury System</div>
      <nav className="main-nav">
        <button 
          className={currentPage === PAGES.DEFINE_QUERY ? 'active' : ''}
          onClick={() => setCurrentPage(PAGES.DEFINE_QUERY)}
        >
          Define Query
        </button>
        <button 
          className={currentPage === PAGES.JURY_SELECTION ? 'active' : ''}
          onClick={() => setCurrentPage(PAGES.JURY_SELECTION)}
        >
          Jury Selection
        </button>
        <button 
          className={currentPage === PAGES.RUN ? 'active' : ''}
          onClick={() => setCurrentPage(PAGES.RUN)}
        >
          Run
        </button>
        <button 
          className={currentPage === PAGES.RESULTS ? 'active' : ''}
          onClick={() => setCurrentPage(PAGES.RESULTS)}
        >
          Results
        </button>
      </nav>
      <div className="contract-wallet-section">
        <div className="contract-selector">
          <select
            value={contractAddress}
            onChange={(e) => setContractAddress(e.target.value)}
            className="contract-select"
          >
            {CONTRACT_OPTIONS.map((contract, index) => (
              <option key={index} value={contract.address}>
                {contract.name}
              </option>
            ))}
          </select>
        </div>
        <div className="wallet-connection">
          {isConnected ? (
            <div className="wallet-info">
              <span className="wallet-address">{walletAddress.slice(0, 6)}...{walletAddress.slice(-4)}</span>
              <span className="connection-status">Connected</span>
            </div>
          ) : (
            <button className="connect-wallet" onClick={connectWallet}>
              Connect Wallet
            </button>
          )}
        </div>
      </div>
    </header>
  );

  const renderQueryDefinition = () => (
    <div className="page query-definition">
      <h2>Enter the Question for the AI Jury</h2>
      
      <section className="query-section">
        <div className="form-group">
          <label htmlFor="queryText">Provide the question or scenario you want the AI Jury to deliberate on</label>
          <textarea
            id="queryText"
            value={queryText}
            onChange={(e) => setQueryText(e.target.value)}
            placeholder="Enter your query here..."
            rows={5}
          />
        </div>

        <div className="form-group">
          <div className="label-with-tooltip">
            <label htmlFor="numOutcomes">Number of Possible Outcomes</label>
            <div 
              className="tooltip-trigger"
              onMouseEnter={() => setActiveTooltipId('outcomes')}
              onMouseLeave={() => setActiveTooltipId(null)}
            >
              ⓘ
              {activeTooltipId === 'outcomes' && (
                <div className="tooltip-content">
                  For a True/False question, enter 2. For a multiple-choice scenario with four possible answers, enter 4.
                </div>
              )}
            </div>
          </div>
          <div className="numeric-input">
            <button onClick={() => setNumOutcomes(prev => Math.max(2, prev - 1))}>-</button>
            <input
              type="number"
              id="numOutcomes"
              value={numOutcomes}
              onChange={(e) => setNumOutcomes(Math.max(2, parseInt(e.target.value) || 2))}
              min="2"
            />
            <button onClick={() => setNumOutcomes(prev => prev + 1)}>+</button>
          </div>
        </div>
      </section>

      <div className="section-partition"></div>

      <section className="supporting-data-section">
        <h3>Supporting Data</h3>
        
        <div className="form-group">
          <div className="label-with-tooltip">
            <label>Upload Files</label>
            <div 
              className="tooltip-trigger"
              onMouseEnter={() => setActiveTooltipId('files')}
              onMouseLeave={() => setActiveTooltipId(null)}
            >
              ⓘ
              {activeTooltipId === 'files' && (
                <div className="tooltip-content">
                  Upload any relevant documents, images, or data files that will help the AI Jury make an informed decision.
                </div>
              )}
            </div>
          </div>
          <input
            type="file"
            multiple
            onChange={(e) => {
              const files = Array.from(e.target.files || []).map(file => ({
                file,
                description: '',
                id: Date.now() + Math.random() // ensure unique IDs
              }));
              setSupportingFiles(prev => [...prev, ...files]);
            }}
          />
          {supportingFiles.length > 0 && (
            <ul className="file-list">
              {supportingFiles.map((fileObj, index) => (
                <li key={fileObj.id}>
                  <div className="file-entry">
                    <span className="file-name">{fileObj.file.name}</span>
                    <input
                      type="text"
                      placeholder="Add description..."
                      value={fileObj.description}
                      onChange={(e) => {
                        setSupportingFiles(prev => prev.map((item, i) => 
                          i === index ? { ...item, description: e.target.value } : item
                        ));
                      }}
                      className="description-input"
                    />
                    <button 
                      onClick={() => setSupportingFiles(prev => prev.filter((_, i) => i !== index))}
                      className="remove-button"
                    >
                      ×
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="form-group">
          <div className="label-with-tooltip">
            <label>Add IPFS CID</label>
            <div 
              className="tooltip-trigger"
              onMouseEnter={() => setActiveTooltipId('ipfs')}
              onMouseLeave={() => setActiveTooltipId(null)}
            >
              ⓘ
              {activeTooltipId === 'ipfs' && (
                <div className="tooltip-content">
                  Enter Content IDs (CIDs) from the InterPlanetary File System (IPFS) to include external data in your query. This allows you to reference data stored on the decentralized web.
                </div>
              )}
            </div>
          </div>
          <div className="cid-input">
            <input
              type="text"
              placeholder="Enter IPFS CID"
              value={currentCid || ''}
              onChange={(e) => setCurrentCid(e.target.value)}
              onKeyPress={(e) => {
                if (e.key === 'Enter' && e.target.value.trim()) {
                  setIpfsCids(prev => [...prev, {
                    cid: currentCid.trim(),
                    description: '',
                    id: Date.now() + Math.random()
                  }]);
                  setCurrentCid('');
                }
              }}
            />
            <button 
              onClick={() => {
                if (currentCid.trim()) {
                  setIpfsCids(prev => [...prev, {
                    cid: currentCid.trim(),
                    description: '',
                    id: Date.now() + Math.random()
                  }]);
                  setCurrentCid('');
                }
              }}
              className="primary"
            >
              Add CID
            </button>
          </div>
          {ipfsCids.length > 0 && (
            <ul className="cid-list">
              {ipfsCids.map((cidObj, index) => (
                <li key={cidObj.id}>
                  <div className="cid-entry">
                    <span className="cid-value">{cidObj.cid}</span>
                    <input
                      type="text"
                      placeholder="Add description..."
                      value={cidObj.description}
                      onChange={(e) => {
                        setIpfsCids(prev => prev.map((item, i) => 
                          i === index ? { ...item, description: e.target.value } : item
                        ));
                      }}
                      className="description-input"
                    />
                    <button 
                      onClick={() => setIpfsCids(prev => prev.filter((_, i) => i !== index))}
                      className="remove-button"
                    >
                      ×
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>

      <div className="actions">
        <button 
          className="primary"
          onClick={() => setCurrentPage(PAGES.JURY_SELECTION)}
          disabled={!queryText.trim()}
        >
          Next: Jury Selection
        </button>
      </div>
    </div>
  );

  const renderJurySelection = () => {
    // AI Provider options and their corresponding models
    const providerModels = {
      OpenAI: ['gpt-3.5-turbo', 'gpt-4', 'gpt-4o'],
      Anthropic: ['claude-2.1', 'claude-3-sonnet', 'claude-3.5-sonnet'],
      'Open-source': ['llava', 'llama-3.1', 'llama-3.2', 'phi3']
    };

    const addJuryNode = () => {
      setJuryNodes(prev => [...prev, {
        provider: 'OpenAI',
        model: 'gpt-4o',
        runs: 1,
        weight: 1.0,
        id: Date.now()
      }]);
    };

    const updateJuryNode = (id, field, value) => {
      setJuryNodes(prev => prev.map(node => {
        if (node.id === id) {
          const updatedNode = { ...node, [field]: value };
          // If provider changes, update model to first available model
          if (field === 'provider') {
            updatedNode.model = providerModels[value][0];
          }
          return updatedNode;
        }
        return node;
      }));
    };

    const removeJuryNode = (id) => {
      setJuryNodes(prev => prev.filter(node => node.id !== id));
    };

    return (
      <div className="page jury-selection">
        <h2>Jury Selection</h2>
        
        <div className="configuration-summary">
          <p>Query will have {numOutcomes} possible outcomes</p>
        </div>

        <section className="iterations-section">
          <div className="form-group">
            <div className="label-with-tooltip">
              <label htmlFor="iterations">Number of Iterations</label>
              <div 
                className="tooltip-trigger"
                onMouseEnter={() => setActiveTooltipId('iterations')}
                onMouseLeave={() => setActiveTooltipId(null)}
              >
                ⓘ
                {activeTooltipId === 'iterations' && (
                  <div className="tooltip-content">
                    The jury process can be repeated multiple times. Each iteration takes the previous results into account, potentially refining and improving the outcome through multiple rounds of deliberation.
                  </div>
                )}
              </div>
            </div>
            <div className="numeric-input">
              <button onClick={() => setIterations(prev => Math.max(1, prev - 1))}>-</button>
              <input
                type="number"
                id="iterations"
                value={iterations}
                onChange={(e) => setIterations(Math.max(1, parseInt(e.target.value) || 1))}
                min="1"
              />
              <button onClick={() => setIterations(prev => prev + 1)}>+</button>
            </div>
          </div>
        </section>

        <section className="jury-table">
          <h3>AI Jury Configuration</h3>
          <div className="jury-table-header">
            <div className="label-with-tooltip">
              Provider
              <div 
                className="tooltip-trigger"
                onMouseEnter={() => setActiveTooltipId('provider')}
                onMouseLeave={() => setActiveTooltipId(null)}
              >
                ⓘ
                {activeTooltipId === 'provider' && (
                  <div className="tooltip-content">
                    The AI service provider that will process this part of the query. Different providers may have different specialties and capabilities.
                  </div>
                )}
              </div>
            </div>
            <div className="label-with-tooltip">
              Model
              <div 
                className="tooltip-trigger"
                onMouseEnter={() => setActiveTooltipId('model')}
                onMouseLeave={() => setActiveTooltipId(null)}
              >
                ⓘ
                {activeTooltipId === 'model' && (
                  <div className="tooltip-content">
                    The specific AI model to use. Different models have different capabilities, costs, and processing speeds. More advanced models typically provide more nuanced responses.
                  </div>
                )}
              </div>
            </div>
            <div className="label-with-tooltip">
              Runs
              <div 
                className="tooltip-trigger"
                onMouseEnter={() => setActiveTooltipId('runs')}
                onMouseLeave={() => setActiveTooltipId(null)}
              >
                ⓘ
                {activeTooltipId === 'runs' && (
                  <div className="tooltip-content">
                    The number of times this specific model will process the query. Multiple runs can help reduce random variation and increase confidence in the results.
                  </div>
                )}
              </div>
            </div>
            <div className="label-with-tooltip">
              Weight
              <div 
                className="tooltip-trigger"
                onMouseEnter={() => setActiveTooltipId('weight')}
                onMouseLeave={() => setActiveTooltipId(null)}
              >
                ⓘ
                {activeTooltipId === 'weight' && (
                  <div className="tooltip-content">
                    The relative importance of this model's output in the final result (0-1). Higher weights give more influence to this model's decisions.
                  </div>
                )}
              </div>
            </div>
            <div></div>
          </div>
          
          {juryNodes.map(node => (
            <div key={node.id} className="jury-node">
              <div>
                <select
                  value={node.provider}
                  onChange={(e) => updateJuryNode(node.id, 'provider', e.target.value)}
                >
                  {Object.keys(providerModels).map(provider => (
                    <option key={provider} value={provider}>{provider}</option>
                  ))}
                </select>
              </div>
              
              <div>
                <select
                  value={node.model}
                  onChange={(e) => updateJuryNode(node.id, 'model', e.target.value)}
                >
                  {providerModels[node.provider].map(model => (
                    <option key={model} value={model}>{model}</option>
                  ))}
                </select>
              </div>
              
              <div>
                <input
                  type="number"
                  value={node.runs}
                  onChange={(e) => updateJuryNode(node.id, 'runs', Math.max(1, parseInt(e.target.value) || 1))}
                  min="1"
                  className="runs-input"
                />
              </div>
              
              <div>
                <input
                  type="number"
                  value={node.weight}
                  onChange={(e) => updateJuryNode(node.id, 'weight', Math.min(1, Math.max(0, parseFloat(e.target.value) || 0)))}
                  step="0.1"
                  min="0"
                  max="1"
                  className="weight-input"
                />
              </div>
              
              <div>
                <button 
                  className="remove-node"
                  onClick={() => removeJuryNode(node.id)}
                  disabled={juryNodes.length === 1}
                >
                  ×
                </button>
              </div>
            </div>
          ))}
          
          <button className="add-node" onClick={addJuryNode}>
            Add Another AI Model
          </button>
        </section>

        <div className="actions">
          <button 
            className="secondary"
            onClick={() => setCurrentPage(PAGES.DEFINE_QUERY)}
          >
            Back
          </button>
          <button 
            className="primary"
            onClick={() => setCurrentPage(PAGES.RUN)}
            disabled={juryNodes.length === 0}
          >
            Next: Run Query
          </button>
        </div>
      </div>
    );
  };

  const handleRunQuery = async () => {
    if (!isConnected) {
      alert('Please connect your wallet first');
      return;
    }

    setLoadingResults(true);
    setTransactionStatus('Preparing transaction...');

    try {
      const provider = new ethers.BrowserProvider(window.ethereum);
      const signer = await provider.getSigner();
      const contract = new ethers.Contract(contractAddress, CONTRACT_ABI, signer);

      // Check funding before sending transaction
      setTransactionStatus('Checking contract funding...');
      const fundingStatus = await checkContractFunding(contract, provider);
      console.log("Funding status:", fundingStatus);

      switch (selectedMethod) {
        case 'config': {
          // TODO: Implement packaging current config into zip and uploading to IPFS
          break;
        }
        case 'file': {
          setTransactionStatus('Uploading file to IPFS...');
          setUploadProgress(0);
          
          const ipfsCid = await uploadToServer(queryPackageFile);
          console.log('File uploaded to IPFS with CID:', ipfsCid);
          
          setTransactionStatus('Sending transaction...');
          const tx = await contract.requestAIEvaluation([ipfsCid], {
            gasLimit: 1000000,
            value: 0
          });
          
          console.log("Transaction sent:", tx);
          setTransactionStatus('Waiting for confirmation...');
          
          const receipt = await tx.wait();
          console.log("Transaction confirmed:", receipt);

          // Extract requestId from events
          let requestId;
          console.log("Processing logs:", receipt.logs);

          for (const log of receipt.logs) {
            try {
              const parsedLog = contract.interface.parseLog({
                topics: log.topics,
                data: log.data
              });
              
              console.log("Successfully parsed log:", {
                name: parsedLog.name,
                args: parsedLog.args
              });

              if (parsedLog.name === 'RequestAIEvaluation') {
                requestId = parsedLog.args.requestId;
                console.log("Found requestId:", requestId);
                break;
              }
            } catch (e) {
              // Skip logs that aren't from our contract
              continue;
            }
          }

          if (!requestId) {
            console.log("All logs processed, but no RequestAIEvaluation event found");
            throw new Error('Request ID not found in transaction logs');
          }

          // Poll for results
          setTransactionStatus('Waiting for evaluation results...');
          let evaluation;
          let pollCount = 0;
          const maxPolls = 30;

          while (!evaluation && pollCount < maxPolls) {
            try {
              console.log(`Polling attempt ${pollCount + 1}/${maxPolls}...`);
              const result = await contract.getEvaluation(requestId);
              if (result.exists) {
                evaluation = result;
                break;
              } else {
                console.log("Evaluation not ready yet");
              }
            } catch (err) {
              console.error("Polling error:", err);
            }
            await new Promise(resolve => setTimeout(resolve, 5000));
            pollCount++;
          }

          if (!evaluation) {
            throw new Error('Evaluation results not received in time');
          }

          // Process results
          console.log("Processing final results...");
          setOutcomes(evaluation.likelihoods.map(num => Number(num)));
          setJustification("Loading justification..."); // Temporary text while fetching
          setResultCid(evaluation.justificationCID);

          // Fetch justification content
          try {
            console.log(`Fetching justification from IPFS CID: ${evaluation.justificationCID}`);
            const response = await fetchWithRetry(`https://ipfs.io/ipfs/${evaluation.justificationCID}`);
            
            const justificationText = await tryParseJustification(
              response, 
              evaluation.justificationCID,
              setOutcomes,
              setResultTimestamp
            );
            setJustification(justificationText);
          } catch (error) {
            console.error('Error fetching justification:', error);
            setJustification(`Error loading justification: ${error.message}`);
          }

          setCurrentPage(PAGES.RESULTS);
          break;
        }
        case 'ipfs': {
          console.log("Starting IPFS CID evaluation...");
          
          // Ensure the contract is using the correct address
          const tx = await contract.requestAIEvaluation([queryPackageCid], {
            gasLimit: 1000000,
            value: 0
          });
          
          console.log("Transaction sent:", tx);
          setTransactionStatus('Waiting for confirmation...');
          
          const receipt = await tx.wait();
          console.log("Transaction confirmed:", receipt);

          // Extract requestId from events
          let requestId;
          console.log("Processing logs:", receipt.logs);

          for (const log of receipt.logs) {
            try {
              const parsedLog = contract.interface.parseLog({
                topics: log.topics,
                data: log.data
              });
              
              console.log("Successfully parsed log:", {
                name: parsedLog.name,
                args: parsedLog.args
              });

              if (parsedLog.name === 'RequestAIEvaluation') {
                requestId = parsedLog.args.requestId;
                console.log("Found requestId:", requestId);
                break;
              }
            } catch (e) {
              // Skip logs that aren't from our contract
              continue;
            }
          }

          if (!requestId) {
            console.log("All logs processed, but no RequestAIEvaluation event found");
            throw new Error('Request ID not found in transaction logs');
          }

          // Poll for results
          setTransactionStatus('Waiting for evaluation results...');
          let evaluation;
          let pollCount = 0;
          const maxPolls = 30;

          while (!evaluation && pollCount < maxPolls) {
            try {
              console.log(`Polling attempt ${pollCount + 1}/${maxPolls}...`);
              const result = await contract.getEvaluation(requestId);
              if (result.exists) {
                evaluation = result;
                break;
              } else {
                console.log("Evaluation not ready yet");
              }
            } catch (err) {
              console.error("Polling error:", err);
            }
            await new Promise(resolve => setTimeout(resolve, 5000));
            pollCount++;
          }

          if (!evaluation) {
            throw new Error('Evaluation results not received in time');
          }

          // Process results
          console.log("Processing final results...");
          setOutcomes(evaluation.likelihoods.map(num => Number(num)));
          setJustification("Loading justification..."); // Temporary text while fetching
          setResultCid(evaluation.justificationCID);

          // Fetch justification content
          try {
            console.log(`Fetching justification from IPFS CID: ${evaluation.justificationCID}`);
            const response = await fetchWithRetry(`https://ipfs.io/ipfs/${evaluation.justificationCID}`);
            
            const justificationText = await tryParseJustification(
              response, 
              evaluation.justificationCID,
              setOutcomes,
              setResultTimestamp
            );
            setJustification(justificationText);
          } catch (error) {
            console.error('Error fetching justification:', error);
            setJustification(`Error loading justification: ${error.message}`);
          }

          setCurrentPage(PAGES.RESULTS);
          break;
        }
        default:
          throw new Error('Invalid method selected');
      }
    } catch (error) {
      console.error('Error running query:', error);
      // Make the error message more user-friendly
      if (error.message.includes('Insufficient LINK tokens')) {
        setTransactionStatus('Error: Contract needs more LINK tokens to process requests');
        alert('The contract needs more LINK tokens to process requests. Please contact the contract administrator.');
      } else {
        setTransactionStatus('Error: ' + error.message);
        alert('An error occurred while processing the query. Check console for details.');
      }
    } finally {
      setLoadingResults(false);
      setTransactionStatus('');
      setUploadProgress(0);
    }
  };

  const renderRun = () => {
    const handleMethodChange = (method) => {
      setSelectedMethod(method);
    };

    const handleFileUpload = (event) => {
      const file = event.target.files[0];
      if (file && file.type === 'application/zip') {
        setQueryPackageFile(file);
      } else {
        // TODO: Show error message about invalid file type
        alert('Please upload a ZIP file');
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
              onClick={() => handleMethodChange('config')}
            >
              <h4>Use Current Configuration</h4>
              <p>Use the query and jury settings defined in the previous steps</p>
            </div>
            
            <div 
              className={`method-option ${selectedMethod === 'file' ? 'selected' : ''}`}
              onClick={() => handleMethodChange('file')}
            >
              <h4>Upload Query Package</h4>
              <p>Upload a ZIP file containing a complete query package</p>
            </div>
            
            <div 
              className={`method-option ${selectedMethod === 'ipfs' ? 'selected' : ''}`}
              onClick={() => handleMethodChange('ipfs')}
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
                  <p><strong>Query Text:</strong> {queryText}</p>
                  <p><strong>Outcomes:</strong> {numOutcomes}</p>
                  <p><strong>Supporting Files:</strong> {supportingFiles.length}</p>
                  <p><strong>IPFS CIDs:</strong> {ipfsCids.length}</p>
                  <p><strong>Jury Members:</strong> {juryNodes.length}</p>
                  <p><strong>Iterations:</strong> {iterations}</p>
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
  };

  const renderResults = () => {
    const handleLoadResults = async (cid) => {
      setLoadingResults(true);
      try {
        await new Promise(resolve => setTimeout(resolve, 1000));
        setResultCid(cid);
        setOutcomes([400000, 600000]);
        setJustification("This is a sample justification text that would come from the AI jury's deliberation...");
      } catch (error) {
        console.error('Error loading results:', error);
      } finally {
        setLoadingResults(false);
      }
    };

    const renderBarGraph = () => {
      if (!outcomes.length) return null;

      const data = {
        labels: outcomes.map((_, index) => `Outcome ${index + 1}`),
        datasets: [{
          label: 'Likelihood',
          data: outcomes,
          backgroundColor: outcomes.map((_, index) => 
            index === 0 ? 'rgba(94, 55, 244, 0.8)' : 'rgba(61, 35, 94, 0.8)'
          ),
          borderColor: outcomes.map((_, index) => 
            index === 0 ? '#5E37F4' : '#3D235E'
          ),
          borderWidth: 1
        }]
      };

      const options = {
        responsive: true,
        scales: {
          y: {
            beginAtZero: true,
            max: 1000000
          }
        },
        plugins: {
          tooltip: {
            callbacks: {
              label: (context) => {
                const value = context.raw;
                const percentage = ((value / 1000000) * 100).toFixed(1);
                return `${value.toLocaleString()} (${percentage}%)`;
              }
            }
          }
        }
      };

      return (
        <div className="results-chart">
          <Bar data={data} options={options} />
        </div>
      );
    };

    return (
      <div className="page results">
        <h2>Results</h2>

        {/* Configuration Summary Section */}
        <section className="configuration-summary">
          <h3>Query Configuration</h3>
          <div className="summary-details">
            <div className="query-text">
              <label>Query:</label>
              <div className="query-value">{queryText}</div>
            </div>
            <div className="config-stats">
              <span>Outcomes: {numOutcomes}</span>
              <span>Iterations: {iterations}</span>
              <span>Jury Members: {juryNodes.length}</span>
              <span>Supporting Files: {supportingFiles.length + ipfsCids.length}</span>
            </div>
          </div>
        </section>

        {/* Results Display Section */}
        {resultCid && (
          <section className="results-display">
            <div className="results-header">
              <div className="cid-display">
                <label>Result CID:</label>
                <div className="cid-value">
                  <a 
                    href={`https://ipfs.io/ipfs/${resultCid}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    title="View on IPFS"
                  >
                    {resultCid}
                  </a>
                  <button 
                    className="copy-button"
                    onClick={() => navigator.clipboard.writeText(resultCid)}
                    title="Copy to clipboard"
                  >
                    📋
                  </button>
                </div>
              </div>
              {resultTimestamp && (
                <div className="timestamp">
                  <label>Evaluation Time:</label>
                  <div className="timestamp-value">
                    {new Date(resultTimestamp).toLocaleString(undefined, {
                      year: 'numeric',
                      month: 'long',
                      day: 'numeric',
                      hour: '2-digit',
                      minute: '2-digit',
                      second: '2-digit',
                      timeZoneName: 'short'
                    })}
                  </div>
                </div>
              )}
            </div>

            {/* Outcomes Graph */}
            {renderBarGraph()}

            {/* Justification */}
            <div className="justification">
              <h3>AI Jury Justification</h3>
              <div className="justification-text">
                {justification}
              </div>
            </div>
          </section>
        )}

        {/* Past Results Section */}
        <section className="past-results-section">
          <div className="section-partition"></div>
          <h3>View Past Results</h3>
          <div className="lookup-form">
            <input
              type="text"
              placeholder="Enter Result CID"
              value={lookupCid}
              onChange={(e) => setLookupCid(e.target.value)}
            />
            <button 
              onClick={() => handleLoadResults(lookupCid)}
              disabled={!lookupCid.trim() || loadingResults}
            >
              {loadingResults ? 'Loading...' : 'Load Results'}
            </button>
          </div>
        </section>

        <div className="actions">
          <button 
            className="primary"
            onClick={() => {
              setResultCid('');
              setOutcomes([]);
              setJustification('');
              setCurrentPage(PAGES.DEFINE_QUERY);
            }}
          >
            New Query
          </button>
        </div>
      </div>
    );
  };

  // Main render
  return (
    <div className="app">
      {renderHeader()}
      <main className="content">
        {currentPage === PAGES.DEFINE_QUERY && renderQueryDefinition()}
        {currentPage === PAGES.JURY_SELECTION && renderJurySelection()}
        {currentPage === PAGES.RUN && renderRun()}
        {currentPage === PAGES.RESULTS && renderResults()}
      </main>
    </div>
  );
}

export default App;

