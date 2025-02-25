const express = require('express');
const router = express.Router();
const { loadContracts, saveContracts, isValidEthereumAddress } = require('../utils/contractsManager');

/**
 * GET /api/contracts
 * Returns the list of contracts
 */
router.get('/', async (req, res) => {
  try {
    const contracts = await loadContracts();
    res.json({
      success: true,
      contracts
    });
  } catch (error) {
    console.error('Error fetching contracts:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch contracts',
      details: error.message
    });
  }
});

/**
 * PUT /api/contracts
 * Updates the list of contracts
 * Requires an array of contract objects in request body
 */
router.put('/', async (req, res) => {
  try {
    const { contracts } = req.body;
    
    if (!Array.isArray(contracts)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid request format. Expected an array of contracts'
      });
    }
    
    // Validate each contract
    for (const contract of contracts) {
      if (!contract.address || !contract.name) {
        return res.status(400).json({
          success: false,
          error: 'Each contract must have an address and name'
        });
      }
      
      if (!isValidEthereumAddress(contract.address)) {
        return res.status(400).json({
          success: false,
          error: `Invalid Ethereum address: ${contract.address}`
        });
      }
    }
    
    await saveContracts(contracts);
    
    res.json({
      success: true,
      message: 'Contracts updated successfully',
      contracts
    });
  } catch (error) {
    console.error('Error updating contracts:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to update contracts',
      details: error.message
    });
  }
});

/**
 * POST /api/contracts
 * Adds a new contract to the list
 */
router.post('/', async (req, res) => {
  try {
    const { address, name } = req.body;
    
    if (!address || !name) {
      return res.status(400).json({
        success: false,
        error: 'Contract address and name are required'
      });
    }
    
    if (!isValidEthereumAddress(address)) {
      return res.status(400).json({
        success: false,
        error: `Invalid Ethereum address: ${address}`
      });
    }
    
    const contracts = await loadContracts();
    
    // Check for duplicate address
    if (contracts.some(c => c.address.toLowerCase() === address.toLowerCase())) {
      return res.status(400).json({
        success: false,
        error: 'Contract with this address already exists'
      });
    }
    
    // Add the new contract
    contracts.push({ address, name });
    
    await saveContracts(contracts);
    
    res.status(201).json({
      success: true,
      message: 'Contract added successfully',
      contract: { address, name }
    });
  } catch (error) {
    console.error('Error adding contract:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to add contract',
      details: error.message
    });
  }
});

/**
 * DELETE /api/contracts/:address
 * Removes a contract from the list
 */
router.delete('/:address', async (req, res) => {
  try {
    const { address } = req.params;
    
    if (!isValidEthereumAddress(address)) {
      return res.status(400).json({
        success: false,
        error: `Invalid Ethereum address: ${address}`
      });
    }
    
    let contracts = await loadContracts();
    const initialLength = contracts.length;
    
    // Filter out the contract to delete
    contracts = contracts.filter(c => c.address.toLowerCase() !== address.toLowerCase());
    
    // Check if any contract was removed
    if (contracts.length === initialLength) {
      return res.status(404).json({
        success: false,
        error: 'Contract not found'
      });
    }
    
    await saveContracts(contracts);
    
    res.json({
      success: true,
      message: 'Contract removed successfully'
    });
  } catch (error) {
    console.error('Error removing contract:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to remove contract',
      details: error.message
    });
  }
});

module.exports = router; 