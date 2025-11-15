// frontend/app/member/[address]/page.tsx
"use client";

import { useEffect, useState } from "react";
import { useApi } from "@/app/context/ApiContext";
import { useParams } from "next/navigation";
import { ReputationCard } from "@/app/components/ReputationCard";

// --- Types ---
interface RawReputationData {
  projectsCompleted?: any;
  projects_completed?: any;
  totalEarned?: any;
  total_earned?: any;
  totalSpent?: any;
  total_spent?: any;
  totalRatingsReceived?: any;
  total_ratings_received?: any;
  disputesWon?: any;
  disputes_won?: any;
  disputesLost?: any;
  disputes_lost?: any;
  juryParticipation?: any;
  jury_participation?: any;
  jury_accuracy?: any;
}

interface ReputationData {
    projects_completed: number;
    projects_accepted: number;
    total_earned: string;
    total_spent: string;
    positive_feedback: number;
    negative_feedback: number;
    disputes_won: number;
    disputes_lost: number;
    juror_tier: string;
    jury_votes_cast: number;
    jury_votes_correct: number;
}

interface MemberProfileProps {
  address: string;
}

export default function MemberProfile() {
  const { api } = useApi();
  const params = useParams();
  const address = params.address as string;

  const [reputation, setReputation] = useState<ReputationData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");
  const [isRegistered, setIsRegistered] = useState(false);

  useEffect(() => {
    if (!api || !address) return;

    const fetchReputation = async () => {
      setIsLoading(true);
      try {
        // Check if user is registered
        const repCodec = await api.query.reputation.reputationStats(address);
        
        if ((repCodec as any).isNone) {
          setIsRegistered(false);
          setReputation(null);
        } else {
          setIsRegistered(true);
          
          // Process reputation data
          const repData = (repCodec as any).unwrap().toJSON() as RawReputationData;
          
          // Process juror tier
          const jurorTierCodec = await api.query.reputation.jurorTiers(address);
          let jurorTier = "Unstaked";
          if ((jurorTierCodec as any).isSome) {
            const jurorTierData = (jurorTierCodec as any).unwrap().toJSON() as any;
            jurorTier = Object.keys(jurorTierData)[0] || "Unstaked";
          }

          // Calculate jury votes correct from jury_accuracy if possible
          let jury_votes_correct = 0;
          if (repData.jury_accuracy) {
            const accuracy = repData.jury_accuracy;
            const totalVotes = repData.juryParticipation || repData.jury_participation || 0;
            if (typeof accuracy === 'object' && accuracy.percentage) {
              jury_votes_correct = Math.round((accuracy.percentage * totalVotes) / 100);
            } else if (typeof accuracy === 'number') {
              jury_votes_correct = Math.round((accuracy / 1000000) * totalVotes);
            }
          }

          const mappedReputation: ReputationData = {
            projects_completed: repData.projectsCompleted || repData.projects_completed || 0,
            projects_accepted: repData.projectsCompleted || repData.projects_completed || 0,
            total_earned: String(api.createType('Balance', repData.totalEarned || repData.total_earned || 0).toHuman()),
            total_spent: String(api.createType('Balance', repData.totalSpent || repData.total_spent || 0).toHuman()),
            positive_feedback: repData.totalRatingsReceived || repData.total_ratings_received || 0,
            negative_feedback: 0,
            disputes_won: repData.disputesWon || repData.disputes_won || 0,
            disputes_lost: repData.disputesLost || repData.disputes_lost || 0,
            juror_tier: jurorTier,
            jury_votes_cast: repData.juryParticipation || repData.jury_participation || 0,
            jury_votes_correct: jury_votes_correct,
          };
          
          setReputation(mappedReputation);
        }
      } catch (err) {
        console.error("Error fetching reputation:", err);
        setError("Failed to load member profile");
      } finally {
        setIsLoading(false);
      }
    };

    fetchReputation();
  }, [api, address]);

  if (isLoading) return <div className="text-center p-10">Loading profile...</div>;
  if (error) return <div className="text-center p-10 text-red-500">{error}</div>;

  return (
    <div className="max-w-4xl mx-auto">
      <h1 className="text-3xl font-bold text-gray-800 mb-8">Member Profile</h1>
      
      <div className="bg-white shadow-md rounded-lg p-8 mb-8">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-2xl font-bold text-gray-800">
            {address.substring(0, 6)}...{address.substring(address.length - 4)}
          </h2>
          <span className={`px-3 py-1 rounded-full text-sm font-semibold ${
            isRegistered ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
          }`}>
            {isRegistered ? 'Registered' : 'Not Registered'}
          </span>
        </div>
        
        <div className="mb-6">
          <h3 className="text-lg font-semibold text-gray-700 mb-2">Address</h3>
          <p className="font-mono bg-gray-100 p-3 rounded-md break-all">{address}</p>
        </div>
        
        {isRegistered ? (
          <div>
            <h3 className="text-lg font-semibold text-gray-700 mb-4">Reputation</h3>
            <ReputationCard reputation={reputation!} />
          </div>
        ) : (
          <p className="text-gray-500">This member has not registered on TaskChain yet.</p>
        )}
      </div>
    </div>
  );
}