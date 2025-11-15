// frontend/app/dashboard/page.tsx
"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useApi } from "@/app/context/ApiContext";
import { ReputationCard } from "@/app/components/ReputationCard";
import { ProjectCard } from "@/app/components/ProjectCard";
import { JurorRegistrationModal } from "@/app/components/JurorRegistrationModal";

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
  registration_block?: any;
  last_activity_block?: any;
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

interface Project {
  id: number;
  client: string;
  freelancer: string | null;
  budget: string;
  status: string;
  uri: string;
}

// --- Main Dashboard Page Component ---
export default function DashboardPage() {
    const { api, selectedAccount, signer } = useApi();

    const [reputation, setReputation] = useState<ReputationData | null>(null);
    const [projects, setProjects] = useState<Project[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState("");
    const [jurorRegistrationModalOpen, setJurorRegistrationModalOpen] = useState(false);
    const [activeDisputes, setActiveDisputes] = useState<any[]>([]);

    useEffect(() => {
        if (!api || !selectedAccount) {
            setIsLoading(false);
            return;
        };

        const fetchData = async () => {
            setIsLoading(true);
            try {
                const [repCodec, jurorTierCodec, projectEntries, disputeEntries] = await Promise.all([
                    api.query.reputation.reputationStats(selectedAccount.address),
                    api.query.reputation.jurorTiers(selectedAccount.address),  // Note: jurorTiers not jurorTier
                    api.query.projects.projects.entries(),
                    api.query.arbitration.disputes.entries()  // Fetch all disputes
                ]);

                console.log("Dashboard - Raw repCodec:", repCodec);
                console.log("Dashboard - Raw jurorTierCodec:", jurorTierCodec);

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

                console.log("Dashboard - Parsed reputation data:", repData);

                // Process juror tier - handle the case where it might be a fallback value
                let jurorTier = "Unstaked";
                if (jurorTierCodec) {
                  try {
                    // Check if the juror tier value exists and is not a fallback
                    if (jurorTierCodec.isStorageFallback) {
                      // If it's a fallback, the account doesn't have a juror tier set
                      jurorTier = "Unstaked";
                      console.log("Dashboard - Juror tier is a fallback, setting to Unstaked");
                    } else {
                      // Try to get the juror tier value
                      if (typeof jurorTierCodec.toJSON === 'function') {
                        const jurorTierData = jurorTierCodec.toJSON();
                        console.log("Dashboard - Juror tier data:", jurorTierData);
                        if (jurorTierData) {
                          jurorTier = Object.keys(jurorTierData)[0] || "Unstaked";
                        }
                      } else if (jurorTierCodec && typeof jurorTierCodec === 'object') {
                        const jurorTierData = jurorTierCodec as any;
                        console.log("Dashboard - Direct juror tier data:", jurorTierData);
                        if (jurorTierData) {
                            jurorTier = Object.keys(jurorTierData)[0] || "Unstaked";
                        }
                      }
                    }
                  } catch (e) {
                    console.error("Dashboard - Error processing juror tier:", e);
                    jurorTier = "Unstaked";
                  }
                }

                // Map chain data to frontend interface with proper field mapping
                if (repData) {
                    // Calculate jury votes correct from jury_accuracy if possible
                    let jury_votes_correct = 0;
                    if (repData.jury_accuracy) {
                      // jury_accuracy is a Permill - convert to an estimated number of correct votes
                      // This is a simplified calculation, could be more precise
                      const accuracy = repData.jury_accuracy;
                      const totalVotes = repData.juryParticipation || repData.jury_participation || 0;
                      if (typeof accuracy === 'object' && accuracy.percentage) {
                        jury_votes_correct = Math.round((accuracy.percentage * totalVotes) / 100);
                      } else if (typeof accuracy === 'number') {
                        // accuracy as parts per million
                        jury_votes_correct = Math.round((accuracy / 1000000) * totalVotes);
                      }
                    }

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
                    jury_votes_correct: jury_votes_correct,
                    };
                    console.log("Dashboard - Final mapped reputation data:", mappedReputation);
                    setReputation(mappedReputation);
                }

                // 2. Process and Filter Projects
                const allProjects = projectEntries.map(([key, value]: [any, any]) => {
                    const id = Number(key.args[0].toString());
                    // Safely unwrap the project value
                    let pd;
                    if (value && (value as any).isSome) {
                        const projectData = (value as any).unwrap();
                        pd = projectData.toJSON ? projectData.toJSON() : projectData;
                    } else if (value && (value as any).isNone) {
                        pd = {};
                    } else {
                        pd = (value as any).toJSON ? (value as any).toJSON() : value;
                    }

                    return {
                        id,
                        client: String(pd.client || ""),
                        freelancer: pd.freelancer ? String(pd.freelancer) : null,
                        budget: String(api.createType('Balance', pd.budget || 0).toHuman()),
                        status: pd.status ? Object.keys(pd.status)[0] : "Unknown",
                        uri: pd.uri || "",
                    };
                });

                const myProjects = allProjects.filter(p => p.client === selectedAccount.address || p.freelancer === selectedAccount.address);
                setProjects(myProjects);

                // 3. Process Disputes where the user is a juror
                const disputes = disputeEntries.map(([key, value]: [any, any]) => {
                  const id = Number(key.args[0].toString());
                  const disputeData = value;

                  if (disputeData.isSome) {
                    const dd = (disputeData as any).unwrap().toJSON() as any;

                    // Check if user is a juror in this dispute
                    const isJuror = dd.jurors && Array.isArray(dd.jurors) &&
                      dd.jurors.some((juror: [string, boolean]) => juror[0] === selectedAccount.address);

                    if (isJuror) {
                      return {
                        id,
                        projectId: id,
                        status: Object.keys(dd.status)[0],
                        round: dd.round,
                        ruling: dd.ruling ? Object.keys(dd.ruling)[0] : null,
                        evidenceUri: dd.evidenceUri ? Buffer.from(dd.evidenceUri.slice(2), 'hex').toString('utf8') : "",
                        startBlock: dd.startBlock,
                        isJuror: true
                      };
                    }
                  }
                  return null;
                }).filter(Boolean);

                setActiveDisputes(disputes as any);

            } catch (e: any) {
                setError(e.message || "Failed to fetch dashboard data.");
                console.error(e);
            } finally {
                setIsLoading(false);
            }
        };

        fetchData();
    }, [api, selectedAccount]);

    const handleJurorRegistration = () => {
      setJurorRegistrationModalOpen(true);
    };

    const handleJurorRegistrationSuccess = () => {
      // Refresh the page to update the juror status
      window.location.reload();
    };

    if (!selectedAccount) {
        return (
            <div className="text-center p-10">
                <h1 className="text-2xl font-bold mb-4">Connect your wallet</h1>
                <p>Please connect your wallet to view your dashboard.</p>
            </div>
        );
    }

    if (isLoading) return <div className="text-center p-10">Loading dashboard...</div>;
    if (error) return <div className="text-center p-10 text-red-500">{error}</div>;

    return (
        <div className="max-w-6xl mx-auto">
            <h1 className="text-3xl font-bold text-gray-800 mb-8">My Dashboard</h1>

            {/* Reputation Section */}
            <div className="mb-12">
                {reputation ? (
                    <ReputationCard reputation={reputation} />
                ) : (
                    <div className="bg-white shadow-md rounded-lg p-8 text-center">
                        <p className="text-gray-500">You have no reputation data yet. Complete a project to get started!</p>
                        <Link href={`/member/${selectedAccount.address}`} className="text-primary hover:underline mt-2 inline-block">
                            View Public Profile
                        </Link>
                    </div>
                )}
            </div>

            {/* Juror Registration Section */}
            <div className="mb-12">
              <div className="bg-white shadow-md rounded-lg p-8">
                <div className="flex justify-between items-center mb-4">
                  <h2 className="text-2xl font-bold text-gray-800">Juror Status</h2>
                  {reputation?.juror_tier === "Unstaked" && (
                    <button
                      onClick={handleJurorRegistration}
                      className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
                    >
                      Register as Juror
                    </button>
                  )}
                </div>

                {reputation ? (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="bg-gray-50 p-4 rounded-md">
                      <h4 className="font-semibold text-gray-500">Tier</h4>
                      <p className="text-xl font-semibold">{reputation.juror_tier}</p>
                    </div>
                    <div className="bg-gray-50 p-4 rounded-md">
                      <h4 className="font-semibold text-gray-500">Jury Votes Cast</h4>
                      <p className="text-xl font-semibold">{reputation.jury_votes_cast} ({reputation.jury_votes_correct} correct)</p>
                    </div>
                  </div>
                ) : (
                  <p className="text-gray-500">Complete projects to build reputation and qualify as a juror.</p>
                )}
              </div>
            </div>

            {/* My Projects Section */}
            <div className="mb-12">
                <h2 className="text-2xl font-bold text-gray-800 mb-4">My Projects</h2>
                {projects.length > 0 ? (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                        {projects.map(project => (
                            <ProjectCard key={project.id} project={project} />
                        ))}
                    </div>
                ) : (
                    <div className="bg-white shadow-md rounded-lg p-8 text-center">
                        <p className="text-gray-500">You are not involved in any projects yet.</p>
                        <Link href="/" className="text-primary hover:underline mt-2 inline-block">
                            Find a project on the marketplace
                        </Link>
                    </div>
                )}
            </div>

            {/* My Jury Duty Section */}
            <div>
                <h2 className="text-2xl font-bold text-gray-800 mb-4">My Jury Duty</h2>
                {activeDisputes.length > 0 ? (
                  <div className="bg-white shadow-md rounded-lg p-8">
                    <h3 className="text-lg font-semibold mb-4">Active Disputes</h3>
                    <div className="space-y-4">
                      {activeDisputes.map((dispute: any) => (
                        <div key={dispute.id} className="border border-gray-200 rounded-md p-4">
                          <div className="flex justify-between">
                            <span className="font-medium">Dispute for Project #{dispute.projectId}</span>
                            <span className="px-2 py-1 bg-blue-100 text-blue-800 text-xs rounded-full">
                              Round {dispute.round} - {dispute.status}
                            </span>
                          </div>
                          <p className="text-sm text-gray-600 mt-2">Status: {dispute.status}</p>
                          <Link
                            href={`/project/${dispute.projectId}`}
                            className="inline-block mt-2 text-primary hover:underline text-sm"
                          >
                            View Project Details
                          </Link>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : (
                  <div className="bg-white shadow-md rounded-lg p-8 text-center">
                    <p className="text-gray-500">You have no active jury duties.</p>
                    {reputation?.juror_tier !== "Unstaked" && (
                      <p className="text-gray-500 mt-2">Wait to be randomly selected for disputes.</p>
                    )}
                  </div>
                )}
            </div>

            <JurorRegistrationModal
              isOpen={jurorRegistrationModalOpen}
              onClose={() => setJurorRegistrationModalOpen(false)}
              onConfirm={handleJurorRegistrationSuccess}
            />
        </div>
    );
}