// src/App.js

import React, { useState, useEffect } from 'react';
import { Chart, CategoryScale, LinearScale, BarElement } from 'chart.js';
import { Bar } from 'react-chartjs-2';
import './App.css';
import { ethers } from 'ethers';
import FormData from 'form-data';
import archiveService from './utils/archiveService';
import manifestParser from './utils/manifestParser';
import PaginatedJustification from './components/paginatedJustification';
import { 
  CONTRACT_ABI, 
  BASE_SEPOLIA_CHAIN_ID, 
  BASE_SEPOLIA_PARAMS,
  debugContract,
  switchToBaseSepolia,
  checkContractFunding
} from './utils/contractUtils';
import { fetchWithRetry, tryParseJustification } from './utils/fetchUtils';
import { getAugmentedQueryText } from './utils/queryUtils';
import RunQuery from './pages/RunQuery';
import JurySelection from './pages/JurySelection';
import QueryDefinition from './pages/QueryDefinition';
import Results from './pages/Results';

// Register Chart.js components
Chart.register(CategoryScale, LinearScale, BarElement);

// Navigation constants
export const PAGES = {
  DEFINE_QUERY: 'DEFINE_QUERY',
  JURY_SELECTION: 'JURY_SELECTION',
  RUN: 'RUN',
  RESULTS: 'RESULTS'
};

// Add near the top with other constants
const CONTRACT_ADDRESSES = (process.env.REACT_APP_CONTRACT_ADDRESSES || '').split(',');
const CONTRACT_NAMES = (process.env.REACT_APP_CONTRACT_NAMES || '').split(',');

// Create a mapping of addresses to names
const CONTRACT_OPTIONS = CONTRACT_ADDRESSES.map((address, index) => ({
  address,
  name: CONTRACT_NAMES[index] || `Contract ${index + 1}`
}));

// Replace the SERVER_URL constant with one that reads from env
const SERVER_URL = process.env.REACT_APP_SERVER_URL || 'http://localhost:5000';

// Update the fetchQueryPackageDetails function
const fetchQueryPackageDetails = async (cid) => {
  try {
    console.log('Fetching query package:', cid);
    // Fix the URL to prevent double slashes
    const baseUrl = SERVER_URL.endsWith('/') ? SERVER_URL.slice(0, -1) : SERVER_URL;
    const response = await fetch(`${baseUrl}/api/fetch/${cid}`);
    
    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.details || `Failed to fetch query package: ${response.statusText}`);
    }

    const blob = await response.blob();
    console.log('Received blob:', {
      size: blob.size,
      type: blob.type
    });

    const archiveFile = new File([blob], 'query_package.zip', { type: 'application/zip' });
    
    // Extract the archive
    console.log('Extracting archive...');
    const files = await archiveService.extractArchive(archiveFile);
    console.log('Extracted files:', files.map(f => f.name));
    
    // Find and parse the manifest
    const manifestFile = files.find(file => file.name === 'manifest.json');
    if (!manifestFile) {
      throw new Error('No manifest.json found in archive');
    }

    const manifestContent = await manifestFile.text();
    const manifest = JSON.parse(manifestContent);
    console.log('Parsed manifest:', manifest);

    // Find and parse the primary query file
    const primaryFile = files.find(file => file.name === manifest.primary.filename);
    if (!primaryFile) {
      throw new Error('Primary file not found in archive');
    }

    const primaryContent = await primaryFile.text();
    const primaryData = JSON.parse(primaryContent);
    console.log('Parsed primary data:', primaryData);

    return {
      query: primaryData.query || '',
      numOutcomes: manifest.juryParameters?.NUMBER_OF_OUTCOMES || 2,
      iterations: manifest.juryParameters?.ITERATIONS || 1,
      juryNodes: manifest.juryParameters?.AI_NODES || [],
      additionalFiles: manifest.additional || [],
      supportFiles: manifest.support || []
    };
  } catch (error) {
    console.error('Error fetching query package details:', error);
    throw error;
  }
};

