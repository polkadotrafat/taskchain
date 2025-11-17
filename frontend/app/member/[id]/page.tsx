// frontend/app/member/[id]/page.tsx
"use client";

import { useEffect, useState } from "react";
import { useApi } from "@/app/context/ApiContext";
import { useParams } from "next/navigation";
import { InjectedAccountWithMeta } from "@polkadot/extension-inject/types";

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

interface JurorConfig {
    min_stake_bronze: string;
    min_stake_silver: string;
    min_stake_gold: string;
}

import { ReputationCard } from "@/app/components/ReputationCard";

// --- Main Page Component ---
export default function MemberProfilePage() {
  const { api, selectedAccount } = useApi();
  const params = useParams();
  const id = params.id as string;

  const [reputation, setReputation] = useState<ReputationData | null>(null);
  const [jurorConfig, setJurorConfig] = useState<JurorConfig | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!api || !id) return;

    const fetchData = async () => {
      setIsLoading(true);
      try {
        // Fetch reputation data and juror tier separately since they are stored in different locations
        const [repCodec, jurorTierCodec] = await Promise.all([
          api.query.reputation.reputationStats(id),
          api.query.reputation.jurorTiers(id)  // Note: jurorTiers not jurorTier
        ]);

        console.log("Raw repCodec:", repCodec);
        console.log("Raw jurorTierCodec:", jurorTierCodec);

        // Process reputation data - it's a Map-like object with raw values
        let repData: RawReputationData | null = null;
        if (repCodec && typeof repCodec.toJSON === 'function') {
          repData = repCodec.toJSON() as RawReputationData;
        } else if (repCodec && repCodec instanceof Map) {
          // Convert Map to regular object
          repData = {};
          for (const [key, value] of repCodec.entries()) {
            (repData as any)[key] = value.toJSON ? value.toJSON() : value;
          }
        } else {
          repData = repCodec as RawReputationData;
        }
        
        console.log("Parsed reputation data:", repData);

        // Process juror tier - handle the case where it might be a fallback value
        let jurorTier = "Unstaked";
        if (jurorTierCodec) {
          try {
            // Check if the juror tier value exists and is not a fallback
            if (jurorTierCodec.isStorageFallback) {
              // If it's a fallback, the account doesn't have a juror tier set
              jurorTier = "Unstaked";
              console.log("Juror tier is a fallback, setting to Unstaked");
            } else {
              // Try to get the juror tier value
              if (typeof jurorTierCodec.toJSON === 'function') {
                const jurorTierData = jurorTierCodec.toJSON();
                console.log("Juror tier data:", jurorTierData);
                if (jurorTierData) {
                  jurorTier = Object.keys(jurorTierData)[0] || "Unstaked";
                }
              } else if (jurorTierCodec && typeof jurorTierCodec === 'object') {
                const jurorTierData = jurorTierCodec as any;
                console.log("Direct juror tier data:", jurorTierData);
                if (jurorTierData) {
                    jurorTier = Object.keys(jurorTierData)[0] || "Unstaked";
                }
              }
            }
          } catch (e) {
            console.error("Error processing juror tier:", e);
            jurorTier = "Unstaked";
          }
        }

        // Map chain data to frontend interface with proper field mapping
        if (repData) {
            const mappedReputation: ReputationData = {
            projects_completed: repData.projectsCompleted || repData.projects_completed || 0,
            projects_accepted: repData.projectsCompleted || repData.projects_completed || 0, // Map projects_completed to projects_accepted
            total_earned: String(api.createType('Balance', repData.totalEarned || repData.total_earned || 0).toHuman()),
            total_spent: String(api.createType('Balance', repData.totalSpent || repData.total_spent || 0).toHuman()),
            positive_feedback: repData.totalRatingsReceived || repData.total_ratings_received || 0, // Map total_ratings to positive feedback
            negative_feedback: 0, // This might need to be calculated differently
            disputes_won: repData.disputesWon || repData.disputes_won || 0,
            disputes_lost: repData.disputesLost || repData.disputes_lost || 0,
            juror_tier: jurorTier,
            jury_votes_cast: repData.juryParticipation || repData.jury_participation || 0,
            jury_votes_correct: 0, // This needs to be calculated from jury_accuracy
            };
            console.log("Final mapped reputation data:", mappedReputation);
            setReputation(mappedReputation);
        }

        // Set default juror configuration since jurorConfig() doesn't exist in the chain
        setJurorConfig({
          min_stake_bronze: "100.0000 UNIT", // Placeholder values
          min_stake_silver: "1,000.0000 UNIT",
          min_stake_gold: "10,000.0000 UNIT",
        });

      } catch (e: any) {
        setError(e.message || "Failed to fetch data.");
        console.error("Error in fetchData:", e);
      } finally {
        setIsLoading(false);
      }
    };

    fetchData();
  }, [api, id]);

  if (isLoading) return <div className="text-center p-10">Loading reputation...</div>;
  if (error) return <div className="text-center p-10 text-red-500">{error}</div>;
  if (!reputation) return <div className="text-center p-10">No data available for this user.</div>;

  const isOwnProfile = selectedAccount?.address === id;

  return (
    <div className="max-w-4xl mx-auto">
      <div className="mb-6">
        <h1 className="text-3xl font-bold text-gray-800">User Profile</h1>
        <p className="text-sm font-mono text-gray-500 break-all">{id}</p>
      </div>
      <div className="mb-6">
        <ReputationCard reputation={reputation} />
      </div>
      {isOwnProfile && jurorConfig && (
        <JurorStaking reputation={reputation} jurorConfig={jurorConfig} />
      )}
      {isOwnProfile && !jurorConfig && (
        <div className="bg-white shadow-md rounded-lg p-8">
          <h2 className="text-xl font-bold mb-4">Juror Actions</h2>
          <p className="text-gray-500">Juror configuration is not available.</p>
        </div>
      )}
    </div>
  );
}



