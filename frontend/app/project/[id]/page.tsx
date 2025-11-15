// frontend/app/project/[id]/page.tsx
"use client";

import { useEffect, useState } from "react";
import { useApi } from "@/app/context/ApiContext";
import { useParams } from "next/navigation";
import { InjectedAccountWithMeta } from "@polkadot/extension-inject/types";
import axios from "axios";
import { JuryVoteModal } from "@/app/components/JuryVoteModal";
import { DisputeDetails } from "@/app/components/DisputeDetails";

import { InitiateDisputeModal } from "@/app/components/InitiateDisputeModal";
import { WorkSubmissionModal } from "@/app/components/WorkSubmissionModal";

// Define a type for the project data, extending it for more details
interface ProjectDetailsType {
  id: number;
  client: string;
  freelancer: string | null;
  budget: string;
  status: string;
  title: string;
  description: string;
  uri: string;
}

// Define dispute type
interface Dispute {
  status: string;
  round: number;
  ruling: string | null;
  jurors: [string, boolean][];
  evidenceUri: string;
  startBlock: number;
}

// --- Main Page Component ---
export default function ProjectPage() {
  const { api, selectedAccount, signer } = useApi();
  const params = useParams();
  const id = Number(params.id);

  const [project, setProject] = useState<ProjectDetailsType | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");

  // --- Data Fetching ---
  useEffect(() => {
    if (!api || isNaN(id)) return;

    const fetchProjectDetails = async () => {
      setIsLoading(true);
      api.query.projects.projects(id, async (projectDataCodec: any) => {
        if (projectDataCodec.isNone) {
          setError("Project not found.");
          setIsLoading(false);
          return;
        }

        const pd = (projectDataCodec as any).unwrap().toJSON() as any;

        let title = `Project #${id}`;
        let description = "Loading description from IPFS...";

        try {
          if (pd.uri) {
            // Decode the hex-encoded URI to get the IPFS hash
            const ipfsHash = Buffer.from(pd.uri.slice(2), 'hex').toString('utf8');
            const response = await axios.get(`https://ipfs.io/ipfs/${ipfsHash}`);
            const projectData = response.data;
            title = projectData.title || title;
            description = projectData.description || "No description provided.";
          }
        } catch (e) {
          console.error("Failed to fetch project data from IPFS:", e);
          description = "Failed to load description from IPFS.";
        }

        setProject({
          id,
          client: String(pd.client),
          freelancer: pd.freelancer ? String(pd.freelancer) : null,
          budget: String(api.createType('Balance', pd.budget).toHuman()),
          status: Object.keys(pd.status)[0], // The status is an enum, get the key
          title,
          description,
          uri: pd.uri,
        });

        setIsLoading(false);
      });
    };

    fetchProjectDetails();
  }, [api, id]);

  if (isLoading) return <div className="text-center p-10">Loading project details...</div>;
  if (error) return <div className="text-center p-10 text-red-500">{error}</div>;
  if (!project) return null;

  return (
    <div className="max-w-4xl mx-auto">
      <ProjectDetails project={project} />
      {selectedAccount && signer && (
        <>
          <ProjectActions project={project} currentUser={selectedAccount} />
          {project.status === 'InDispute' && (
            <DisputeDetails project={project} currentUser={selectedAccount} />
          )}
        </>
      )}
    </div>
  );
}


// --- ProjectDetails Component ---
const ProjectDetails = ({ project }: { project: ProjectDetailsType }) => {
  return (
    <div className="bg-white shadow-md rounded-lg p-8 mb-6">
      <div className="flex justify-between items-start mb-4">
        <h1 className="text-3xl font-bold text-gray-800">{project.title}</h1>
        <span className={`text-sm font-semibold px-3 py-1 rounded-full ${
          project.status === 'InDispute' ? 'bg-red-100 text-red-800' :
          project.status === 'Completed' ? 'bg-green-100 text-green-800' :
          project.status === 'Created' ? 'bg-blue-100 text-blue-800' :
          project.status === 'InProgress' ? 'bg-yellow-100 text-yellow-800' :
          project.status === 'InReview' ? 'bg-purple-100 text-purple-800' :
          project.status === 'Rejected' ? 'bg-orange-100 text-orange-800' :
          'bg-gray-100 text-gray-800'
        }`}>
          {project.status}
        </span>
      </div>
      <p className="text-gray-600 mb-6">{project.description}</p>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
        <div className="bg-gray-50 p-3 rounded-md">
          <h4 className="font-semibold text-gray-500">BUDGET</h4>
          <p className="text-lg font-mono text-gray-900">{project.budget}</p>
        </div>
        <div className="bg-gray-50 p-3 rounded-md">
          <h4 className="font-semibold text-gray-500">CLIENT</h4>
          <p className="text-lg font-mono text-gray-900 truncate">{project.client}</p>
        </div>
        <div className="bg-gray-50 p-3 rounded-md">
          <h4 className="font-semibold text-gray-500">FREELANCER</h4>
          <p className="text-lg font-mono text-gray-900 truncate">
            {project.freelancer || "Not Assigned"}
          </p>
        </div>
      </div>
    </div>
  );
};


