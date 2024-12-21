// src/App.js

import React, { useState } from 'react';
import { Chart, CategoryScale, LinearScale, BarElement } from 'chart.js';
import { Bar } from 'react-chartjs-2';
import './App.css';
import { ethers } from 'ethers';

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

const IPFS_GATEWAYS = [
  'https://ipfs.io/ipfs/',
  'https://gateway.pinata.cloud/ipfs/',
  'https://cloudflare-ipfs.com/ipfs/',
  'https://gateway.ipfs.io/ipfs/'
];

// Add near the top with other constants
const CONTRACT_ADDRESSES = (process.env.REACT_APP_CONTRACT_ADDRESSES || '').split(',');
const CONTRACT_NAMES = (process.env.REACT_APP_CONTRACT_NAMES || '').split(',');

// Create a mapping of addresses to names
const CONTRACT_OPTIONS = CONTRACT_ADDRESSES.map((address, index) => ({
  address,
  name: CONTRACT_NAMES[index] || `Contract ${index + 1}`
}));

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
  const [contractAddress, setContractAddress] = useState(CONTRACT_ADDRESSES[0] || '0xbBFBBAc5E1754a89616542540d09ec5172B504B6');

  // Add new state for transaction status
  const [transactionStatus, setTransactionStatus] = useState('');

  // Add new state for timestamp
  const [resultTimestamp, setResultTimestamp] = useState('');

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

    const handleRunQuery = async () => {
      if (!isConnected) {
        alert('Please connect your wallet first');
        return;
      }

      setLoadingResults(true);
      setTransactionStatus('Preparing transaction...');

      try {
        switch (selectedMethod) {
          case 'config':
            // Use current configuration
            // TODO: Implement packaging current config into zip and uploading to IPFS
            break;
          case 'file':
            // Use uploaded zip file
            // TODO: Implement uploading zip to IPFS
            break;
          case 'ipfs': {
            console.log("Starting IPFS CID evaluation...");
            const provider = new ethers.BrowserProvider(window.ethereum);
            const signer = await provider.getSigner();
            const contract = new ethers.Contract(contractAddress, CONTRACT_ABI, signer);

            // Get contract config for logging
            const config = await contract.getContractConfig();
            console.log("Contract config:", {
              oracleAddr: config.oracleAddr,
              linkAddr: config.linkAddr,
              jobid: config.jobid,
              currentFee: ethers.formatEther(config.currentFee)
            });

            // Send transaction
            setTransactionStatus('Sending transaction...');
            const tx = await contract.requestAIEvaluation([queryPackageCid], {
              gasLimit: 1000000,
              value: 0
            });
            console.log("Transaction sent:", tx);

            // Wait for transaction confirmation
            setTransactionStatus('Waiting for transaction confirmation...');
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
                
                // Log other interesting events
                if (parsedLog.name === 'Debug1') {
                  console.log("Debug1 event:", {
                    linkToken: parsedLog.args[0],
                    oracle: parsedLog.args[1],
                    fee: ethers.formatEther(parsedLog.args[2]),
                    balance: ethers.formatEther(parsedLog.args[3]),
                    jobId: parsedLog.args[4]
                  });
                }
                
                if (parsedLog.name === 'ChainlinkRequested') {
                  console.log("ChainlinkRequested event:", {
                    id: parsedLog.args[0]
                  });
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
                
                // Check LINK balance
                const linkToken = new ethers.Contract(
                  config.linkAddr,
                  ['function balanceOf(address) view returns (uint256)'],
                  provider
                );
                const balance = await linkToken.balanceOf(contractAddress);
                console.log("Contract LINK balance:", ethers.formatEther(balance));
                
                // Check for any recent events
                const latestBlock = await provider.getBlockNumber();
                console.log("Current block:", latestBlock);
                
                // Look for events in last 30 blocks
                const startBlock = Math.max(0, latestBlock - 30);
                
                // Check for FulfillAIEvaluation events
                const evaluationEvents = await contract.queryFilter('FulfillAIEvaluation', startBlock, latestBlock);
                if (evaluationEvents.length > 0) {
                  console.log("Found FulfillAIEvaluation events:", evaluationEvents);
                  
                  // Find the event for our requestId
                  const ourEvent = evaluationEvents.find(event => {
                    const parsedLog = contract.interface.parseLog({
                      topics: event.topics,
                      data: event.data
                    });
                    return parsedLog.args.requestId === requestId;
                  });

                  if (ourEvent) {
                    console.log("Found our fulfillment event:", ourEvent);
                    const parsedLog = contract.interface.parseLog({
                      topics: ourEvent.topics,
                      data: ourEvent.data
                    });
                    
                    // Create evaluation object from event data
                    evaluation = {
                      exists: true,
                      likelihoods: parsedLog.args.likelihoods,
                      justificationCID: parsedLog.args.justificationCID
                    };
                    console.log("Created evaluation from event:", evaluation);
                    break;
                  }
                }
                
                // If no event found, check contract state
                const result = await contract.getEvaluation(requestId);
                console.log("Poll result from contract:", {
                  exists: result.exists,
                  likelihoods: result.exists ? result.likelihoods.map(n => n.toString()) : [],
                  justificationCID: result.justificationCID,
                  requestId: requestId
                });
                
                if (result.exists) {
                  console.log("Evaluation exists in contract state");
                  evaluation = result;
                  break;
                } else {
                  console.log("Evaluation not ready yet");
                  
                  // Check if request is still pending at oracle
                  try {
                    const oracleContract = new ethers.Contract(
                      config.oracleAddr,
                      ['function pendingRequests(bytes32) view returns (bool)'],
                      provider
                    );
                    const isPending = await oracleContract.pendingRequests(requestId);
                    console.log("Request pending at oracle:", isPending);
                  } catch (err) {
                    console.log("Could not check oracle status:", err.message);
                  }
                }
              } catch (err) {
                console.error("Polling error:", err);
                console.log("Error details:", {
                  message: err.message,
                  code: err.code,
                  data: err.data
                });
              }
              await new Promise(resolve => setTimeout(resolve, 5000));
              pollCount++;
            }

            if (!evaluation) {
              throw new Error(`Evaluation not received after ${maxPolls} attempts`);
            }

            // Update results
            console.log("Processing final results...");
            setOutcomes(evaluation.likelihoods.map(num => Number(num)));
            setJustification("Loading justification..."); // Temporary text while fetching
            setResultCid(evaluation.justificationCID);

            // Fetch justification content
            try {
              let response;
              let succeeded = false;
              
              for (const gateway of IPFS_GATEWAYS) {
                try {
                  const url = `${gateway}${evaluation.justificationCID}`;
                  console.log("Trying gateway:", url);
                  
                  response = await fetch(url);
                  if (response.ok) {
                    succeeded = true;
                    break;
                  }
                } catch (e) {
                  console.log("Gateway failed:", e);
                  continue;
                }
              }
              
              if (!succeeded) {
                throw new Error('All IPFS gateways failed');
              }

              const data = await response.json();
              console.log("Fetched data:", data);

              if (data.justification && data.timestamp) {
                setJustification(data.justification);
                setResultTimestamp(data.timestamp);
              } else {
                throw new Error('Invalid justification data format');
              }
            } catch (error) {
              console.error('Error fetching justification:', error);
              
              // Create a more user-friendly error message with direct link
              setJustification(
                <div>
                  Unable to load justification directly. 
                  <br/><br/>
                  View result at:
                  <ul style={{marginTop: '0.5rem'}}>
                    {IPFS_GATEWAYS.map((gateway, index) => (
                      <li key={index} style={{marginBottom: '0.5rem'}}>
                        <a 
                          href={`${gateway}${evaluation.justificationCID}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          style={{color: 'var(--color-primary-purple)'}}
                        >
                          {gateway}
                        </a>
                      </li>
                    ))}
                  </ul>
                </div>
              );
            }
            
            console.log("Final outcomes:", evaluation.likelihoods);
            console.log("Final justification CID:", evaluation.justificationCID);
            
            // Navigate to results page
            setCurrentPage(PAGES.RESULTS);
            break;
          }
          default:
            throw new Error('Invalid method selected');
        }
        
        // For now, just simulate processing
        await new Promise(resolve => setTimeout(resolve, 2000));
        setCurrentPage(PAGES.RESULTS);
      } catch (error) {
        console.error('Error running query:', error);
        setTransactionStatus('Error: ' + error.message);
        alert('An error occurred while processing the query. Check console for details.');
      } finally {
        setLoadingResults(false);
        setTransactionStatus('');
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
                  <p className="file-name">Selected: {queryPackageFile.name}</p>
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

