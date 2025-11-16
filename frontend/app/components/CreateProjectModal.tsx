// frontend/app/components/CreateProjectModal.tsx
"use client";

import { useState, useEffect } from "react";
import { useApi } from "../context/ApiContext";
import axios from "axios";

interface CreateProjectModalProps {
  isOpen: boolean;
  onClose: () => void;
  onProjectCreated: () => void;
}

export const CreateProjectModal = ({ isOpen, onClose, onProjectCreated }: CreateProjectModalProps) => {
  const { api, selectedAccount, signer, connect, isConnecting } = useApi();
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [budget, setBudget] = useState("");
  const [duration, setDuration] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState("");

  // Auto-connect wallet when modal opens
  useEffect(() => {
    if (isOpen && !selectedAccount && !isConnecting) {
      connect();
    }
  }, [isOpen, selectedAccount, connect, isConnecting]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    // More robust wallet connection check
    if (!api) {
      setError("API not connected. Please refresh the page.");
      return;
    }
    
    if (!selectedAccount) {
      setError("No account selected. Please connect your wallet.");
      return;
    }
    
    if (!signer) {
      setError("Signer not available. Please reconnect your wallet.");
      return;
    }
    
    if (!title || !description || !budget || !duration) {
      setError("Please fill out all fields.");
      return;
    }

    setIsSubmitting(true);
    setError("");

    try {
      // Check if Pinata credentials are available
      if (!process.env.NEXT_PUBLIC_PINATA_API_KEY || !process.env.NEXT_PUBLIC_PINATA_API_SECRET) {
        throw new Error("Pinata API credentials not configured.");
      }

      // 1. Upload description to IPFS via Pinata
      const projectJson = { title, description };
      const blob = new Blob([JSON.stringify(projectJson)], { type: 'application/json' });
      const data = new FormData();
      data.append('file', blob, 'project.json');

      const pinataResponse = await axios.post(
        "https://api.pinata.cloud/pinning/pinFileToIPFS",
        data,
        {
          headers: {
            'Content-Type': `multipart/form-data`,
            'pinata_api_key': process.env.NEXT_PUBLIC_PINATA_API_KEY,
            'pinata_secret_api_key': process.env.NEXT_PUBLIC_PINATA_API_SECRET
          }
        }
      );

      const ipfsHash = pinataResponse.data.IpfsHash;
      if (!ipfsHash) {
        throw new Error("Failed to get IPFS hash from Pinata.");
      }

      // 2. Create project on-chain with the IPFS hash as the URI
      const budgetInPlanck = BigInt(parseFloat(budget) * 10**12);
      const durationInBlocks = parseInt(duration) * 24 * 60 * 60 / 12; // Convert days to blocks
      const uriHex = "0x" + Buffer.from(ipfsHash).toString('hex');
      
      const extrinsic = api.tx.projects.createProject(
        budgetInPlanck.toString(), 
        uriHex, 
        durationInBlocks
      );

      await new Promise<void>((resolve, reject) => {
        extrinsic.signAndSend(selectedAccount.address, { signer }, ({ status, events }) => {
          if (status.isInBlock) {
            console.log(`Transaction included in block: ${status.asInBlock}`);
          }
          if (status.isFinalized) {
            console.log(`Transaction finalized: ${status.asFinalized}`);
            setIsSubmitting(false);
            onProjectCreated();
            onClose();
            // Reset form
            setTitle("");
            setDescription("");
            setBudget("");
            setDuration("");
            resolve();
          }
        }).catch((error: any) => {
          console.error("Transaction failed:", error);
          setIsSubmitting(false);
          setError(error.message || "Transaction failed");
          reject(error);
        });
      });

    } catch (err: any) {
      console.error("Create project error:", err);
      setError(err.message || "An unknown error occurred.");
      setIsSubmitting(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex justify-center items-center z-50">
      <div className="bg-white rounded-lg p-8 w-full max-w-md">
        <h2 className="text-2xl font-bold mb-4 text-gray-800">Create a New Project</h2>
        
        {/* Wallet Connection Status */}
        {isConnecting && (
          <div className="mb-4 p-3 bg-blue-50 rounded-md">
            <p className="text-sm text-blue-800">Connecting to wallet...</p>
          </div>
        )}
        
        {!selectedAccount && !isConnecting && (
          <div className="mb-4 p-3 bg-yellow-50 rounded-md">
            <p className="text-sm text-yellow-800 mb-2">Please connect your wallet first.</p>
            <button
              onClick={connect}
              className="px-3 py-1 bg-yellow-200 text-yellow-800 rounded text-sm hover:bg-yellow-300"
            >
              Connect Wallet
            </button>
          </div>
        )}
        
        {selectedAccount && (
          <div className="mb-4 p-3 bg-green-50 rounded-md">
            <p className="text-sm text-green-800">
              Connected as: <span className="font-medium">{selectedAccount.meta.name}</span>
            </p>
          </div>
        )}

        <form onSubmit={handleSubmit}>
          <div className="mb-4">
            <label htmlFor="title" className="block text-sm font-medium text-gray-700">Title</label>
            <input
              type="text"
              id="title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="mt-1 block w-full px-3 py-2 bg-white border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm text-gray-900"
              required
              disabled={!selectedAccount || isSubmitting}
            />
          </div>
          
          <div className="mb-4">
            <label htmlFor="description" className="block text-sm font-medium text-gray-700">Description</label>
            <textarea
              id="description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={4}
              className="mt-1 block w-full px-3 py-2 bg-white border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm text-gray-900"
              required
              disabled={!selectedAccount || isSubmitting}
            />
          </div>
          
          <div className="mb-4">
            <label htmlFor="budget" className="block text-sm font-medium text-gray-700">Budget (Units)</label>
            <input
              type="number"
              id="budget"
              value={budget}
              onChange={(e) => setBudget(e.target.value)}
              className="mt-1 block w-full px-3 py-2 bg-white border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm text-gray-900"
              required
              min="0"
              step="0.0001"
              disabled={!selectedAccount || isSubmitting}
            />
          </div>
          
          <div className="mb-6">
            <label htmlFor="duration" className="block text-sm font-medium text-gray-700">Duration (Days)</label>
            <input
              type="number"
              id="duration"
              value={duration}
              onChange={(e) => setDuration(e.target.value)}
              className="mt-1 block w-full px-3 py-2 bg-white border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm text-gray-900"
              required
              min="1"
              disabled={!selectedAccount || isSubmitting}
            />
          </div>
          
          {error && <p className="text-red-500 text-sm mb-4">{error}</p>}
          
          <div className="flex items-center justify-end space-x-4">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-md hover:bg-gray-200"
              disabled={isSubmitting}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-4 py-2 text-sm font-medium text-white bg-primary rounded-md hover:bg-primary-hover disabled:bg-gray-400"
              disabled={isSubmitting || !selectedAccount}
            >
              {isSubmitting ? "Creating..." : "Create Project"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
