// frontend/app/dashboard/page.tsx
"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useApi } from "@/app/context/ApiContext";
import { ReputationCard } from "@/app/components/ReputationCard";
import { ProjectCard } from "@/app/components/ProjectCard";

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
    const { api, selectedAccount } = useApi();
    
    const [reputation, setReputation] = useState<ReputationData | null>(null);
    const [projects, setProjects] = useState<Project[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState("");

    useEffect(() => {
        if (!api || !selectedAccount) {
            setIsLoading(false);
            return;
        };

        const fetchData = async () => {
            setIsLoading(true);
            try {
                const [repDataCodec, projectEntries] = await Promise.all([
                    api.query.reputation.reputationStats(selectedAccount.address),
                    api.query.projects.projects.entries()
                ]);

                // 1. Process Reputation Data
                if (!(repDataCodec as any).isNone) {
                    const rep = (repDataCodec as any).unwrap().toJSON() as any;
                    setReputation({
                        ...rep,
                        total_earned: api.createType('Balance', rep.total_earned).toHuman(),
                        total_spent: api.createType('Balance', rep.total_spent).toHuman(),
                        juror_tier: Object.keys(rep.juror_tier)[0],
                    });
                }

                // 2. Process and Filter Projects
                const allProjects = projectEntries.map(([key, value]: [any, any]) => {
                    const id = Number(key.args[0].toString());
                    const pd = value.unwrap().toJSON() as any;
                    return {
                        id,
                        client: String(pd.client),
                        freelancer: pd.freelancer ? String(pd.freelancer) : null,
                        budget: String(api.createType('Balance', pd.budget).toHuman()),
                        status: Object.keys(pd.status)[0],
                        uri: pd.uri,
                    };
                });

                const myProjects = allProjects.filter(p => p.client === selectedAccount.address || p.freelancer === selectedAccount.address);
                setProjects(myProjects);

            } catch (e: any) {
                setError(e.message || "Failed to fetch dashboard data.");
                console.error(e);
            } finally {
                setIsLoading(false);
            }
        };

        fetchData();
    }, [api, selectedAccount]);

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
                <div className="bg-white shadow-md rounded-lg p-8 text-center">
                    <p className="text-gray-500">You have no active jury duties.</p>
                    {/* This section will be implemented in a future phase */}
                </div>
            </div>
        </div>
    );
}
