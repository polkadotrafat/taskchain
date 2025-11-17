// frontend/app/project/[id]/workspace/page.tsx
"use client";

import { useEffect, useState } from "react";
import { useApi } from "@/app/context/ApiContext";
import { useParams } from "next/navigation";
import { InjectedAccountWithMeta } from "@polkadot/extension-inject/types";
import { AppealDisputeModal } from "@/app/components/AppealDisputeModal";
import { InitiateDisputeModal } from "@/app/components/InitiateDisputeModal";
import { Button } from "@/app/components/ui/Button";
import { Badge } from "@/app/components/ui/Badge";
import { Project, Dispute } from "@/app/constants";

// --- Main Page Component ---
export default function WorkspacePage() {
    const { api, selectedAccount } = useApi();
    const params = useParams();
    const projectId = Number(params.id);

    const [project, setProject] = useState<Project | null>(null);
    const [dispute, setDispute] = useState<Dispute | null>(null);
    const [isLoading, setIsLoading] = useState(true);

    useEffect(() => {
        if (!api || isNaN(projectId)) return;

        const fetchData = async () => {
            setIsLoading(true);

            api.query.projects.projects(projectId, (codec: any) => {
                if (codec.isSome) {
                    const p = (codec as any).unwrap().toJSON() as any;
                    setProject({
                        id: projectId,
                        client: p.client,
                        freelancer: p.freelancer,
                        status: Object.keys(p.status)[0],
                        uri: new TextDecoder().decode(p.uri),
                    });
                } else {
                    setProject(null);
                }
            });

            api.query.arbitration.disputes(projectId, (codec: any) => {
                if (codec.isSome) {
                    const d = (codec as any).unwrap().toJSON() as any;
                    // Safely handle ruling which is Option<Enum>
                    const rulingKey = d.ruling ? Object.keys(d.ruling)[0] : null;
                    setDispute({
                        ...d,
                        status: Object.keys(d.status)[0],
                        ruling: rulingKey,
                    });
                } else {
                    setDispute(null);
                }
            });

            setIsLoading(false);
        };

        fetchData();
    }, [api, projectId]);

    if (isLoading) return <div className="text-center p-10 text-gray-500">Loading Workspace...</div>;
    if (!project) return <div className="text-center p-10 text-red-500">Project not found.</div>;

    // --- Main Rendering Logic ---
    const isDisputeState = ['Rejected', 'InDispute', 'AiProcessing', 'Voting', 'Appealable', 'Finalized'].includes(project.status);

    if (isDisputeState) {
        return <DisputeView project={project} dispute={dispute} currentUser={selectedAccount} />;
    }
    
    // Fallback for other views (InProgress, InReview, etc.) - Placeholder for now
    return (
        <div className="max-w-4xl mx-auto p-6">
            <h1 className="text-3xl font-bold mb-4">Workspace: {project.uri}</h1>
            <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200">
                <p className="text-lg">Current Status: <span className="font-semibold text-primary">{project.status}</span></p>
                <p className="mt-2 text-gray-600">This project is progressing normally. No dispute actions are required.</p>
            </div>
        </div>
    );
}


// --- Dispute View & Sub-Components ---

