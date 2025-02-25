// server/utils/contractsManager.js
const fs = require('fs').promises;
const path = require('path');
const dotenv = require('dotenv');

// Path to the contracts data file
const CONTRACTS_FILE_PATH = path.resolve(__dirname, '../data/contracts.json');
const DATA_DIR = path.dirname(CONTRACTS_FILE_PATH);
const CLIENT_ENV_PATH = path.resolve(__dirname, '../../client/.env');

/**
 * Imports contracts from the client .env file
 * @returns {Promise<Array>} Array of contract objects
 */
async function importContractsFromEnv() {
  try {
    // Read the .env file
    let envContent = '';
    try {
      envContent = await fs.readFile(CLIENT_ENV_PATH, 'utf8');
      console.log('Found .env file for importing contracts');
    } catch (error) {
      console.log('No .env file found for import, using default contract');
      return [
        {
          address: "0x2E67c4D565C55E31514eDd68E42bFBb50a2C49F1",
          name: "Default Contract"
        }
      ];
    }

    // Parse the .env file
    const envVars = dotenv.parse(envContent || '');
    const addresses = envVars.REACT_APP_CONTRACT_ADDRESSES ? envVars.REACT_APP_CONTRACT_ADDRESSES.split(',') : [];
    const names = envVars.REACT_APP_CONTRACT_NAMES ? envVars.REACT_APP_CONTRACT_NAMES.split(',') : [];

    if (addresses.length === 0) {
      console.log('No contract addresses found in .env, using default contract');
      return [
        {
          address: "0x2E67c4D565C55E31514eDd68E42bFBb50a2C49F1",
          name: "Default Contract"
        }
      ];
    }

    // Create contract objects from the addresses and names
    const contracts = addresses.map((address, index) => ({
      address: address.trim(),
      name: index < names.length ? names[index].trim() : `Contract ${address.slice(0, 6)}`
    }));

    console.log(`Imported ${contracts.length} contracts from .env file`);
    return contracts;
  } catch (error) {
    console.error('Error importing contracts from .env:', error);
    return [
      {
        address: "0x2E67c4D565C55E31514eDd68E42bFBb50a2C49F1",
        name: "Default Contract"
      }
    ];
  }
}

/**
 * Validates an Ethereum address using regex
 * @param {string} address - The address to validate
 * @returns {boolean} True if address is valid
 */
function isValidEthereumAddress(address) {
  // Simple regex to check if it's a valid Ethereum address format
  // This checks for 0x prefix followed by 40 hex characters
  const ethereumAddressRegex = /^0x[a-fA-F0-9]{40}$/;
  return ethereumAddressRegex.test(address);
}

/**
 * Ensures the data directory exists
 * @returns {Promise<void>}
 */
async function ensureDataDir() {
  try {
    await fs.mkdir(DATA_DIR, { recursive: true });
    console.log(`Data directory ensured at: ${DATA_DIR}`);
    return true;
  } catch (error) {
    console.error('Error creating data directory:', error);
    throw new Error(`Failed to create data directory: ${error.message}`);
  }
}

/**
 * Loads contracts from the contracts.json file
 * If file doesn't exist or only has default contract, tries to import from .env
 * @returns {Promise<Array>} Array of contract objects
 */
async function loadContracts() {
  try {
    // Ensure the data directory exists
    await ensureDataDir();
    
    let shouldImportFromEnv = false;
    let contracts = [];
    
    try {
      // Check if file exists
      await fs.access(CONTRACTS_FILE_PATH);
      
      // Read and parse the file
      const data = await fs.readFile(CONTRACTS_FILE_PATH, 'utf8');
      const contractsData = JSON.parse(data);
      
      // If file is empty or contracts array is missing or only has the default contract, import from .env
      if (!contractsData || !contractsData.contracts || !Array.isArray(contractsData.contracts) || 
          (contractsData.contracts.length === 1 && 
           contractsData.contracts[0].address === "0x2E67c4D565C55E31514eDd68E42bFBb50a2C49F1" && 
           contractsData.contracts[0].name === "Default Contract")) {
        console.log('contracts.json has only default data, importing from .env');
        shouldImportFromEnv = true;
      } else {
        contracts = contractsData.contracts;
      }
    } catch (error) {
      // File doesn't exist, import from .env
      console.log('contracts.json does not exist, importing from .env');
      shouldImportFromEnv = true;
    }
    
    if (shouldImportFromEnv) {
      // Import contracts from .env
      contracts = await importContractsFromEnv();
      
      // Save the imported contracts to contracts.json
      const defaultData = {
        contracts: contracts,
        lastUpdated: new Date().toISOString()
      };
      
      await fs.writeFile(CONTRACTS_FILE_PATH, JSON.stringify(defaultData, null, 2));
      console.log('Imported contracts from .env saved to contracts.json');
    }
    
    return contracts;
  } catch (error) {
    console.error('Error loading contracts:', error);
    // Return default contract in case of error
    return [
      {
        address: "0x2E67c4D565C55E31514eDd68E42bFBb50a2C49F1",
        name: "Default Contract"
      }
    ];
  }
}