import { useRouter } from "next/navigation";

// --- JurorStaking Component ---
const JurorStaking = ({ reputation, jurorConfig }: { reputation: ReputationData, jurorConfig: JurorConfig }) => {
    const { api, selectedAccount, signer } = useApi();
    const [isSubmitting, setIsSubmitting] = useState(false);
    const router = useRouter();

    const handleStake = async () => {
        if (!api || !selectedAccount || !signer) return;
        setIsSubmitting(true);
        const tx = api.tx.reputation.stakeAsJuror();
        await tx.signAndSend(selectedAccount.address, { signer }, ({ status }) => {
            if (status.isFinalized) router.refresh();
        }).catch(err => {
            console.error(err);
            setIsSubmitting(false);
        });
    };

    const handleUnstake = async () => {
        if (!api || !selectedAccount || !signer) return;
        setIsSubmitting(true);
        const tx = api.tx.reputation.unstakeAsJuror();
        await tx.signAndSend(selectedAccount.address, { signer }, ({ status }) => {
            if (status.isFinalized) router.refresh();
        }).catch(err => {
            console.error(err);
            setIsSubmitting(false);
        });
    };

    const isStaked = reputation.juror_tier !== 'Ineligible' && reputation.juror_tier !== 'Unstaked';
    const canStake = reputation.juror_tier === 'Unstaked';

    return (
        <div className="bg-white shadow-md rounded-lg p-8">
            <h2 className="text-xl font-bold mb-4">Juror Actions</h2>
            {isStaked && (
                <div>
                    <p className="mb-4 text-gray-600">You are currently staked as a juror. You can unstake at any time.</p>
                    <button onClick={handleUnstake} disabled={isSubmitting} className="action-button bg-primary hover:bg-primary-hover text-white">
                        {isSubmitting ? 'Unstaking...' : 'Unstake'}
                    </button>
                </div>
            )}
            {canStake && (
                <div>
                    <p className="mb-4 text-gray-600">You are eligible to become a juror. Stake the required amount to join the juror pool.</p>
                    <p className="mb-2 text-sm text-gray-500">Required Stake (Bronze): {jurorConfig.min_stake_bronze}</p>
                    <button onClick={handleStake} disabled={isSubmitting} className="action-button bg-primary hover:bg-primary-hover text-white">
                        {isSubmitting ? 'Staking...' : 'Become a Juror'}
                    </button>
                </div>
            )}
            {reputation.juror_tier === 'Ineligible' && (
                <p className="text-gray-500">Your reputation score does not currently meet the requirements to be a juror.</p>
            )}
        </div>
    );
};