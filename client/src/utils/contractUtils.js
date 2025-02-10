// src/utils/contractUtils.js

import { ethers } from 'ethers';
import { uploadToServer, fetchWithRetry } from './ipfsUtils';
import { createQueryPackageArchive } from './packageUtils';

// ------------------
// Contract Constants
// ------------------
export const CONTRACT_ABI = [
  'function requestAIEvaluation(string[] memory cids) public returns (bytes32 requestId)',
  'function evaluations(bytes32 requestId) public view returns (uint256[] likelihoods, string justificationCID)',
  'function setChainlinkToken(address _link)',
  'function setChainlinkOracle(address _oracle)',
  'event RequestAIEvaluation(bytes32 indexed requestId, string[] cids)',
  'event FulfillAIEvaluation(bytes32 indexed requestId, uint256[] likelihoods, string justificationCID)',
  'event ChainlinkRequested(bytes32 indexed id)',
  'event ChainlinkFulfilled(bytes32 indexed id)',
  'function getContractConfig() public view returns (address oracleAddr, address linkAddr, bytes32 jobId, uint256 currentFee)',
  'event Debug1(address linkToken, address oracle, uint256 fee, uint256 balance, bytes32 jobId)',
  'function getEvaluation(bytes32 _requestId) public view returns (uint256[] memory likelihoods, string memory justificationCID, bool exists)'
];

export const BASE_SEPOLIA_CHAIN_ID = 84532;
export const BASE_SEPOLIA_PARAMS = {
  chainId: '0x14A34', // 84532 in hex
  chainName: 'Base Sepolia',
  nativeCurrency: {
    name: 'Ethereum',
    symbol: 'ETH',
    decimals: 18
  },
  rpcUrls: ['https://sepolia.base.org'],
  blockExplorerUrls: ['https://sepolia.basescan.org']
};

// ------------------
// Helper Functions
// ------------------
async function debugContract(contract) {
  if (!contract) {
    console.error('Contract is undefined or null');
    return;
  }
  try {
    console.log('Contract debug info:', {
      target: contract.target,
      interfaceFunctions: contract.interface ? Object.keys(contract.interface.functions) : [],
      providerType: typeof contract.provider,
      signerType: typeof contract.signer
    });
  } catch (error) {
    console.error('Error in debugContract:', error);
  }
}

export async function switchToBaseSepolia(provider) {
  const network = await provider.getNetwork();
  if (network.chainId.toString() !== BASE_SEPOLIA_CHAIN_ID.toString()) {
    try {
      await window.ethereum.request({
        method: 'wallet_switchEthereumChain',
        params: [{ chainId: BASE_SEPOLIA_PARAMS.chainId }]
      });
    } catch (switchError) {
      if (switchError.code === 4902) {
        try {
          await window.ethereum.request({
            method: 'wallet_addEthereumChain',
            params: [BASE_SEPOLIA_PARAMS]
          });
        } catch (addError) {
          throw new Error('Please add Base Sepolia network to MetaMask and try again');
        }
      } else {
        throw new Error('Please switch to Base Sepolia network in MetaMask');
      }
      return new Promise((resolve) => {
        const handleNetworkChange = () => {
          window.ethereum.removeListener('chainChanged', handleNetworkChange);
          setTimeout(async () => {
            const newProvider = new ethers.BrowserProvider(window.ethereum);
            resolve(newProvider);
          }, 1000);
        };
        window.ethereum.on('chainChanged', handleNetworkChange);
      });
    }
  }
  return provider;
}

export async function checkContractFunding(contract, provider) {
  try {
    await debugContract(contract);
    const code = await provider.getCode(contract.target);
    if (code === '0x') {
      throw new Error(`No contract code found at address ${contract.target}`);
    }
    const config = await contract.getContractConfig();
    console.log('Contract config:', config);

    const linkToken = new ethers.Contract(
      config.linkAddr,
      ['function balanceOf(address) view returns (uint256)'],
      provider
    );
    const balance = await linkToken.balanceOf(contract.target);
    const fee = config.currentFee;
    console.log('Contract LINK balance:', ethers.formatEther(balance), 'Required fee:', ethers.formatEther(fee));

    if (balance < fee) {
      throw new Error(
        `Insufficient LINK tokens. Contract needs ${ethers.formatEther(fee)}, has ${ethers.formatEther(balance)}`
      );
    }
    return config;
  } catch (error) {
    console.error('checkContractFunding error:', error);
    throw error;
  }
}

/**
 * Attempts to parse justification from the server's IPFS fetch response.
 * This updates outcomes/timestamp if your JSON includes them.
 */
async function tryParseJustification(response, cid, setOutcomes, setResultTimestamp) {
  const rawText = await response.text();
  console.log(`Justification raw data (CID: ${cid}):`, rawText.slice(0, 200));

  try {
    const data = JSON.parse(rawText);
    if (data.scores && Array.isArray(data.scores)) {
      const outcomeScores = data.scores.map((item) => item.score);
      setOutcomes(outcomeScores);
      // If you have something like window.setOutcomeLabels(...) in the old code,
      // you can handle that logic here if needed.
    }
    if (data.timestamp) {
      setResultTimestamp(data.timestamp);
    }
    return data.justification || JSON.stringify(data, null, 2);
  } catch (e) {
    console.log('Could not parse JSON, returning raw text.');
    return rawText;
  }
}

