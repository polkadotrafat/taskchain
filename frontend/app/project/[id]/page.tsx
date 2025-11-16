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
import { ProjectApplicants } from "@/app/components/ProjectApplicants";
import { Button } from "@/app/components/ui/Button";

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

// Define submitted work type
interface SubmittedWork {
  id: number;
  projectId: number;
  submittedBy: string;
  uri: string;
  contentHash: string;
  metadata: string;
  submittedAt: string;
  title?: string;
  description?: string;
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

// Helper function to convert hex to string
function hexToString(hex: string): string {
  if (!hex.startsWith('0x')) {
    hex = '0x' + hex;
  }
  try {
    const bytes = new Uint8Array(
      hex.slice(2).match(/.{1,2}/g)?.map((byte) => parseInt(byte, 16)) || []
    );
    return new TextDecoder().decode(bytes);
  } catch (error) {
    console.error('Error decoding hex string:', error);
    return hex; // Return original hex if decoding fails
  }
}


// --- Main Page Component ---
export default function ProjectPage() {
  const { api, selectedAccount, signer } = useApi();
  const params = useParams();
  const id = Number(params.id);

  const [project, setProject] = useState<ProjectDetailsType | null>(null);
  const [submittedWork, setSubmittedWork] = useState<SubmittedWork | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");
  const [hasApplied, setHasApplied] = useState(false);

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
          status: pd.status,
          title,
          description,
          uri: pd.uri,
        });

        // Fetch submitted work if project is in review
        if (pd.status === 'InReview' || pd.status === 'InDispute' || pd.status === 'Completed' || pd.status === 'Rejected') {
          // Check if work submission exists in the project data based on the actual blockchain structure
          if (pd.workSubmission && pd.workSubmission.uri) {
            const work: SubmittedWork = {
              id: 0,
              projectId: id,
              submittedBy: pd.freelancer || "unknown", // Assuming freelancer submitted the work
              uri: pd.workSubmission.uri,
              contentHash: pd.workSubmission.contentHash || "",
              metadata: pd.workSubmission.metadata || "",
              submittedAt: new Date().toISOString(), // Should be derived from submissionBlock if available
            };

            // Try to fetch work details from IPFS if URI exists
            if (pd.workSubmission.uri) {
              try {
                // The URI in the example is already a CID, not hex encoded
                // Check if it's hex encoded or direct CID
                let ipfsHash;
                if (pd.workSubmission.uri.startsWith('0x')) {
                  ipfsHash = hexToString(pd.workSubmission.uri.slice(2));
                } else {
                  // If it's already a CID (not hex encoded), use it directly
                  ipfsHash = pd.workSubmission.uri;
                }

                const workDetails = await axios.get(`https://ipfs.io/ipfs/${ipfsHash}`);
                work.title = workDetails.data.title || `Work for Project #${id}`;
                work.description = workDetails.data.description || workDetails.data.content || work.metadata;
              } catch (ipfsError) {
                console.error("Failed to fetch work from IPFS:", ipfsError);
                work.title = `Work for Project #${id}`;
                work.description = "Failed to load work details from IPFS.";
              }
            }

            setSubmittedWork(work);
          }
        }

        // Fetch applicants and check if current user has applied
        if (selectedAccount) {
          const applicantsCodec = await api.query.projects.projectApplicants(id);
          const applicantsList = (applicantsCodec as any).map((applicant: any) => applicant.toString());
          setHasApplied(applicantsList.includes(selectedAccount.address));
        }

        setIsLoading(false);
      });
    };

    fetchProjectDetails();
  }, [api, id, selectedAccount]);

  if (isLoading) return <div className="text-center p-10">Loading project details...</div>;
  if (error) return <div className="text-center p-10 text-red-500">{error}</div>;
  if (!project) return null;

  return (
    <div className="max-w-4xl mx-auto">
      <ProjectDetails project={project} />
      {selectedAccount && signer && (
        <>
          <ProjectActions project={project} currentUser={selectedAccount} hasApplied={hasApplied} submittedWork={submittedWork} />
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
const ProjectActions = ({ project, currentUser, hasApplied, submittedWork }: { project: ProjectDetailsType, currentUser: InjectedAccountWithMeta, hasApplied: boolean, submittedWork: SubmittedWork | null }) => {
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
                    window.location.reload();
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
        setError(""); // Clear any previous errors

        try {
            const extrinsic = api.tx.arbitration.createDispute(project.id);

            // Better transaction handling to ensure state is always updated
            extrinsic.signAndSend(
                currentUser.address,
                { signer },
                ({ status, events, dispatchError }) => {
                    if (status.isInBlock) {
                        console.log(`Transaction included in block: ${status.asInBlock}`);
                    }
                    if (status.isFinalized) {
                        console.log(`Transaction finalized: ${status.asFinalized}`);

                        // Check for dispatch errors
                        if (dispatchError) {
                            console.error("Transaction dispatch error:", dispatchError);
                            let errorMsg = dispatchError.toString();
                            if (dispatchError.isModule) {
                                try {
                                    const decoded = api?.registry.findMetaError(dispatchError.asModule);
                                    errorMsg = `${decoded?.section}.${decoded?.name}: ${decoded?.docs}`;
                                } catch (e) {
                                    console.error("Error decoding dispatch error:", e);
                                }
                            }
                            setError(errorMsg);
                            setIsSubmitting(false);
                            return;
                        }

                        // Check for success events
                        let success = false;
                        let disputeCreated = false;

                        events.forEach(({ event: { method, section } }) => {
                            if (section === 'system' && method === 'ExtrinsicSuccess') {
                                console.log('Dispute initiation successful');
                                success = true;
                            }
                            if (section === 'arbitration' && method === 'DisputeCreated') {
                                console.log('Dispute created event emitted');
                                disputeCreated = true;
                            }
                        });

                        setIsSubmitting(false);
                        if (success && disputeCreated) {
                            setIsDisputeModalOpen(false);
                            window.location.reload(); // Refresh to show updated status
                        } else {
                            setError("Transaction completed but dispute may not have been created successfully");
                        }
                    }
                }
            ).catch((error: any) => {
                console.error("Transaction error:", error);
                setError(error.message || "Transaction failed");
                setIsSubmitting(false);
            });
        } catch (err: any) {
            setError(err.message || "An unknown error occurred.");
            setIsSubmitting(false);
            console.error("Error initiating dispute:", err);
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
                        <Button
                            onClick={() => handleGenericAction('projects', 'applyForProject', [project.id])}
                            disabled={isSubmitting || hasApplied}
                            isLoading={isSubmitting}
                        >
                            {hasApplied ? 'Applied' : 'Apply for Project'}
                        </Button>
                    )}
                    {project.status === 'Created' && isClient && !project.freelancer && (
                        <ProjectApplicants
                            projectId={project.id}
                            client={project.client}
                            onApplicantAssigned={() => window.location.reload()}
                        />
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
                            {/* Display submitted work */}
                            <div className="mb-6 p-4 bg-gray-50 rounded-md">
                                <h3 className="text-lg font-semibold mb-2">Submitted Work</h3>
                                {submittedWork ? (
                                    <div>
                                        <h4 className="font-medium text-gray-800">{submittedWork.title || `Work for Project #${project.id}`}</h4>
                                        <p className="text-gray-600 mt-2">{submittedWork.description}</p>
                                        <div className="mt-3 text-sm text-gray-500">
                                            <p>Submitted by: {submittedWork.submittedBy}</p>
                                            {submittedWork.uri && (
                                                <p>
                                                    IPFS: <a
                                                        href={`https://ipfs.io/ipfs/${hexToString(submittedWork.uri.slice(2))}`}
                                                        target="_blank"
                                                        rel="noopener noreferrer"
                                                        className="text-blue-600 hover:underline"
                                                    >
                                                        {hexToString(submittedWork.uri.slice(2))}
                                                    </a>
                                                </p>
                                            )}
                                        </div>
                                    </div>
                                ) : (
                                    <p className="text-gray-500">Work details are loading or not available.</p>
                                )}
                            </div>

                            <div className="flex space-x-4">
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
                            </div>
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
