// frontend/app/member/[accountId]/page.tsx
"use client";

import { useEffect, useState } from "react";
import { useApi } from "@/app/context/ApiContext";
import { useParams } from "next/navigation";
import { InjectedAccountWithMeta } from "@polkadot/extension-inject/types";

// --- Types ---
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
  const accountId = params.accountId as string;

  const [reputation, setReputation] = useState<ReputationData | null>(null);
  const [jurorConfig, setJurorConfig] = useState<JurorConfig | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!api || !accountId) return;

    const fetchData = async () => {
      setIsLoading(true);
      try {
        const [repDataCodec, configCodec] = await Promise.all([
            api.query.reputation.reputations(accountId),
            api.query.reputation.jurorConfig()
        ]);

        if ((repDataCodec as any).isNone) {
          setError("This account has no reputation data yet.");
          setIsLoading(false);
          return;
        }

        const rep = (repDataCodec as any).unwrap().toJSON() as any;
        const config = configCodec.toJSON() as any;

        setReputation({
          ...rep,
          total_earned: String(api.createType('Balance', rep.total_earned).toHuman()),
          total_spent: String(api.createType('Balance', rep.total_spent).toHuman()),
          juror_tier: Object.keys(rep.juror_tier)[0],
        });

        setJurorConfig({
            min_stake_bronze: String(api.createType('Balance', config.min_stake_bronze).toHuman()),
            min_stake_silver: String(api.createType('Balance', config.min_stake_silver).toHuman()),
            min_stake_gold: String(api.createType('Balance', config.min_stake_gold).toHuman()),
        });

      } catch (e: any) {
        setError(e.message || "Failed to fetch data.");
        console.error(e);
      } finally {
        setIsLoading(false);
      }
    };

    fetchData();
  }, [api, accountId]);

  if (isLoading) return <div className="text-center p-10">Loading reputation...</div>;
  if (error) return <div className="text-center p-10 text-red-500">{error}</div>;
  if (!reputation) return <div className="text-center p-10">No data available for this user.</div>;

  const isOwnProfile = selectedAccount?.address === accountId;

  return (
    <div className="max-w-4xl mx-auto">
      <div className="mb-6">
        <h1 className="text-3xl font-bold text-gray-800">User Profile</h1>
        <p className="text-sm font-mono text-gray-500 break-all">{accountId}</p>
      </div>
      <div className="mb-6">
        <ReputationCard reputation={reputation} />
      </div>
      {isOwnProfile && jurorConfig && (
        <JurorStaking reputation={reputation} jurorConfig={jurorConfig} />
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
                    <button onClick={handleUnstake} disabled={isSubmitting} className="action-button bg-red-500 hover:bg-red-600">
                        {isSubmitting ? 'Unstaking...' : 'Unstake'}
                    </button>
                </div>
            )}
            {canStake && (
                <div>
                    <p className="mb-4 text-gray-600">You are eligible to become a juror. Stake the required amount to join the juror pool.</p>
                    <p className="mb-2 text-sm text-gray-500">Required Stake (Bronze): {jurorConfig.min_stake_bronze}</p>
                    <button onClick={handleStake} disabled={isSubmitting} className="action-button">
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
