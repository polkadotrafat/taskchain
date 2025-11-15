// frontend/app/components/AppealDisputeModal.tsx
"use client";

import { useState } from "react";
import { Project, Dispute } from "../constants";

interface AppealDisputeModalProps {
  project: Project;
  dispute: Dispute;
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => Promise<void>;
  status: string;
}

export const AppealDisputeModal = ({ project, dispute, isOpen, onClose, onConfirm }: AppealDisputeModalProps) => {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async () => {
    setIsSubmitting(true);
    setError("");
    try {
      await onConfirm();
    } catch (err: any) {
      setError(err.message || "An unknown error occurred.");
      setIsSubmitting(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex justify-center items-center z-50">
      <div className="bg-white rounded-lg p-8 w-full max-w-lg">
        <h2 className="text-2xl font-bold mb-4 text-gray-800">Appeal Ruling</h2>
        <div className="text-gray-600 space-y-4 mb-6">
            <p>You are about to appeal the last round's ruling. This will escalate the dispute to a higher-tier jury.</p>
            <ul className="list-disc list-inside bg-yellow-50 border border-yellow-200 p-4 rounded-md text-sm">
                <li>
                    <strong>Escalating Bond:</strong> Appealing requires a significantly larger bond to be reserved from your account. This is to discourage frivolous appeals.
                </li>
                <li>
                    <strong>Higher-Tier Jury:</strong> A new jury will be selected from a more reputable tier (e.g., Silver or Gold).
                </li>
                <li>
                    <strong>Finality:</strong> The appeal process has a limited number of rounds. Be sure this is the course of action you wish to take.
                </li>
            </ul>
            <p>Are you sure you want to appeal?</p>
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
            className="px-4 py-2 text-sm font-medium text-white bg-yellow-600 rounded-md hover:bg-yellow-700 disabled:bg-gray-400"
            disabled={isSubmitting}
          >
            {isSubmitting ? "Appealing..." : "Confirm & Appeal"}
          </button>
        </div>
      </div>
    </div>
  );
};
