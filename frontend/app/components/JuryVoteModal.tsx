// frontend/app/components/JuryVoteModal.tsx
"use client";

import { useState } from "react";
import { useApi } from "../context/ApiContext";
import { InjectedAccountWithMeta } from "@polkadot/extension-inject/types";
import { Dispute, Project } from "../constants";

interface JuryVoteModalProps {
  project: Project;
  dispute: Dispute;
  isOpen: boolean;
  onClose: () => void;
  currentUser: InjectedAccountWithMeta;
}

export const JuryVoteModal = ({ project, dispute, isOpen, onClose, currentUser }: JuryVoteModalProps) => {
  const { api, signer } = useApi();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [selectedVote, setSelectedVote] = useState<'ForClient' | 'ForFreelancer' | null>(null);

  const handleSubmit = async () => {
    if (!api || !signer || !selectedVote) return;

    setIsSubmitting(true);
    setError("");

    try {
      const extrinsic = api.tx.arbitration.castVote(
        project.id,
        selectedVote === 'ForClient' ? { ForClient: null } : { ForFreelancer: null }
      );

      await new Promise<void>((resolve, reject) => {
        extrinsic.signAndSend(
          currentUser.address,
          { signer },
          ({ status }) => {
            if (status.isInBlock) {
              console.log(`Transaction included in block: ${status.asInBlock}`);
            }
            if (status.isFinalized) {
              console.log(`Transaction finalized: ${status.asFinalized}`);
              setIsSubmitting(false);
              resolve();
              onClose();
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
      <div className="bg-white rounded-lg p-8 w-full max-w-lg">
        <h2 className="text-2xl font-bold mb-4 text-gray-800">Cast Your Jury Vote</h2>
        <div className="text-gray-600 space-y-4 mb-6">
            <p>You are selected as a juror for this dispute. Please review the evidence and cast your vote.</p>
            <div className="bg-blue-50 border border-blue-200 p-4 rounded-md text-sm">
              <h4 className="font-semibold">Evidence:</h4>
              <p className="mt-2 break-all">{dispute.evidenceUri}</p>
            </div>
            
            <div className="mt-4">
              <h4 className="font-semibold">Who do you believe is in the right?</h4>
              <div className="flex space-x-4 mt-2">
                <button 
                  onClick={() => setSelectedVote('ForClient')}
                  className={`flex-1 py-2 px-4 rounded-md border ${
                    selectedVote === 'ForClient' 
                      ? 'bg-blue-100 border-blue-500 text-blue-700' 
                      : 'bg-gray-100 border-gray-300 text-gray-700'
                  }`}
                >
                  Client
                </button>
                <button 
                  onClick={() => setSelectedVote('ForFreelancer')}
                  className={`flex-1 py-2 px-4 rounded-md border ${
                    selectedVote === 'ForFreelancer' 
                      ? 'bg-green-100 border-green-500 text-green-700' 
                      : 'bg-gray-100 border-gray-300 text-gray-700'
                  }`}
                >
                  Freelancer
                </button>
              </div>
            </div>
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
            type="button"
            onClick={handleSubmit}
            disabled={isSubmitting || !selectedVote}
            className={`px-4 py-2 text-sm font-medium text-white rounded-md ${
              isSubmitting || !selectedVote
                ? 'bg-gray-400'
                : 'bg-primary hover:bg-primary-hover'
            }`}
          >
            {isSubmitting ? "Submitting..." : "Cast Vote"}
          </button>
        </div>
      </div>
    </div>
  );
};