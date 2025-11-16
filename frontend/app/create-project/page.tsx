// frontend/app/create-project/page.tsx
"use client";

import { useState, useEffect } from "react";
import { useApi } from "../context/ApiContext";
import axios from "axios";
import Link from "next/link";
import Button from "../components/ui/Button";

export default function CreateProjectPage() {
  const { api, selectedAccount, signer, connect, isConnecting, isApiReady } = useApi();
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [budget, setBudget] = useState("");
  const [duration, setDuration] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  // Check wallet connection on component mount
  useEffect(() => {
    const checkConnection = async () => {
      if (!selectedAccount) {
        try {
          await connect();
        } catch (error) {
          console.error("Failed to connect wallet:", error);
        }
      }
      setIsLoading(false);
    };
    
    checkConnection();
  }, [selectedAccount, connect]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    // More robust wallet connection check
    if (!isApiReady) {
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
      // Check if Pinata credentials are available and not placeholders
      if (
        !process.env.NEXT_PUBLIC_PINATA_API_KEY ||
        !process.env.NEXT_PUBLIC_PINATA_API_SECRET ||
        process.env.NEXT_PUBLIC_PINATA_API_KEY === 'your_pinata_api_key' ||
        process.env.NEXT_PUBLIC_PINATA_API_SECRET === 'your_pinata_api_secret'
      ) {
        throw new Error("Pinata API credentials are not configured or are placeholders. Please check your .env.local file.");
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
      const durationInBlocks = parseInt(duration) * 24 * 60 * 60 / 12;
      const uriHex = "0x" + Buffer.from(ipfsHash).toString('hex');
      
      const extrinsic = api!.tx.projects.createProject(
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
            setSuccess(true);
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

  if (isLoading || isConnecting || !isApiReady) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <h2 className="text-2xl font-bold text-gray-800 mb-4">Loading...</h2>
          <p className="text-gray-600">
            {isConnecting ? "Connecting to wallet..." : !isApiReady ? "Connecting to the network..." : "Loading..."}
          </p>
        </div>
      </div>
    );
  }

  if (!selectedAccount) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <h2 className="text-2xl font-bold text-gray-800 mb-4">Please Connect Your Wallet</h2>
          <p className="text-gray-600 mb-4">You need to connect your wallet to create a project.</p>
          <div className="space-x-4">
            <Button
              onClick={connect}
              disabled={isConnecting}
            >
              {isConnecting ? "Connecting..." : "Connect Wallet"}
            </Button>
            <Link href="/">
              <Button variant="secondary">Go to Marketplace</Button>
            </Link>
          </div>
        </div>
      </div>
    );
  }

  // Rest of your component remains the same...
  if (success) {
    return (
      <div className="max-w-2xl mx-auto p-8 bg-white rounded-lg shadow-md">
        <h1 className="text-3xl font-bold text-green-600 mb-6">Project Created Successfully!</h1>
        <p className="mb-6">Your project has been created and is now available on the marketplace.</p>
        <div className="flex space-x-4">
          <Link href="/">
            <Button>Back to Marketplace</Button>
          </Link>
          <Link href="/dashboard">
            <Button variant="secondary">Go to Dashboard</Button>
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto">
      <h1 className="text-3xl font-bold text-gray-800 mb-8">Create New Project</h1>
      <div className="mb-4 p-4 bg-blue-50 rounded-md">
        <p className="text-sm text-blue-800">
          Connected as: <span className="font-medium">{selectedAccount.meta.name}</span>
          <br />
          Address: <span className="font-mono text-xs">{selectedAccount.address}</span>
        </p>
      </div>

      {/* Rest of your form JSX remains the same */}
      <form onSubmit={handleSubmit} className="bg-white shadow-md rounded-lg p-8">
        {/* ... existing form fields ... */}
        <div className="mb-6">
          <label htmlFor="title" className="block text-sm font-medium text-gray-700 mb-2">Project Title</label>
          <input
            type="text"
            id="title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 text-gray-900"
            placeholder="Enter project title"
            required
          />
        </div>

        <div className="mb-6">
          <label htmlFor="description" className="block text-sm font-medium text-gray-700 mb-2">Project Description</label>
          <textarea
            id="description"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={6}
            className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 text-gray-900"
            placeholder="Describe the project requirements in detail"
            required
          />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
          <div>
            <label htmlFor="budget" className="block text-sm font-medium text-gray-700 mb-2">Budget (Units)</label>
            <input
              type="number"
              id="budget"
              value={budget}
              onChange={(e) => setBudget(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 text-gray-900"
              placeholder="0.00"
              required
              min="0"
              step="0.0001"
            />
          </div>

          <div>
            <label htmlFor="duration" className="block text-sm font-medium text-gray-700 mb-2">Duration (Days)</label>
            <input
              type="number"
              id="duration"
              value={duration}
              onChange={(e) => setDuration(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 text-gray-900"
              placeholder="Duration in days"
              required
              min="1"
            />
          </div>
        </div>

        {error && <p className="text-red-500 text-sm mb-4">{error}</p>}

        <div className="flex items-center justify-end space-x-4 pt-6 border-t border-gray-200">
          <Link href="/">
            <Button variant="secondary">Cancel</Button>
          </Link>
          <Button
            type="submit"
            isLoading={isSubmitting}
            disabled={isSubmitting}
          >
            Create Project
          </Button>
        </div>
      </form>
    </div>
  );
}