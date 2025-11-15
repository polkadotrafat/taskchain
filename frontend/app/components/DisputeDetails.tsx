// frontend/app/components/DisputeDetails.tsx
"use client";

import { useState, useEffect } from "react";
import { useApi } from "../context/ApiContext";
import { AppealDisputeModal } from "./AppealDisputeModal";
import { InjectedAccountWithMeta } from "@polkadot/extension-inject/types";
import { Dispute, Project } from "../constants";

interface DisputeDetailsProps {
  project: Project;
  currentUser: InjectedAccountWithMeta;
}

export const DisputeDetails = ({ project, currentUser }: DisputeDetailsProps) => {
  const { api, signer } = useApi();
  const [dispute, setDispute] = useState<Dispute | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");
  const [isAppealModalOpen, setIsAppealModalOpen] = useState(false);

  useEffect(() => {
    if (!api) return;

    const fetchDispute = async () => {
      setIsLoading(true);
      try {
        const disputeData = await api.query.arbitration.disputes(project.id);
        if ((disputeData as any).isNone) {
          setError("No dispute found for this project");
          setIsLoading(false);
          return;
        }

        const disputeJson = (disputeData as any).unwrap().toJSON() as any;

        // Process the dispute data
        const processedDispute: Dispute = {
          status: Object.keys(disputeJson.status)[0],
          round: disputeJson.round,
          ruling: disputeJson.ruling ? Object.keys(disputeJson.ruling)[0] : null,
          jurors: disputeJson.jurors || [],
          evidenceUri: disputeJson.evidenceUri ? Buffer.from(disputeJson.evidenceUri.slice(2), 'hex').toString('utf8') : "",
          startBlock: disputeJson.startBlock,
        };

        setDispute(processedDispute);
      } catch (err) {
        console.error("Error fetching dispute:", err);
        setError("Failed to fetch dispute data");
      } finally {
        setIsLoading(false);
      }
    };

    fetchDispute();
  }, [api, project.id]);

  const handleAppealRuling = async () => {
    if (!api || !signer || !dispute) return;

    try {
      const extrinsic = api.tx.arbitration.appealRuling(
        project.id,
        dispute.evidenceUri
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
              resolve();
            }
          }
        ).catch((error: any) => {
          console.error("Transaction failed:", error);
          reject(error);
        });
      });

      setIsAppealModalOpen(false);
      // Refresh dispute data
      if (api) {
        const disputeData = await api.query.arbitration.disputes(project.id);
        if ((disputeData as any).isSome) {
          const disputeJson = (disputeData as any).unwrap().toJSON() as any;
          const processedDispute: Dispute = {
            status: Object.keys(disputeJson.status)[0],
            round: disputeJson.round,
            ruling: disputeJson.ruling ? Object.keys(disputeJson.ruling)[0] : null,
            jurors: disputeJson.jurors || [],
            evidenceUri: disputeJson.evidenceUri ? Buffer.from(disputeJson.evidenceUri.slice(2), 'hex').toString('utf8') : "",
            startBlock: disputeJson.startBlock,
          };
          setDispute(processedDispute);
        }
      }
    } catch (err) {
      console.error("Error appealing ruling:", err);
      setError("Failed to appeal ruling");
    }
  };

  if (isLoading) return <div className="text-center p-4">Loading dispute details...</div>;
  if (error) return <div className="text-center p-4 text-red-500">{error}</div>;
  if (!dispute) return <div className="text-center p-4">No dispute data available</div>;

  return (
    <div className="bg-white shadow-md rounded-lg p-6 mb-6">
      <h2 className="text-xl font-bold mb-4">Dispute Details</h2>
      
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
        <div className="bg-gray-50 p-3 rounded-md">
          <h4 className="font-semibold text-gray-500">Status</h4>
          <p className="text-lg font-semibold text-gray-900">{dispute.status}</p>
        </div>
        <div className="bg-gray-50 p-3 rounded-md">
          <h4 className="font-semibold text-gray-500">Round</h4>
          <p className="text-lg font-semibold text-gray-900">Round {dispute.round}</p>
        </div>
        <div className="bg-gray-50 p-3 rounded-md">
          <h4 className="font-semibold text-gray-500">Ruling</h4>
          <p className="text-lg font-semibold text-gray-900">{dispute.ruling || "Pending"}</p>
        </div>
        <div className="bg-gray-50 p-3 rounded-md">
          <h4 className="font-semibold text-gray-500">Evidence URI</h4>
          <p className="text-sm font-mono text-gray-900 break-all">{dispute.evidenceUri}</p>
        </div>
      </div>

      {/* Jurors section */}
      {dispute.jurors.length > 0 && (
        <div className="mb-4">
          <h4 className="font-semibold text-gray-500">Jurors</h4>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
            {dispute.jurors.map(([juror, hasVoted], index) => (
              <div 
                key={index} 
                className={`p-2 rounded-md text-center ${
                  hasVoted ? 'bg-green-100 text-green-800' : 'bg-yellow-100 text-yellow-800'
                }`}
              >
                <p className="text-xs truncate">{juror.substring(0, 8)}...</p>
                <p className="text-xs">{hasVoted ? 'Voted' : 'Not Voted'}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Actions */}
      <div className="mt-4">
        {dispute.status === 'Appealable' && (
          <button 
            onClick={() => setIsAppealModalOpen(true)}
            className="bg-yellow-600 hover:bg-yellow-700 text-white font-medium py-2 px-4 rounded-md"
          >
            Appeal Ruling
          </button>
        )}
      </div>

      <AppealDisputeModal
        project={project}
        dispute={dispute}
        isOpen={isAppealModalOpen}
        onClose={() => setIsAppealModalOpen(false)}
        onConfirm={handleAppealRuling}
        status={dispute.status}
      />
    </div>
  );
};