function App() {
  // Navigation state
  const [currentPage, setCurrentPage] = useState(PAGES.DEFINE_QUERY);
  
  // Query Definition state
  const [queryText, setQueryText] = useState('');
  const [supportingFiles, setSupportingFiles] = useState([]);
  const [ipfsCids, setIpfsCids] = useState([]);
  const [cidInput, setCidInput] = useState('');

  // Add new state for outcomes vector
  const [outcomeLabels, setOutcomeLabels] = useState(['True', 'False']);
  
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
  const [resultCid, setResultCid] = useState('');
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
  const [queryPackageCid, setQueryPackageCid] = useState('');

  const [isConnected, setIsConnected] = useState(false);
  const [walletAddress, setWalletAddress] = useState('');
  const [contractAddress, setContractAddress] = useState(CONTRACT_ADDRESSES[0] || '0x2E67c4D565C55E31514eDd68E42bFBb50a2C49F1');

  // Add new state for transaction status
  const [transactionStatus, setTransactionStatus] = useState('');

  // Add new state for timestamp
  const [resultTimestamp, setResultTimestamp] = useState('');

  // Add new state for upload progress
  const [uploadProgress, setUploadProgress] = useState(0);

  // Add package details state at the component level
  const [packageDetails, setPackageDetails] = useState(null);

  // Add new state variables after other state declarations
  const [hyperlinks, setHyperlinks] = useState([]);
  const [linkInput, setLinkInput] = useState('');

  // Add effect to fetch package details when currentCid changes
  useEffect(() => {
    if (currentCid) {
      console.log('Fetching package details for CID:', currentCid);
      setTransactionStatus('Loading query package details...');
      fetchQueryPackageDetails(currentCid)
        .then(details => {
          console.log('Fetched package details:', details);
          setPackageDetails(details);
          setTransactionStatus('');
        })
        .catch(error => {
          console.error('Failed to load query package:', error);
          setTransactionStatus('Failed to load query package details');
        });
    }
  }, [currentCid]);

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

  const renderJurySelection = () => (
    <JurySelection
      outcomeLabels={outcomeLabels}
      juryNodes={juryNodes}
      setJuryNodes={setJuryNodes}
      iterations={iterations}
      setIterations={setIterations}
      setCurrentPage={setCurrentPage}
      setSelectedMethod={setSelectedMethod}
    />
  );

  // Main render
    return (
    <div className="app">
      {renderHeader()}
      <main className="content">
        {currentPage === PAGES.DEFINE_QUERY && (
          <QueryDefinition
            queryText={queryText}
            setQueryText={setQueryText}
            outcomeLabels={outcomeLabels}
            setOutcomeLabels={setOutcomeLabels}
            supportingFiles={supportingFiles}
            setSupportingFiles={setSupportingFiles}
            ipfsCids={ipfsCids}
            setIpfsCids={setIpfsCids}
            cidInput={cidInput}
            setCidInput={setCidInput}
            hyperlinks={hyperlinks}
            setHyperlinks={setHyperlinks}
            linkInput={linkInput}
            setLinkInput={setLinkInput}
            setCurrentPage={setCurrentPage}
          />
        )}
        {currentPage === PAGES.JURY_SELECTION && renderJurySelection()}
        {currentPage === PAGES.RUN && (
          <RunQuery
            queryText={queryText}
            outcomeLabels={outcomeLabels}
            supportingFiles={supportingFiles}
            ipfsCids={ipfsCids}
            juryNodes={juryNodes}
            iterations={iterations}
            selectedMethod={selectedMethod}
            setSelectedMethod={setSelectedMethod}
            queryPackageFile={queryPackageFile}
            setQueryPackageFile={setQueryPackageFile}
            queryPackageCid={queryPackageCid}
            setQueryPackageCid={setQueryPackageCid}
            isConnected={isConnected}
            walletAddress={walletAddress}
            contractAddress={contractAddress}
            transactionStatus={transactionStatus}
            setTransactionStatus={setTransactionStatus}
            loadingResults={loadingResults}
            setLoadingResults={setLoadingResults}
            uploadProgress={uploadProgress}
            setUploadProgress={setUploadProgress}
            setCurrentCid={setCurrentCid}
            setPackageDetails={setPackageDetails}
            setResultCid={setResultCid}
            setJustification={setJustification}
            setOutcomes={setOutcomes}
            setResultTimestamp={setResultTimestamp}
            setCurrentPage={setCurrentPage}
            hyperlinks={hyperlinks}
            setOutcomeLabels={setOutcomeLabels}
          />
        )}
        {currentPage === PAGES.RESULTS && (
          <Results
            queryText={queryText}
            outcomeLabels={outcomeLabels}
            outcomes={outcomes}
            justification={justification}
                  resultCid={resultCid}
            setResultCid={setResultCid}
            lookupCid={lookupCid}
            setLookupCid={setLookupCid}
            loadingResults={loadingResults}
            resultTimestamp={resultTimestamp}
            packageDetails={packageDetails}
            currentCid={currentCid}
            setCurrentPage={setCurrentPage}
            setJustification={setJustification}
                  setOutcomes={setOutcomes}
                  setResultTimestamp={setResultTimestamp}
                  setOutcomeLabels={setOutcomeLabels}
                />
        )}
      </main>
    </div>
  );
}

export default App;