// ------------------
// Main function
// ------------------
/**
 * Replicates the old "handleRunQuery" logic from your original App.js,
 * but now integrated with your new architecture:
 *  - Checking/wallet connection
 *  - Possibly uploading a ZIP to your Node server (which pins to IPFS)
 *  - Sending requestAIEvaluation to the contract
 *  - Polling for results
 *  - Setting outcomes/justification in React state
 */
export async function runQueryOnContract(args) {
  const {
    selectedMethod, // 'config', 'file', or 'ipfs'
    queryText,
    outcomeLabels,
    supportingFiles,
    ipfsCids,
    juryNodes,
    iterations,
    queryPackageFile,
    queryPackageCid,
    contractAddress,

    // React state setters
    setTransactionStatus,
    setLoadingResults,
    setUploadProgress,
    setCurrentCid,
    setPackageDetails,
    setResultCid,
    setJustification,
    setOutcomes,
    setResultTimestamp
  } = args;

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

      // Primary query JSON
      const queryFileContent = {
        query: queryText,
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

      // Now send the request to the contract
      setTransactionStatus?.('Sending transaction...');
      await requestAIEvaluation(contract, cid, setTransactionStatus);

      // Poll for results
      await pollForEvaluationResults(
        contract,
        cid,
        setTransactionStatus,
        setOutcomes,
        setJustification,
        setResultCid,
        setResultTimestamp
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
      await requestAIEvaluation(contract, cid, setTransactionStatus);

      await pollForEvaluationResults(
        contract,
        cid,
        setTransactionStatus,
        setOutcomes,
        setJustification,
        setResultCid,
        setResultTimestamp
      );
      break;
    }

    case 'ipfs': {
      if (!queryPackageCid) {
        throw new Error('No queryPackageCid provided');
      }
      setCurrentCid?.(queryPackageCid);

      setTransactionStatus?.('Sending transaction...');
      await requestAIEvaluation(contract, queryPackageCid, setTransactionStatus);

      await pollForEvaluationResults(
        contract,
        queryPackageCid,
        setTransactionStatus,
        setOutcomes,
        setJustification,
        setResultCid,
        setResultTimestamp
      );
      break;
    }

    default:
      throw new Error(`Invalid method: ${selectedMethod}`);
  }

  setTransactionStatus?.('');
}

// ------------------
// Internal Helpers
// ------------------

/**
 * Calls contract.requestAIEvaluation([cid]) and waits for confirmation.
 */
async function requestAIEvaluation(contract, cid, setTransactionStatus) {
  const tx = await contract.requestAIEvaluation([cid], {
    gasLimit: 1000000,
    value: 0
  });
  console.log('Transaction sent:', tx);
  setTransactionStatus?.('Waiting for confirmation...');
  const receipt = await tx.wait();
  console.log('Transaction confirmed:', receipt);

  if (!receipt.logs?.length) {
    throw new Error('No logs in transaction receipt');
  }
  // We do not extract requestId here; we handle that in pollForEvaluationResults below
}

/**
 * Polls the contract for results (using getEvaluation(requestId)) and fetches justification from
 * /api/fetch/:cid (via fetchWithRetry).
 */
async function pollForEvaluationResults(
  contract,
  cidUsed,
  setTransactionStatus,
  setOutcomes,
  setJustification,
  setResultCid,
  setResultTimestamp
) {
  setTransactionStatus?.('Waiting for evaluation results...');

  // 1) Figure out the requestId from logs. Because the contract logs `RequestAIEvaluation(bytes32 requestId, string[] cids)`,
  // we can find a log with cids[] == [cidUsed].
  const filter = contract.filters.RequestAIEvaluation(null, [cidUsed]);
  const logs = await contract.provider.getLogs({
    fromBlock: 0,
    toBlock: 'latest',
    address: contract.target,
    topics: filter.topics
  });
  if (!logs?.length) {
    throw new Error('RequestAIEvaluation event not found for cid: ' + cidUsed);
  }

  let requestId;
  for (const log of logs) {
    try {
      const parsed = contract.interface.parseLog({ data: log.data, topics: log.topics });
      if (parsed.name === 'RequestAIEvaluation') {
        // We have a match
        requestId = parsed.args.requestId;
        break;
      }
    } catch (err) {
      // skip logs that don't parse
    }
  }
  if (!requestId) {
    throw new Error('Failed to parse requestId from contract logs');
  }

  // 2) Poll up to X times
  let attempts = 0;
  const maxAttempts = 60;
  let foundEvaluation = null;

  while (!foundEvaluation && attempts < maxAttempts) {
    attempts++;
    try {
      const result = await contract.getEvaluation(requestId);
      // result = [ likelihoods, justificationCID, exists ]
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
  setOutcomes?.(likelihoods.map(Number)); // Convert BN => JS number
  setJustification?.('Loading justification...');
  setResultCid?.(justificationCid);

  // 3) Fetch justification from your server route: /api/fetch/:cid
  setTransactionStatus?.('Fetching justification from server...');
  try {
    const response = await fetchWithRetry(justificationCid);
    const justificationText = await tryParseJustification(
      response,
      justificationCid,
      setOutcomes,
      setResultTimestamp
    );
    setJustification?.(justificationText);
  } catch (error) {
    console.error('Justification fetch error:', error);
    setJustification?.(`Error loading justification: ${error.message}`);
  }
}