const DisputeView = ({ project, dispute, currentUser }: { project: Project, dispute: Dispute | null, currentUser: InjectedAccountWithMeta | null }) => {
    const [isInitiateModalOpen, setIsInitiateModalOpen] = useState(false);
    const [isAppealModalOpen, setIsAppealModalOpen] = useState(false);
    const [txStatus, setTxStatus] = useState('');
    const { api, signer } = useApi();

    // Handle initiating a dispute (Freelancer only)
    const handleInitiateDispute = async () => {
        if (!api || !signer || !currentUser) return;
        setTxStatus('Broadcasting...');
        
        // Assuming your extrinsic is named `createDispute` or `initiateAiDispute`
        // Adjust `initiateAiDispute` if your pallet uses a different name
        const tx = api.tx.arbitration.createDispute(project.id, "Initial evidence"); 
        
        await tx.signAndSend(currentUser.address, { signer }, ({ status }) => {
            if (status.isInBlock) {
                setTxStatus('In Block...');
            } else if (status.isFinalized) {
                setTxStatus('Finalized!');
                setTimeout(() => {
                    setTxStatus('');
                    setIsInitiateModalOpen(false);
                }, 2000);
            }
        }).catch(err => {
            console.error(err);
            setTxStatus('Error: ' + err.message);
        });
    };

    // Handle appealing a ruling (Loser only)
    const handleAppeal = async () => {
        if (!api || !signer || !currentUser) return;
        setTxStatus('Broadcasting...');

        const tx = api.tx.arbitration.appealRuling(project.id, "Appeal evidence");
        
        await tx.signAndSend(currentUser.address, { signer }, ({ status }) => {
            if (status.isInBlock) {
                setTxStatus('In Block...');
            } else if (status.isFinalized) {
                setTxStatus('Finalized!');
                setTimeout(() => {
                    setTxStatus('');
                    setIsAppealModalOpen(false);
                }, 2000);
            }
        }).catch(err => {
            console.error(err);
            setTxStatus('Error: ' + err.message);
        });
    };


    // 1. Case: Work Rejected, but Dispute not yet created on-chain
    if (project.status === 'Rejected' && !dispute) {
        const isFreelancer = currentUser?.address === project.freelancer;
        
        if (isFreelancer) {
            return (
                <div className="max-w-2xl mx-auto mt-10 bg-white shadow-lg rounded-lg p-8 text-center border-l-4 border-red-500">
                    <h2 className="text-2xl font-bold text-red-600 mb-2">Your Work Was Rejected</h2>
                    <p className="text-gray-600 mb-6">The client has rejected your submission. You have the right to initiate an AI-powered arbitration to resolve this dispute.</p>
                    <Button onClick={() => setIsInitiateModalOpen(true)} className="bg-primary hover:bg-primary-hover text-white px-6 py-2">
                        Initiate Dispute
                    </Button>
                    
                    <InitiateDisputeModal 
                        project={project} 
                        isOpen={isInitiateModalOpen} 
                        onClose={() => setIsInitiateModalOpen(false)}
                        onConfirm={handleInitiateDispute}
                        status={txStatus}
                    />
                </div>
            );
        }
        return (
            <div className="max-w-2xl mx-auto mt-10 bg-white shadow p-8 text-center rounded-lg">
                <h2 className="text-xl font-semibold text-gray-800">Work Rejected</h2>
                <p className="text-gray-500 mt-2">Awaiting freelancer response. They may choose to initiate a dispute.</p>
            </div>
        );
    }

    // Loading state if dispute data is lagging behind project status
    if (!dispute) return <div className="text-center p-10 text-gray-500">Loading dispute details...</div>;

    // 2. Case: Active Dispute
    return (
        <div className="max-w-6xl mx-auto px-4 py-8">
            <DisputeHeader project={project} dispute={dispute} />
            
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 mt-8">
                {/* Left Column: Timeline & Info */}
                <div className="lg:col-span-2 space-y-6">
                    <DisputeTimeline dispute={dispute} />
                </div>

                {/* Right Column: Action Box */}
                <div className="lg:col-span-1 space-y-6">
                    <ContextualActionBox 
                        project={project} 
                        dispute={dispute} 
                        currentUser={currentUser} 
                        onAppealClick={() => setIsAppealModalOpen(true)}
                    />
                </div>
            </div>

            <AppealDisputeModal 
                project={project} 
                dispute={dispute}
                isOpen={isAppealModalOpen}
                onClose={() => setIsAppealModalOpen(false)}
                onConfirm={handleAppeal}
                status={txStatus}
            />
        </div>
    );
};

