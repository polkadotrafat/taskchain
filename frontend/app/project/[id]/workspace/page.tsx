// frontend/app/project/[id]/workspace/page.tsx
"use client";

import { useEffect, useState } from "react";
import { useApi } from "@/app/context/ApiContext";
import { useParams } from "next/navigation";
import { InjectedAccountWithMeta } from "@polkadot/extension-inject/types";
import { AppealDisputeModal } from "@/app/components/AppealDisputeModal";

// --- Types ---
interface Project {
    id: number;
    title: string;
    client: string;
    freelancer: string | null;
}

interface DisputeRound {
    round_index: number;
    jury: string[];
    votes: any; // In a real app, define this more strictly
    ruling: string | null;
}

interface Dispute {
    project_id: number;
    status: string;
    rounds: DisputeRound[];
    final_ruling: string | null;
}

// --- Main Page Component ---
export default function DisputeWorkspacePage() {
    const { api, selectedAccount } = useApi();
    const params = useParams();
    const projectId = Number(params.id);

    const [project, setProject] = useState<Project | null>(null);
    const [dispute, setDispute] = useState<Dispute | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState("");

    useEffect(() => {
        if (!api || isNaN(projectId)) return;

        let unsub: () => void;

        const fetchData = async () => {
            setIsLoading(true);
            try {
                // Fetch initial project data once
                const projectCodec = await api.query.projects.projects(projectId);
                if ((projectCodec as any).isNone) {
                    throw new Error("Project data not found.");
                }
                const p = (projectCodec as any).unwrap().toJSON() as any;
                let title = `Project #${projectId}`;
                try {
                    const uriData = JSON.parse(p.uri);
                    title = uriData.title || title;
                } catch {}
                setProject({ id: projectId, title, client: p.client, freelancer: p.freelancer });

                // Subscribe to dispute data
                unsub = await api.query.arbitration.disputes(projectId, (disputeCodec: any) => {
                    if (disputeCodec.isNone) {
                        setError("This project is not in dispute.");
                        setIsLoading(false);
                        return;
                    }
                    const d = disputeCodec.unwrap().toJSON() as any;
                    setDispute({
                        ...d,
                        status: Object.keys(d.status)[0],
                    });
                    setIsLoading(false);
                }) as any;

            } catch (e: any) {
                setError(e.message || "Failed to fetch data.");
                console.error(e);
                setIsLoading(false);
            }
        };

        fetchData();
        return () => unsub && unsub();
    }, [api, projectId]);

    if (isLoading) return <div className="text-center p-10">Loading dispute workspace...</div>;
    if (error) return <div className="text-center p-10 text-red-500">{error}</div>;
    if (!dispute || !project) return null;

    return (
        <div className="max-w-6xl mx-auto">
            <h1 className="text-3xl font-bold text-gray-800 mb-2">Dispute Workspace</h1>
            <p className="text-gray-500 mb-8">Project: {project.title}</p>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                <div className="lg:col-span-2">
                    <RoundHistory rounds={dispute.rounds} />
                </div>
                <div className="lg:col-span-1 space-y-6">
                    <DisputeStatus status={dispute.status} finalRuling={dispute.final_ruling} />
                    {selectedAccount && (
                        <>
                            <JuryVotingPanel dispute={dispute} currentUser={selectedAccount} />
                            <AppealPanel dispute={dispute} project={project} currentUser={selectedAccount} />
                        </>
                    )}
                </div>
            </div>
        </div>
    );
}

// --- Child Components ---

const DisputeStatus = ({ status, finalRuling }: { status: string, finalRuling: string | null }) => (
    <div className="bg-white shadow-md rounded-lg p-6">
        <h2 className="text-xl font-bold text-gray-800 mb-3">Current Status</h2>
        <p className={`text-lg font-semibold px-3 py-1 rounded-full inline-block ${status === 'Finalized' ? 'bg-green-100 text-green-800' : 'bg-yellow-100 text-yellow-800'}`}>
            {status}
        </p>
        {finalRuling && (
            <div className="mt-4">
                <h3 className="font-semibold text-gray-500">FINAL RULING</h3>
                <p className="text-lg font-bold text-gray-900">{finalRuling}</p>
            </div>
        )}
    </div>
);

