// frontend/app/components/JurorRegistrationModal.tsx
"use client";

import { useState } from "react";
import { useApi } from "../context/ApiContext";
import { Project } from "../constants";

interface JurorRegistrationModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
}

export const JurorRegistrationModal = ({ isOpen, onClose, onConfirm }: JurorRegistrationModalProps) => {
  const { api, selectedAccount, signer } = useApi();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async () => {
    if (!api || !selectedAccount || !signer) {
      setError("Please connect your wallet first.");
      return;
    }

    setIsSubmitting(true);
    setError("");

    try {
      const extrinsic = api.tx.reputation.registerAsJuror();

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
      <div className="bg-white rounded-lg p-8 w-full max-w-lg">
        <h2 className="text-2xl font-bold mb-4 text-gray-800">Become a Juror</h2>
        <div className="text-gray-600 space-y-4 mb-6">
            <p>You are about to register as a juror for the dispute resolution system. Please review the following information before proceeding.</p>
            <ul className="list-disc list-inside bg-yellow-50 border border-yellow-200 p-4 rounded-md text-sm">
                <li>
                    <strong>Staking Required:</strong> A portion of your tokens will be reserved as a stake when you register as a juror. This ensures you have "skin in the game" and incentivizes fair voting.
                </li>
                <li>
                    <strong>Reputation Threshold:</strong> You must have sufficient reputation to qualify as a juror. This is calculated based on your completed projects, ratings, and other factors.
                </li>
                <li>
                    <strong>Jury Participation:</strong> You may be randomly selected to participate in dispute resolution rounds. Your participation helps maintain the integrity of the system.
                </li>
                <li>
                    <strong>Economic Incentives:</strong> Jurors who vote with the majority will receive rewards, while those who vote against the majority may face penalties.
                </li>
            </ul>
            <p>Are you sure you want to register as a juror?</p>
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
            className="px-4 py-2 text-sm font-medium text-white bg-primary rounded-md hover:bg-primary-hover disabled:bg-gray-400"
            disabled={isSubmitting}
          >
            {isSubmitting ? "Registering..." : "Confirm & Register"}
          </button>
        </div>
      </div>
    </div>
  );
};