/**
 * Saves contracts to the contracts.json file
 * @param {Array} contracts - Array of contract objects
 * @returns {Promise<boolean>} Success status
 */
async function saveContracts(contracts) {
  try {
    // Ensure data directory exists
    await ensureDataDir();
    
    // Validate each contract
    const validatedContracts = contracts.filter(contract => {
      if (!contract.address || !isValidEthereumAddress(contract.address)) {
        console.warn(`Invalid Ethereum address: ${contract?.address}, skipping`);
        return false;
      }
      
      if (!contract.name || typeof contract.name !== 'string') {
        console.warn(`Invalid contract name for address ${contract.address}, using default name`);
        contract.name = `Contract ${contract.address.slice(0, 6)}`;
      }
      
      return true;
    });
    
    const data = {
      contracts: validatedContracts,
      lastUpdated: new Date().toISOString()
    };
    
    await fs.writeFile(CONTRACTS_FILE_PATH, JSON.stringify(data, null, 2));
    console.log(`Saved ${validatedContracts.length} contracts to ${CONTRACTS_FILE_PATH}`);
    
    // Optional: Update .env file with the new contract values
    try {
      await updateEnvFile(validatedContracts);
    } catch (envError) {
      console.warn('Failed to update .env file:', envError.message);
    }
    
    return true;
  } catch (error) {
    console.error('Error saving contracts:', error);
    throw new Error(`Failed to save contracts: ${error.message}`);
  }
}

/**
 * Updates the .env file with contract addresses and names
 * Only updates the contract-related variables, preserves other env variables
 * @param {Array} contracts - Array of contract objects
 * @returns {Promise<boolean>} Success status
 */
async function updateEnvFile(contracts) {
  try {
    const addresses = contracts.map(c => c.address).join(',');
    const names = contracts.map(c => c.name).join(',');
    
    // Path to the .env file in the client directory
    const envPath = path.resolve(__dirname, '../../client/.env');
    
    // Read the current .env file if it exists
    let envContent = '';
    try {
      envContent = await fs.readFile(envPath, 'utf8');
      console.log('Existing .env file found, preserving other variables');
    } catch (error) {
      // If .env doesn't exist, try to copy from .env.orig
      const envOrigPath = path.resolve(__dirname, '../../client/.env.orig');
      try {
        envContent = await fs.readFile(envOrigPath, 'utf8');
        console.log('Copied content from .env.orig as base for .env');
      } catch (origError) {
        console.log('No .env.orig file found. Creating new .env file');
      }
    }
    
    // Parse the current variables
    const envVars = dotenv.parse(envContent || '');
    
    // Update or add contract variables
    envVars.REACT_APP_CONTRACT_ADDRESSES = addresses;
    envVars.REACT_APP_CONTRACT_NAMES = names;
    
    // Convert back to .env format
    const newEnvContent = Object.entries(envVars)
      .map(([key, value]) => `${key}=${value}`)
      .join('\n');
    
    // Write back to .env file
    await fs.writeFile(envPath, newEnvContent);
    console.log('Updated .env file with contract information');
    
    return true;
  } catch (error) {
    console.error('Error updating .env file:', error);
    // Don't fail the entire operation if .env update fails
    return false;
  }
}

module.exports = {
  loadContracts,
  saveContracts,
  isValidEthereumAddress
}; 