// src/App.js

import React, { useState } from 'react';
import { ethers } from 'ethers';
import { Bar } from 'react-chartjs-2';
import { Chart, CategoryScale, LinearScale, BarElement } from 'chart.js';

// Register Chart.js components
Chart.register(CategoryScale, LinearScale, BarElement);

function App() {
  const [cid, setCid] = useState('QmcMjSr4pL8dpNzjhGWaZ6vRmvv7fN3xsLJCDpqVsH7gv7');
  const [contractAddress, setContractAddress] = useState('0xbBFBBAc5E1754a89616542540d09ec5172B504B6');
  const [evaluations, setEvaluations] = useState(null);
  const [justificationCID, setJustificationCID] = useState('');
  const [loading, setLoading] = useState(false);

  const requestEvaluation = async () => {
    try {
      setLoading(true);

      // Check for MetaMask
      if (!window.ethereum) {
        alert('Please install MetaMask!');
        setLoading(false);
        return;
      }

      const provider = new ethers.BrowserProvider(window.ethereum);
      await provider.send('eth_requestAccounts', []);
      const signer = await provider.getSigner();

      // Create contract instance with signer
      //const abi = [
      //  'function requestAIEvaluation(string[] memory cids) public returns (bytes32 requestId)',
      //  'function evaluations(bytes32 requestId) public view returns (uint256[] likelihoods, string justificationCID)',
      //  'event RequestAIEvaluation(bytes32 indexed requestId, string[] cids)',
      //  'event FulfillAIEvaluation(bytes32 indexed requestId, uint256[] likelihoods, string justificationCID)',
      //];

    const abi = [
    'function requestAIEvaluation(string[] memory cids) public returns (bytes32 requestId)',
    'function evaluations(bytes32 requestId) public view returns (uint256[] likelihoods, string justificationCID)',
    'function setChainlinkToken(address _link)',
    'function setChainlinkOracle(address _oracle)',
    'event RequestAIEvaluation(bytes32 indexed requestId, string[] cids)',
    'event FulfillAIEvaluation(bytes32 indexed requestId, uint256[] likelihoods, string justificationCID)',
    'event ChainlinkRequested(bytes32 indexed id)',
    'event ChainlinkFulfilled(bytes32 indexed id)',
    'function getContractConfig() public view returns (address oracleAddr, address linkAddr, bytes32 jobid, uint256 currentFee)',
    //'event Debug(address linkToken, address oracle, uint256 fee),
    'event Debug1(address linkToken, address oracle, uint256 fee, uint256 balance, bytes32 jobId)',
    'function getEvaluation(bytes32 _requestId) public view returns (uint256[] memory likelihoods, string memory justificationCID, bool exists)'
    ];
      const contract = new ethers.Contract(contractAddress, abi, signer);


// Temp logs here
console.log("Contract address:", contractAddress);
console.log("CID array:", [cid]);
console.log("Contract ABI:", abi);
console.log("Contract methods:", contract.interface.fragments);
console.log("Attempting to encode function data...");

const config = await contract.getContractConfig();
    console.log("Contract config:", {
        oracleAddr: config.oracleAddr,
        linkAddr: config.linkAddr,
        jobid: config.jobid,
        currentFee: ethers.formatEther(config.currentFee)
    });

let tx;
try {
    const encodedData = contract.interface.encodeFunctionData("requestAIEvaluation", [[cid]]);
    console.log("Encoded function data:", encodedData);

    // Now try the transaction with the encoded data
    tx = await contract.requestAIEvaluation([cid], {
        gasLimit: 1000000,
        value: 0
    });
    console.log("Transaction sent:", tx);
    console.log("CID array:", [cid]);	
} catch (error) {
    console.error("Error encoding/sending transaction:", error);
    throw error;
}

if (!tx) {
    console.error("Transaction failed or was not initialized.");
    return;
}



      // Send transaction to request AI evaluation
//      const tx = await contract.requestAIEvaluation([cid], {
//        gasLimit: 1000000, // Adjust gas limit as needed
//      });

      // Wait for the transaction to be mined
      const receipt = await tx.wait();

      // Extract the requestId from the event logs
      let requestId;
      for (const log of receipt.logs) {
        try {
          const parsedLog = contract.interface.parseLog(log);
          if (parsedLog.name === 'RequestAIEvaluation') {
            requestId = parsedLog.args.requestId;
            break;
          }
        } catch (e) {
          // Ignore logs that can't be parsed
        }
      }

      if (!requestId) {
        alert('Request ID not found in transaction logs.');
        setLoading(false);
        return;
      }

      // Polling the contract to get the evaluation result
      let evaluation;
      while (!evaluation) {
        try {
          const result = await contract.getEvaluation(requestId);
          if (result.exists) {
            evaluation = result;
            break;
          }
        } catch (err) {
		console.error("Polling error:", err);
        }

        // Wait for a few seconds before retrying
        await new Promise((resolve) => setTimeout(resolve, 5000));
      }

      setEvaluations(evaluation.likelihoods.map((num) => Number(num)));
      setJustificationCID(evaluation.justificationCID);
      setLoading(false);
    } catch (error) {
      console.error(error);
      alert('An error occurred during the evaluation.');
      setLoading(false);
    }
  };

  const renderChart = () => {
    if (!evaluations) return null;

    const labels = evaluations.map((_, index) => `Option ${index + 1}`);
    const data = {
      labels,
      datasets: [
        {
          label: 'Likelihoods',
          data: evaluations,
          backgroundColor: 'rgba(75,192,192,0.6)',
        },
      ],
    };

    return (
      <div style={{ maxWidth: '600px', margin: '0 auto' }}>
        <Bar data={data} />
      </div>
    );
  };

  return (
    <div style={{ padding: '20px' }}>
      <h1>AI Evaluation Interface</h1>
      <div>
        <label>
          <strong>IPFS CID:</strong>
          <input
            type="text"
            value={cid}
            onChange={(e) => setCid(e.target.value)}
            style={{ width: '100%', padding: '8px', marginTop: '8px' }}
          />
        </label>
      </div>
      <div style={{ marginTop: '20px' }}>
        <label>
          <strong>Smart Contract Address:</strong>
          <input
            type="text"
            value={contractAddress}
            onChange={(e) => setContractAddress(e.target.value)}
            style={{ width: '100%', padding: '8px', marginTop: '8px' }}
          />
        </label>
      </div>
      <button
        onClick={requestEvaluation}
        style={{ marginTop: '20px', padding: '10px 20px' }}
        disabled={loading}
      >
        {loading ? 'Processing...' : 'Submit for Evaluation'}
      </button>
      {renderChart()}
      {justificationCID && (
        <div style={{ marginTop: '20px' }}>
          <h3>Justification CID:</h3>
          <p>{justificationCID}</p>
        </div>
      )}
    </div>
  );
}

export default App;

