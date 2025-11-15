// frontend/app/components/WorkSubmissionModal.tsx
"use client";

import { useState } from "react";
import { useApi } from "../context/ApiContext";
import axios from "axios";
import { Project } from "../constants";

interface WorkSubmissionModalProps {
  project: Project;
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
}

export const WorkSubmissionModal = ({ project, isOpen, onClose, onConfirm }: WorkSubmissionModalProps) => {
  const { api, selectedAccount, signer } = useApi();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [contentHash, setContentHash] = useState("");
  const [uri, setUri] = useState("");
  const [metadata, setMetadata] = useState("");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");

  const handleSubmit = async () => {
    if (!api || !selectedAccount || !signer) {
      setError("Please connect your wallet first.");
      return;
    }

    if (!title || !description) {
      setError("Please fill out the title and description.");
      return;
    }

    setIsSubmitting(true);
    setError("");

    try {
      // 1. Create and upload work details to IPFS
      const workJson = { 
        title, 
        description,
        projectId: project.id,
        submittedBy: selectedAccount.address,
        submittedAt: new Date().toISOString()
      };
      const blob = new Blob([JSON.stringify(workJson)], { type: 'application/json' });
      const formData = new FormData();
      formData.append('file', blob, `work-${project.id}.json`);

      const pinataResponse = await axios.post(
        "https://api.pinata.cloud/pinning/pinFileToIPFS",
        formData,
        {
          headers: {
            'Content-Type': `multipart/form-data; boundary=${(formData as any)._boundary}`,
            'pinata_api_key': process.env.NEXT_PUBLIC_PINATA_API_KEY,
            'pinata_secret_api_key': process.env.NEXT_PUBLIC_PINATA_API_SECRET
          }
        }
      );

      const ipfsHash = pinataResponse.data.IpfsHash;
      if (!ipfsHash) {
        throw new Error("Failed to get IPFS hash from Pinata.");
      }

      // 2. Create hex representation of URI for chain
      const uriHex = "0x" + Buffer.from(ipfsHash).toString('hex');

      // 3. Prepare content hash (use a proper hash in real implementation)
      // For now, using a placeholder hash - in a real implementation, this would be the actual content hash
      const contentHashArray = Array(32).fill(0);
      contentHashArray[0] = 1; // Simple placeholder to make it non-zero

      // 4. Submit work to chain
      const metadataHex = "0x" + Buffer.from(metadata || "Submitted work").toString('hex');

      const extrinsic = api.tx.projects.submitWork(
        project.id,
        new Uint8Array(contentHashArray),
        uriHex,
        metadataHex
      );

      await new Promise<void>((resolve, reject) => {
        extrinsic.signAndSend(
          selectedAccount.address,
          { signer },
          ({ status }) => {
            if (status.isInBlock) {
              console.log(`Transaction included in block: ${status.asInBlock}`);
            }
            if (status.isFinalized) {
              console.log(`Transaction finalized: ${status.asFinalized}`);
              setIsSubmitting(false);
              onConfirm();
              onClose();
              resolve();
            }
          }
        ).catch((error: any) => {
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

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex justify-center items-center z-50">
      <div className="bg-white rounded-lg p-8 w-full max-w-md">
        <h2 className="text-2xl font-bold mb-4 text-gray-800">Submit Work for Project #{project.id}</h2>
        <div className="space-y-4">
          <div>
            <label htmlFor="title" className="block text-sm font-medium text-gray-700">Work Title</label>
            <input
              type="text"
              id="title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="mt-1 block w-full px-3 py-2 bg-white border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm text-gray-900"
              placeholder="Title of the work submitted"
              required
            />
          </div>
          <div>
            <label htmlFor="description" className="block text-sm font-medium text-gray-700">Work Description</label>
            <textarea
              id="description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              className="mt-1 block w-full px-3 py-2 bg-white border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm text-gray-900"
              placeholder="Describe the work you submitted"
              required
            />
          </div>
          <div>
            <label htmlFor="metadata" className="block text-sm font-medium text-gray-700">Metadata (Optional)</label>
            <textarea
              id="metadata"
              value={metadata}
              onChange={(e) => setMetadata(e.target.value)}
              rows={2}
              className="mt-1 block w-full px-3 py-2 bg-white border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm text-gray-900"
              placeholder="Extra metadata about the submission"
            />
          </div>
        </div>

        {error && <p className="text-red-500 text-sm mt-4">{error}</p>}
        <div className="flex items-center justify-end space-x-4 mt-6">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-md hover:bg-gray-200"
            disabled={isSubmitting}
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            className="px-4 py-2 text-sm font-medium text-white bg-primary rounded-md hover:bg-primary-hover disabled:bg-gray-400"
            disabled={isSubmitting}
          >
            {isSubmitting ? "Submitting..." : "Submit Work"}
          </button>
        </div>
      </div>
    </div>
  );
};