const DisputeHeader = ({ project, dispute }: { project: Project, dispute: Dispute }) => (
    <div className="border-b border-gray-200 pb-6">
        <div className="flex justify-between items-start">
            <div>
                <h1 className="text-3xl font-bold text-gray-900 mb-2">Dispute Resolution</h1>
                <p className="text-gray-500 font-medium">Project: <span className="text-gray-800">{project.uri}</span></p>
            </div>
            <Badge variant={dispute.status === 'Finalized' ? 'green' : 'yellow'} className="text-lg px-4 py-1">
                {dispute.status}
            </Badge>
        </div>
        
        {dispute.ruling && (
            <div className="mt-6 bg-gray-50 p-4 rounded-lg border border-gray-200 inline-block">
                <span className="text-sm font-bold text-gray-500 uppercase tracking-wide">Latest Ruling</span>
                <p className="text-xl font-bold text-primary mt-1">{dispute.ruling.replace(/([A-Z])/g, ' $1').trim()}</p>
            </div>
        )}
    </div>
);

const DisputeTimeline = ({ dispute }: { dispute: Dispute }) => {
    return (
        <div className="bg-white shadow-sm border border-gray-200 rounded-lg p-6">
            <h2 className="text-xl font-bold text-gray-800 mb-4 flex items-center">
                <span className="bg-primary w-2 h-6 rounded-full mr-3"></span>
                Dispute Status
            </h2>
            
            <div className="space-y-4">
                <div className="flex justify-between items-center border-b border-gray-100 pb-2">
                    <span className="text-gray-600">Current Round</span>
                    <span className="font-bold text-lg">{dispute.round === 1 ? "1 (AI Arbitration)" : `${dispute.round} (Human Jury)`}</span>
                </div>
                <div className="flex justify-between items-center border-b border-gray-100 pb-2">
                    <span className="text-gray-600">Start Block</span>
                    <span className="font-mono text-gray-800">{dispute.startBlock}</span>
                </div>
                <div>
                    <span className="text-gray-600 block mb-2">Evidence</span>
                    {dispute.evidenceUri ? (
                        <a 
                            href="#" // In real app: ipfs gateway + uri
                            className="text-primary hover:text-primary-hover hover:underline font-medium flex items-center"
                        >
                            📄 View Submitted Evidence
                        </a>
                    ) : (
                        <span className="text-gray-400 italic">No evidence provided</span>
                    )}
                </div>
            </div>
        </div>
    );
};

