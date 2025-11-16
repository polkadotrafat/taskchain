// frontend/app/jury/page.tsx
"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useApi } from "@/app/context/ApiContext";
import { JuryVoteModal } from "@/app/components/JuryVoteModal";
import { Dispute } from "@/app/constants";

// Define dispute type
interface JurorDispute {
  id: number;
  projectId: number;
  status: string;
  round: number;
  ruling: string | null;
  jurors: [string, boolean][];
  evidenceUri: string;
  startBlock: number;
  hasVoted: boolean;
}


export default function JuryDashboard() {
  const { api, selectedAccount } = useApi();
  const [disputes, setDisputes] = useState<JurorDispute[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");
  const [selectedDispute, setSelectedDispute] = useState<JurorDispute | null>(null);
  const [isVoteModalOpen, setIsVoteModalOpen] = useState(false);

  useEffect(() => {
    if (!api || !selectedAccount) return;

    const fetchJurorDisputes = async () => {
      setIsLoading(true);
      try {
        // Fetch all disputes to find ones where the user is a juror
        const disputeEntries = await api.query.arbitration.disputes.entries();
        
        const jurorDisputes = [];
        for (const [key, value] of disputeEntries) {
          const id = Number(key.args[0].toString());
          if ((value as any).isSome) {
            const disputeData = (value as any).unwrap().toJSON() as any;
            
            // Check if user is a juror in this dispute
            const isJuror = disputeData.jurors && Array.isArray(disputeData.jurors) 
              && disputeData.jurors.some((juror: [string, boolean]) => 
                  juror[0] === selectedAccount.address);
            
            if (isJuror) {
              const jurorEntry = disputeData.jurors.find((juror: [string, boolean]) => 
                juror[0] === selectedAccount.address);
              const hasVoted = jurorEntry ? jurorEntry[1] : false;
              
              const jurorDispute: JurorDispute = {
                id,
                projectId: id,
                status: Object.keys(disputeData.status)[0],
                round: disputeData.round,
                ruling: disputeData.ruling ? Object.keys(disputeData.ruling)[0] : null,
                jurors: disputeData.jurors || [],
                evidenceUri: disputeData.evidenceUri ? Buffer.from(disputeData.evidenceUri.slice(2), 'hex').toString('utf8') : "",
                startBlock: disputeData.startBlock,
                hasVoted
              };
              jurorDisputes.push(jurorDispute);
            }
          }
        }
        
        setDisputes(jurorDisputes);
      } catch (err) {
        console.error("Error fetching juror disputes:", err);
        setError("Failed to load jury duties");
      } finally {
        setIsLoading(false);
      }
    };

    fetchJurorDisputes();
  }, [api, selectedAccount]);

  const handleVote = (dispute: JurorDispute) => {
    setSelectedDispute(dispute);
    setIsVoteModalOpen(true);
  };

  if (!selectedAccount) {
    return (
      <div className="text-center p-10">
        <h1 className="text-2xl font-bold mb-4">Connect your wallet</h1>
        <p>Please connect your wallet to access your jury duties.</p>
      </div>
    );
  }

  if (isLoading) return <div className="text-center p-10">Loading jury duties...</div>;
  if (error) return <div className="text-center p-10 text-red-500">{error}</div>;

  return (
    <div className="max-w-4xl mx-auto">
      <h1 className="text-3xl font-bold text-gray-800 mb-8">Jury Dashboard</h1>
      
      <div className="mb-8 bg-white shadow-md rounded-lg p-6">
        <h2 className="text-xl font-bold mb-4">Your Jury Duties</h2>
        {disputes.length > 0 ? (
          <div className="space-y-4">
            {disputes.map(dispute => (
              <div key={dispute.id} className="border border-gray-200 rounded-md p-4">
                <div className="flex justify-between items-center">
                  <div>
                    <h3 className="font-medium">Dispute for Project #{dispute.projectId}</h3>
                    <p className="text-sm text-gray-600">
                      Round {dispute.round} | Status: {dispute.status} | {dispute.hasVoted ? 'Voted' : 'Pending Vote'}
                    </p>
                  </div>
                  <div className="flex space-x-2">
                    <Link 
                      href={`/project/${dispute.projectId}`}
                      className="px-3 py-1 bg-gray-100 text-gray-800 rounded-md text-sm hover:bg-gray-200"
                    >
                      View Project
                    </Link>
                    {dispute.status === 'Voting' && !dispute.hasVoted && (
                      <button
                        onClick={() => handleVote(dispute)}
                        className="px-3 py-1 bg-blue-600 text-white rounded-md text-sm hover:bg-blue-700"
                      >
                        Cast Vote
                      </button>
                    )}
                  </div>
                </div>
                {dispute.evidenceUri && (
                  <p className="text-sm text-gray-500 mt-2 break-all">Evidence: {dispute.evidenceUri}</p>
                )}
              </div>
            ))}
          </div>
        ) : (
          <p className="text-gray-500">You have no active jury duties at this time.</p>
        )}
      </div>
      
      {selectedDispute && (
        <JuryVoteModal
          project={{ id: selectedDispute.projectId, client: "unknown", freelancer: null, status: "InDispute", uri: "" }}
          dispute={selectedDispute as Dispute}
          isOpen={isVoteModalOpen}
          onClose={() => setIsVoteModalOpen(false)}
          currentUser={selectedAccount}
        />
      )}
    </div>
  );
}