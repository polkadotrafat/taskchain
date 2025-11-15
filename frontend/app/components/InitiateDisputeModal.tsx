// frontend/app/components/InitiateDisputeModal.tsx
"use client";

import { useState } from "react";
import { useApi } from "../context/ApiContext";
import { Project } from "../constants";

interface InitiateDisputeModalProps {
  project: Project;
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => Promise<void>;
  status: string;
}

export const InitiateDisputeModal = ({ project, isOpen, onClose, onConfirm, status }: InitiateDisputeModalProps) => {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async () => {
    setIsSubmitting(true);
    setError("");
    try {
      await onConfirm();
      // The parent component will handle closing the modal on success
    } catch (err: any) {
      setError(err.message || "An unknown error occurred.");
      setIsSubmitting(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex justify-center items-center z-50">
      <div className="bg-white rounded-lg p-8 w-full max-w-lg">
        <h2 className="text-2xl font-bold mb-4 text-gray-800">Initiate Dispute for "{project.uri}"</h2>
        <div className="text-gray-600 space-y-4 mb-6">
            <p>You are about to initiate the dispute resolution process for this project. Please review the following information before proceeding.</p>
            <ul className="list-disc list-inside bg-yellow-50 border border-yellow-200 p-4 rounded-md text-sm">
                <li>
                    <strong>Process Start:</strong> This will immediately move the project into the <span className="font-semibold">InDispute</span> state.
                </li>
                <li>
                    <strong>Required Bond:</strong> A small, percentage-based bond will be automatically reserved from your account to prevent spam. This bond is returned if you win the dispute.
                </li>
                <li>
                    <strong>First Round:</strong> The dispute will first be sent to an automated AI Oracle for a quick, impartial ruling.
                </li>
                <li>
                    <strong>Appeals:</strong> If you disagree with the AI's decision, you will have the option to appeal to a human jury.
                </li>
            </ul>
            <p>Are you sure you want to proceed?</p>
        </div>
        
        {error && <p className="text-red-500 text-sm mb-4">{error}</p>}
        {status && <p className="mt-4 text-center text-sm text-gray-500">{status}</p>}
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
            type="button"
            onClick={handleSubmit}
            className="px-4 py-2 text-sm font-medium text-white bg-red-600 rounded-md hover:bg-red-700 disabled:bg-gray-400"
            disabled={isSubmitting}
          >
            {isSubmitting ? "Initiating..." : "Confirm & Initiate Dispute"}
          </button>
        </div>
      </div>
    </div>
  );
};