const ContextualActionBox = ({ project, dispute, currentUser, onAppealClick }: { project: Project, dispute: Dispute, currentUser: InjectedAccountWithMeta | null, onAppealClick: () => void }) => {
    const { api, signer } = useApi();
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [currentBlock, setCurrentBlock] = useState<number | null>(null);
    const [txMessage, setTxMessage] = useState('');

    // Fetch current block number for timing logic
    useEffect(() => {
        if (!api) return;
        let unsub: () => void;
        const sub = async () => {
            unsub = await api.rpc.chain.subscribeNewHeads((header) => {
                setCurrentBlock(header.number.toNumber());
            });
        };
        sub();
        return () => unsub && unsub();
    }, [api]);

    const handleTx = async (extrinsic: any, successMsg: string) => {
        if (!api || !signer || !currentUser) return;
        setIsSubmitting(true);
        setTxMessage('Broadcasting...');
        await extrinsic.signAndSend(currentUser.address, { signer }, ({ status }: any) => {
            if (status.isInBlock) setTxMessage('In Block...');
            else if (status.isFinalized) {
                setTxMessage(successMsg);
                setTimeout(() => { setIsSubmitting(false); setTxMessage(''); }, 2000);
            }
        }).catch((err: any) => {
            console.error(err);
            setTxMessage('Failed');
            setIsSubmitting(false);
        });
    };

    // --- 1. Action for Jurors (Voting) ---
    // Check if current user is a juror who hasn't voted yet
    // Note: dispute.jurors is expected to be [[AccountId, hasVoted], ...]
    const isJuror = dispute.jurors && dispute.jurors.some(([jurorId, hasVoted]: [any, any]) => 
        jurorId.toString() === currentUser?.address && !hasVoted
    );

    if (dispute.status === 'Voting' && isJuror) {
        return (
            <div className="bg-white shadow-lg border-l-4 border-blue-500 rounded-lg p-6">
                <h2 className="text-xl font-bold text-gray-800 mb-2">Jury Duty Required</h2>
                <p className="text-gray-600 mb-6">You have been selected as a juror for this round. Please review the evidence and cast your vote.</p>
                <div className="flex space-x-4">
                    <Button
                        onClick={() => handleTx(api!.tx.arbitration.castVote(project.id, 'ForClient'), 'Voted for Client')}
                        disabled={isSubmitting}
                        className="flex-1 bg-primary hover:bg-primary-hover text-white"
                    >
                        Vote Client
                    </Button>
                    <Button
                        onClick={() => handleTx(api!.tx.arbitration.castVote(project.id, 'ForFreelancer'), 'Voted for Freelancer')}
                        disabled={isSubmitting}
                        className="flex-1 bg-primary hover:bg-primary-hover text-white"
                    >
                        Vote Freelancer
                    </Button>
                </div>
                {txMessage && <p className="mt-2 text-center text-sm font-medium text-primary">{txMessage}</p>}
            </div>
        );
    }

    // --- 2. Action for Losing Party (Appeal) ---
    if (dispute.status === 'Appealable' && dispute.round < 3) {
        const loser = (dispute.ruling === 'ClientWins') ? project.freelancer : project.client;
        if (currentUser?.address === loser) {
            return (
                <div className="bg-white shadow-lg border-l-4 border-yellow-500 rounded-lg p-6">
                    <h2 className="text-xl font-bold text-gray-800 mb-2">Ruling Against You</h2>
                    <p className="text-gray-600 mb-6">The latest ruling was not in your favor. You have the right to appeal to a higher-tier jury.</p>
                    <Button onClick={onAppealClick} className="w-full bg-primary hover:bg-primary-hover text-white">
                        Appeal Ruling
                    </Button>
                </div>
            );
        }
    }
    
    // --- 3. Public Actions (Time-based) ---
    if (currentBlock) {
        // Note: These constants should ideally be fetched from api.consts
        const VOTING_PERIOD = 200; 
        const APPEAL_PERIOD = 100;

        if (dispute.status === 'Voting' && currentBlock > dispute.startBlock + VOTING_PERIOD) {
            return (
                <PublicActionCard 
                    title="Finalize Round" 
                    description="The voting period has ended. Finalize the round to calculate the result."
                    buttonText="Finalize Now"
                    onClick={() => handleTx(api!.tx.arbitration.finalizeRound(project.id), 'Round Finalized')}
                    isSubmitting={isSubmitting}
                    txMessage={txMessage}
                />
            );
        }

        if (dispute.status === 'Appealable' && currentBlock > dispute.startBlock + APPEAL_PERIOD) {
            return (
                <PublicActionCard 
                    title="Enforce Final Ruling" 
                    description="The appeal period has ended without challenge. This ruling is now final."
                    buttonText="Enforce Ruling"
                    onClick={() => handleTx(api!.tx.arbitration.enforceFinalRuling(project.id), 'Dispute Resolved')}
                    isSubmitting={isSubmitting}
                    txMessage={txMessage}
                />
            );
        }
    }

    // Default Status View
    return (
        <div className="bg-white shadow-sm border border-gray-200 rounded-lg p-6">
            <h2 className="text-xl font-bold text-gray-800 mb-3">Current Status</h2>
            <p className="text-gray-600">The dispute is currently in the <span className="font-semibold text-gray-900">{dispute.status}</span> state.</p>
            <p className="text-gray-500 text-sm mt-2 italic">Waiting for other parties or time periods to complete.</p>
        </div>
    );
};

const PublicActionCard = ({ title, description, buttonText, onClick, isSubmitting, txMessage }: any) => (
    <div className="bg-white shadow-lg border-l-4 border-primary rounded-lg p-6">
        <h2 className="text-xl font-bold text-gray-800 mb-2">{title}</h2>
        <p className="text-gray-600 mb-6">{description}</p>
        <Button onClick={onClick} disabled={isSubmitting} className="w-full bg-primary hover:bg-primary-hover text-white">
            {buttonText}
        </Button>
        {txMessage && <p className="mt-2 text-center text-sm font-medium text-primary">{txMessage}</p>}
    </div>
);