// --- ProjectActions Component ---
const ProjectActions = ({ project, currentUser }: { project: ProjectDetailsType, currentUser: InjectedAccountWithMeta }) => {
    const { api, signer } = useApi();
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [isDisputeModalOpen, setIsDisputeModalOpen] = useState(false);
    const [isWorkSubmissionModalOpen, setIsWorkSubmissionModalOpen] = useState(false);
    const [dispute, setDispute] = useState<Dispute | null>(null);
    const [isJuryVoteModalOpen, setIsJuryVoteModalOpen] = useState(false);
    const [error, setError] = useState("");

    // Check if user is a juror for this dispute
    useEffect(() => {
      if (!api || project.status !== 'InDispute') return;

      const fetchDispute = async () => {
        try {
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
        } catch (err) {
          console.error("Error fetching dispute:", err);
        }
      };

      fetchDispute();
    }, [api, project.id, project.status]);

    const handleGenericAction = async (pallet: 'projects' | 'arbitration', extrinsic: string, args: any[]) => {
        if (!api || !signer) return;
        setIsSubmitting(true);

        const tx = api.tx[pallet][extrinsic](...args);

        return new Promise<void>((resolve, reject) => {
            tx.signAndSend(currentUser.address, { signer }, ({ status }) => {
                if (status.isInBlock) {
                    console.log(`Transaction included in block: ${status.asInBlock}`);
                }
                if (status.isFinalized) {
                    console.log(`Transaction finalized: ${status.asFinalized}`);
                    setIsSubmitting(false);
                    // The modal will close itself, and the page subscription will update the UI
                    resolve();
                }
            }).catch((error: any) => {
                console.error("Transaction failed:", error);
                setIsSubmitting(false);
                reject(error);
            });
        });
    };

    // Check if the current user is a juror for this dispute
    const isJuror = dispute?.jurors.some(([juror, _]) => juror === currentUser.address) || false;

    const handleInitiateDispute = async () => {
        if (!api || !signer) return;

        setIsSubmitting(true);

        try {
            // Submit evidence to IPFS first
            const evidenceData = {
                projectId: project.id,
                title: `Evidence for dispute #${project.id}`,
                description: `Evidence for dispute regarding project #${project.id}`
            };

            const evidenceBlob = new Blob([JSON.stringify(evidenceData)], { type: 'application/json' });
            const evidenceFormData = new FormData();
            evidenceFormData.append('file', evidenceBlob, `dispute-${project.id}-evidence.json`);

            const pinataResponse = await axios.post(
                "https://api.pinata.cloud/pinning/pinFileToIPFS",
                evidenceFormData,
                {
                    headers: {
                        'Content-Type': `multipart/form-data; boundary=${(evidenceFormData as any)._boundary}`,
                        'pinata_api_key': process.env.NEXT_PUBLIC_PINATA_API_KEY,
                        'pinata_secret_api_key': process.env.NEXT_PUBLIC_PINATA_API_SECRET
                    }
                }
            );

            const ipfsHash = pinataResponse.data.IpfsHash;
            if (!ipfsHash) {
                throw new Error("Failed to get IPFS hash from Pinata.");
            }

            const extrinsic = api.tx.arbitration.createDispute(project.id, ipfsHash);

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
                            setIsSubmitting(false);
                            setIsDisputeModalOpen(false);
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

    const isClient = project.client === currentUser.address;
    const isFreelancer = project.freelancer === currentUser.address;
    const isPotentialFreelancer = !isClient && !project.freelancer;

    return (
        <>
            <InitiateDisputeModal
                isOpen={isDisputeModalOpen}
                onClose={() => setIsDisputeModalOpen(false)}
                onConfirm={handleInitiateDispute}
                project={project}
                status={project.status}
            />
            {isJuryVoteModalOpen && dispute && (
                <JuryVoteModal
                    project={project}
                    dispute={dispute}
                    isOpen={isJuryVoteModalOpen}
                    onClose={() => setIsJuryVoteModalOpen(false)}
                    currentUser={currentUser}
                />
            )}
            {isWorkSubmissionModalOpen && (
                <WorkSubmissionModal
                    project={project}
                    isOpen={isWorkSubmissionModalOpen}
                    onClose={() => setIsWorkSubmissionModalOpen(false)}
                    onConfirm={() => {
                        // Refresh the project data after submission
                        window.location.reload();
                    }}
                />
            )}
            <div className="bg-white shadow-md rounded-lg p-8">
                <h2 className="text-xl font-bold mb-4">Actions</h2>
                <div className="flex flex-wrap gap-4">
                    {project.status === 'Created' && isPotentialFreelancer && (
                        <button
                            onClick={() => handleGenericAction('projects', 'applyForProject', [project.id])}
                            disabled={isSubmitting}
                            className="px-4 py-2 bg-primary text-white rounded-md hover:bg-primary-hover disabled:bg-gray-400"
                        >
                            {isSubmitting ? 'Applying...' : 'Apply for Project'}
                        </button>
                    )}
                    {project.status === 'Created' && isClient && project.freelancer && (
                        <button
                            onClick={() => handleGenericAction('projects', 'startWork', [project.id, project.freelancer || ""])}
                            disabled={isSubmitting || !project.freelancer}
                            className="px-4 py-2 bg-primary text-white rounded-md hover:bg-primary-hover disabled:bg-gray-400"
                        >
                            {isSubmitting ? 'Starting...' : 'Start Work'}
                        </button>
                    )}
                    {project.status === 'InProgress' && isFreelancer && (
                        <button
                            onClick={() => setIsWorkSubmissionModalOpen(true)}
                            disabled={isSubmitting}
                            className="px-4 py-2 bg-primary text-white rounded-md hover:bg-primary-hover disabled:bg-gray-400"
                        >
                            {isSubmitting ? 'Submitting...' : 'Submit Work'}
                        </button>
                    )}
                    {project.status === 'InReview' && isClient && (
                        <>
                            <button
                                onClick={() => handleGenericAction('projects', 'acceptWork', [project.id, 4])}
                                disabled={isSubmitting}
                                className="px-4 py-2 bg-green-500 text-white rounded-md hover:bg-green-600 disabled:bg-gray-400"
                            >
                                {isSubmitting ? 'Accepting...' : 'Accept Work (4/5)'}
                            </button>
                            <button
                                onClick={() => handleGenericAction('projects', 'rejectWork', [project.id, "ipfs://reason"])}
                                disabled={isSubmitting}
                                className="px-4 py-2 bg-red-500 text-white rounded-md hover:bg-red-600 disabled:bg-gray-400"
                            >
                                {isSubmitting ? 'Rejecting...' : 'Reject Work'}
                            </button>
                        </>
                    )}
                    {project.status === 'Rejected' && isFreelancer && (
                        <button
                            onClick={() => setIsDisputeModalOpen(true)}
                            disabled={isSubmitting}
                            className="px-4 py-2 bg-yellow-500 text-white rounded-md hover:bg-yellow-600 disabled:bg-gray-400"
                        >
                            {isSubmitting ? 'Preparing...' : 'Initiate Dispute'}
                        </button>
                    )}
                    {project.status === 'InDispute' && isJuror && dispute?.status === 'Voting' && (
                        <button
                            onClick={() => setIsJuryVoteModalOpen(true)}
                            disabled={isSubmitting}
                            className="px-4 py-2 bg-blue-500 text-white rounded-md hover:bg-blue-600 disabled:bg-gray-400"
                        >
                            Cast Jury Vote
                        </button>
                    )}
                    {project.status === 'InDispute' && isJuror && dispute?.status === 'Appealable' && (
                        <button
                            onClick={() => handleGenericAction('arbitration', 'enforceFinalRuling', [project.id])}
                            disabled={isSubmitting}
                            className="px-4 py-2 bg-purple-500 text-white rounded-md hover:bg-purple-600 disabled:bg-gray-400"
                        >
                            {isSubmitting ? 'Processing...' : 'Enforce Final Ruling'}
                        </button>
                    )}
                    {project.status === 'InDispute' && isJuror && dispute?.status === 'Voting' && (
                        <button
                            onClick={() => handleGenericAction('arbitration', 'finalizeRound', [project.id])}
                            disabled={isSubmitting}
                            className="px-4 py-2 bg-indigo-500 text-white rounded-md hover:bg-indigo-600 disabled:bg-gray-400"
                        >
                            {isSubmitting ? 'Finalizing...' : 'Finalize Round'}
                        </button>
                    )}
                </div>
                {error && <p className="text-red-500 mt-4">{error}</p>}
                {project.status === 'InDispute' && (
                    <p className="text-gray-500 mt-4">This project is currently in dispute. Actions may be limited depending on your role.</p>
                )}
            </div>
        </>
    );
};
