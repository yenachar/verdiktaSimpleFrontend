import React, { useState, useEffect } from 'react';
import { toast } from 'react-toastify';
import '../App.css';

// Define the server URL, matching what we have in contractManagementService.js
const SERVER_URL = process.env.REACT_APP_SERVER_URL || 'http://localhost:5001';

const ContractManagement = ({ onContractsUpdated }) => {
  const [contracts, setContracts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [newContract, setNewContract] = useState({ address: '', name: '', class: 128 });
  const [isEditing, setIsEditing] = useState(null);
  const [editForm, setEditForm] = useState({ address: '', name: '', class: 128 });

  // Fetch contracts on component mount
  useEffect(() => {
    fetchContracts();
  }, []);

  const fetchContracts = async () => {
    setLoading(true);
    try {
      const response = await fetch(`${SERVER_URL}/api/contracts`);
      const data = await response.json();
      
      if (data.success) {
        // Ensure all contracts have a class, default if missing
        const contractsWithDefaults = data.contracts.map(c => ({
          ...c,
          class: (c.class === undefined || typeof c.class !== 'number' || c.class < 0 || c.class > 99999) ? 128 : c.class
        }));
        setContracts(contractsWithDefaults);
        // Always notify parent component about contract updates
        if (onContractsUpdated) {
          onContractsUpdated(contractsWithDefaults);
        }
      } else {
        setError(data.error || 'Failed to fetch contracts');
        toast.error(data.error || 'Failed to fetch contracts');
      }
    } catch (err) {
      console.error('Error fetching contracts:', err);
      setError('Failed to connect to server');
      toast.error('Failed to connect to server');
    } finally {
      setLoading(false);
    }
  };

  const handleAddContract = async (e) => {
    e.preventDefault();
    
    if (!newContract.address.trim() || !newContract.name.trim()) {
      toast.error('Address and name are required');
      return;
    }

    const contractClass = parseInt(newContract.class, 10);
    if (isNaN(contractClass) || contractClass < 0 || contractClass > 99999) {
      toast.error('Class must be a number between 0 and 99999.');
      return;
    }
    
    try {
      const response = await fetch(`${SERVER_URL}/api/contracts`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ ...newContract, class: contractClass }),
      });
      
      const data = await response.json();
      
      if (data.success) {
        toast.success('Contract added successfully');
        setNewContract({ address: '', name: '', class: 128 });
        await fetchContracts();
      } else {
        toast.error(data.error || 'Failed to add contract');
      }
    } catch (err) {
      console.error('Error adding contract:', err);
      toast.error('Failed to connect to server');
    }
  };

  const handleDeleteContract = async (address) => {
    if (!window.confirm('Are you sure you want to delete this contract?')) {
      return;
    }
    
    try {
      const response = await fetch(`${SERVER_URL}/api/contracts/${address}`, {
        method: 'DELETE',
      });
      
      const data = await response.json();
      
      if (data.success) {
        toast.success('Contract removed successfully');
        await fetchContracts();
      } else {
        toast.error(data.error || 'Failed to remove contract');
      }
    } catch (err) {
      console.error('Error deleting contract:', err);
      toast.error('Failed to connect to server');
    }
  };

  const startEdit = (contract) => {
    setIsEditing(contract.address);
    setEditForm({ ...contract, class: contract.class === undefined ? 128 : contract.class });
  };

  const cancelEdit = () => {
    setIsEditing(null);
  };

  const handleEditChange = (e) => {
    const { name, value } = e.target;
    setEditForm(prev => ({ ...prev, [name]: value }));
  };

  const handleEditSubmit = async (e) => {
    e.preventDefault();
    
    if (!editForm.name.trim()) {
      toast.error('Name is required');
      return;
    }

    const contractClass = parseInt(editForm.class, 10);
    if (isNaN(contractClass) || contractClass < 0 || contractClass > 99999) {
      toast.error('Class must be a number between 0 and 99999.');
      return;
    }
    
    try {
      // Find the contract index
      const updatedContracts = [...contracts];
      const index = updatedContracts.findIndex(c => c.address === isEditing);
      
      if (index !== -1) {
        // Update name and class, address remains the same
        updatedContracts[index] = { 
          ...updatedContracts[index], // Keep other potential fields
          name: editForm.name,
          class: contractClass
        };
        
        const response = await fetch(`${SERVER_URL}/api/contracts`, {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ contracts: updatedContracts }),
        });
        
        const data = await response.json();
        
        if (data.success) {
          toast.success('Contract updated successfully');
          setIsEditing(null);
          await fetchContracts();
        } else {
          toast.error(data.error || 'Failed to update contract');
        }
      }
    } catch (err) {
      console.error('Error updating contract:', err);
      toast.error('Failed to connect to server');
    }
  };

  return (
    <div className="contract-management-container">
      <h1>Contract Management</h1>
      
      <div className="card add-contract-card">
        <h2>Add New Contract</h2>
        <form onSubmit={handleAddContract} className="form-container">
          <div className="form-group">
            <label htmlFor="address">Contract Address:</label>
            <input
              type="text"
              id="address"
              value={newContract.address}
              onChange={(e) => setNewContract({ ...newContract, address: e.target.value })}
              placeholder="0x..."
              className="input-field"
            />
          </div>
          <div className="form-group">
            <label htmlFor="name">Contract Name:</label>
            <input
              type="text"
              id="name"
              value={newContract.name}
              onChange={(e) => setNewContract({ ...newContract, name: e.target.value })}
              placeholder="My Contract"
              className="input-field"
            />
          </div>
          <div className="form-group">
            <label htmlFor="class">Class (0-99999):</label>
            <input
              type="number"
              id="class"
              value={newContract.class}
              onChange={(e) => setNewContract({ ...newContract, class: e.target.value })}
              placeholder="128"
              min="0"
              max="99999"
              className="input-field"
            />
          </div>
          <button type="submit" className="button add-button">Add Contract</button>
        </form>
      </div>

      <div className="card contract-list-card">
        <h2>Contract List</h2>
        {loading ? (
          <p className="loading-message">Loading contracts...</p>
        ) : error ? (
          <p className="error-message">{error}</p>
        ) : contracts.length === 0 ? (
          <p className="empty-message">No contracts found. Add your first contract above.</p>
        ) : (
          <ul className="contract-list">
            {contracts.map((contract) => (
              <li key={contract.address} className="contract-item">
                {isEditing === contract.address ? (
                  <form onSubmit={handleEditSubmit} className="edit-form">
                    <div className="form-group">
                      <label>Address:</label>
                      <input
                        type="text"
                        value={contract.address}
                        disabled
                        className="input-field disabled"
                      />
                    </div>
                    <div className="form-group">
                      <label>Name:</label>
                      <input
                        type="text"
                        name="name"
                        value={editForm.name}
                        onChange={handleEditChange}
                        className="input-field"
                      />
                    </div>
                    <div className="form-group">
                      <label>Class (0-99999):</label>
                      <input
                        type="number"
                        name="class"
                        value={editForm.class}
                        onChange={handleEditChange}
                        min="0"
                        max="99999"
                        className="input-field"
                      />
                    </div>
                    <div className="button-group">
                      <button type="submit" className="button save-button">Save</button>
                      <button type="button" onClick={cancelEdit} className="button secondary">Cancel</button>
                    </div>
                  </form>
                ) : (
                  <>
                    <div className="contract-info">
                      <strong className="contract-name">{contract.name}</strong>
                      <code className="contract-address">{contract.address}</code>
                      <span className="contract-class">Class: {contract.class === undefined ? 128 : contract.class}</span>
                    </div>
                    <div className="contract-actions">
                      <button 
                        onClick={() => startEdit(contract)} 
                        className="edit-button"
                        title="Edit contract"
                      >
                        Edit
                      </button>
                      <button 
                        onClick={() => handleDeleteContract(contract.address)} 
                        className="delete-button"
                        title="Delete contract"
                      >
                        ✕
                      </button>
                    </div>
                  </>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
};

export default ContractManagement; 