const RoundHistory = ({ rounds }: { rounds: DisputeRound[] }) => (
    <div className="bg-white shadow-md rounded-lg p-6">
        <h2 className="text-xl font-bold text-gray-800 mb-4">Dispute Rounds</h2>
        <div className="space-y-4">
            {rounds.map(round => (
                <div key={round.round_index} className="border-b border-gray-200 pb-3">
                    <h3 className="font-bold text-lg">Round {round.round_index + 1}</h3>
                    <p className="text-sm text-gray-500">Jurors: {round.jury.length}</p>
                    {round.ruling ? (
                        <p className="font-semibold">Ruling: <span className="text-primary">{round.ruling}</span></p>
                    ) : (
                        <p className="text-gray-500 italic">Round in progress...</p>
                    )}
                </div>
            ))}
        </div>
    </div>
);

const JuryVotingPanel = ({ dispute, currentUser }: { dispute: Dispute, currentUser: InjectedAccountWithMeta }) => {
    const { api, signer } = useApi();
    const [isSubmitting, setIsSubmitting] = useState(false);

    const currentRound = dispute.rounds[dispute.rounds.length - 1];
    const isJuror = currentRound?.jury.includes(currentUser.address);
    
    if (dispute.status !== 'JuryVoting' || !isJuror) return null;

    const handleVote = async (vote: 'ForClient' | 'ForFreelancer') => {
        if (!api || !signer) return;
        setIsSubmitting(true);
        const tx = api.tx.arbitration.castVote(dispute.project_id, vote);
        await tx.signAndSend(currentUser.address, { signer }, ({ status }) => {
            if (status.isFinalized) {
                console.log("Vote cast successfully.");
                // UI will update via subscription
            }
        }).catch(err => {
            console.error(err);
            setIsSubmitting(false);
        });
    };

    return (
        <div className="bg-white shadow-md rounded-lg p-6">
            <h2 className="text-xl font-bold text-gray-800 mb-3">Jury Duty</h2>
            <p className="text-gray-600 mb-4">You are a juror for the current round. Please review the case and cast your vote.</p>
            <div className="flex space-x-4">
                <button onClick={() => handleVote('ForClient')} disabled={isSubmitting} className="action-button flex-1">Vote for Client</button>
                <button onClick={() => handleVote('ForFreelancer')} disabled={isSubmitting} className="action-button flex-1 bg-blue-500 hover:bg-blue-600">Vote for Freelancer</button>
            </div>
        </div>
    );
};

const AppealPanel = ({ dispute, project, currentUser }: { dispute: Dispute, project: Project, currentUser: InjectedAccountWithMeta }) => {
    const { api, signer } = useApi();
    const [isModalOpen, setIsModalOpen] = useState(false);

    const lastRound = dispute.rounds[dispute.rounds.length - 1];
    if (!lastRound?.ruling || dispute.status === 'Finalized') return null;

    const rulingIsForClient = lastRound.ruling === 'ForClient';
    const userIsLoser = (rulingIsForClient && currentUser.address === project.freelancer) || (!rulingIsForClient && currentUser.address === project.client);

    if (!userIsLoser) return null;

    const handleAppeal = async () => {
        if (!api || !signer) throw new Error("API not ready");
        const tx = api.tx.arbitration.appealRuling(dispute.project_id);
        await tx.signAndSend(currentUser.address, { signer }, ({ status }) => {
            if (status.isFinalized) {
                setIsModalOpen(false);
            }
        });
    };

    return (
        <>
            <AppealDisputeModal 
                isOpen={isModalOpen}
                onClose={() => setIsModalOpen(false)}
                onConfirm={handleAppeal}
            />
            <div className="bg-white shadow-md rounded-lg p-6">
                <h2 className="text-xl font-bold text-gray-800 mb-3">Appeal Ruling</h2>
                <p className="text-gray-600 mb-4">You were on the losing side of the last round. You can appeal to a higher-tier jury.</p>
                <button onClick={() => setIsModalOpen(true)} className="action-button bg-yellow-500 hover:bg-yellow-600 w-full">
                    Appeal Ruling
                </button>
            </div>
        </>
    );
};
