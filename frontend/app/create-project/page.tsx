// frontend/app/create-project/page.tsx
"use client";

import { useState } from "react";
import { useApi } from "../context/ApiContext";
import axios from "axios";
import Link from "next/link";

export default function CreateProjectPage() {
  const { api, selectedAccount, signer } = useApi();
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [budget, setBudget] = useState("");
  const [duration, setDuration] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!api || !selectedAccount || !signer) {
      setError("Please connect your wallet first.");
      return;
    }
    if (!title || !description || !budget || !duration) {
      setError("Please fill out all fields.");
      return;
    }

    setIsSubmitting(true);
    setError("");

    try {
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
            'Content-Type': `multipart/form-data; boundary=${(data as any)._boundary}`,
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
      const durationInBlocks = parseInt(duration) * 24 * 60 * 60 / 12; // Assuming 12s block time
      const uriHex = "0x" + Buffer.from(ipfsHash).toString('hex');
      const extrinsic = api.tx.projects.createProject(budgetInPlanck.toString(), uriHex, durationInBlocks);

      await new Promise<void>((resolve, reject) => {
        extrinsic.signAndSend(selectedAccount.address, { signer }, ({ status }) => {
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
          reject(error);
        });
      });

    } catch (err: any) {
      setError(err.message || "An unknown error occurred.");
      setIsSubmitting(false);
    }
  };

  if (!selectedAccount) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <h2 className="text-2xl font-bold text-gray-800 mb-4">Please Connect Your Wallet</h2>
          <p className="text-gray-600 mb-4">You need to connect your wallet to create a project.</p>
          <Link
            href="/"
            className="px-4 py-2 bg-primary text-white rounded-md hover:bg-primary-hover"
          >
            Go to Marketplace
          </Link>
        </div>
      </div>
    );
  }

  if (success) {
    return (
      <div className="max-w-2xl mx-auto p-8 bg-white rounded-lg shadow-md">
        <h1 className="text-3xl font-bold text-green-600 mb-6">Project Created Successfully!</h1>
        <p className="mb-6">Your project has been created and is now available on the marketplace.</p>
        <div className="flex space-x-4">
          <Link
            href="/"
            className="px-4 py-2 bg-primary text-white rounded-md hover:bg-primary-hover"
          >
            Back to Marketplace
          </Link>
          <Link
            href="/dashboard"
            className="px-4 py-2 bg-gray-200 text-gray-800 rounded-md hover:bg-gray-300"
          >
            Go to Dashboard
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto">
      <h1 className="text-3xl font-bold text-gray-800 mb-8">Create New Project</h1>

      <form onSubmit={handleSubmit} className="bg-white shadow-md rounded-lg p-8">
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
          <Link
            href="/"
            className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-md hover:bg-gray-200"
          >
            Cancel
          </Link>
          <button
            type="submit"
            className="px-4 py-2 text-sm font-medium text-white bg-primary rounded-md hover:bg-primary-hover disabled:bg-gray-400"
            disabled={isSubmitting}
          >
            {isSubmitting ? "Creating Project..." : "Create Project"}
          </button>
        </div>
      </form>
    </div>
  );
}