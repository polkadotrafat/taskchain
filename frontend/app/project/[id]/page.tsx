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


// --- DisputeDetails Component ---
const DisputeDetails = ({ project, currentUser, dispute }: { project: ProjectDetailsType, currentUser: InjectedAccountWithMeta, dispute: Dispute | null }) => {
  const { api, signer } = useApi();
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");
  const [activeDisputes, setActiveDisputes] = useState<any[]>([]);

  // If dispute is already provided, use it
  if (dispute) {
    return (
      <div className="bg-white shadow-md rounded-lg p-6 mt-4">
        <h2 className="text-xl font-bold text-gray-800 mb-4">Dispute Details</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
          <div className="bg-gray-50 p-3 rounded-md">
            <h4 className="font-semibold text-gray-500">Status</h4>
            <p className="text-lg font-semibold text-gray-900">{dispute.status}</p>
          </div>
          <div className="bg-gray-50 p-3 rounded-md">
            <h4 className="font-semibold text-gray-500">Round</h4>
            <p className="text-lg font-semibold text-gray-900">Round {dispute.round}</p>
          </div>
          <div className="bg-gray-50 p-3 rounded-md">
            <h4 className="font-semibold text-gray-500">Ruling</h4>
            <p className="text-lg font-semibold text-gray-900">{dispute.ruling || "Pending"}</p>
          </div>
          <div className="bg-gray-50 p-3 rounded-md">
            <h4 className="font-semibold text-gray-500">Evidence URI</h4>
            <p className="text-sm font-mono text-gray-900 break-all">{dispute.evidenceUri}</p>
          </div>
        </div>
      </div>
    );
  }

  // Fallback to original fetch logic if no dispute was provided
  useEffect(() => {
    if (!api || !currentUser) return;

    const fetchDispute = async () => {
      setIsLoading(true);
      try {
        const disputeEntries = await api.query.arbitration.disputes.entries();

        const disputes = disputeEntries.map(([key, value]: [any, any]) => {
          const id = Number(key.args[0].toString());
          const disputeData = value;

          if (disputeData.isSome) {
            const dd = (disputeData as any).unwrap().toJSON() as any;

            // Check if user is a juror in this dispute
            const isJuror = dd.jurors && Array.isArray(dd.jurors) &&
              dd.jurors.some((juror: [string, boolean]) => juror[0] === currentUser.address);

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
      } catch (err: any) {
        console.error("Error fetching dispute:", err);
        setError("Failed to fetch dispute data");
      } finally {
        setIsLoading(false);
      }
    };

    fetchDispute();
  }, [api, currentUser]);

  if (isLoading) return <div className="text-center p-4">Loading dispute details...</div>;
  if (error) return <div className="text-center p-4 text-red-500">{error}</div>;

  return (
    <div className="bg-white shadow-md rounded-lg p-6 mt-4">
      <h2 className="text-xl font-bold text-gray-800 mb-4">My Jury Duties</h2>
      {activeDisputes.length > 0 ? (
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
      ) : (
        <p className="text-gray-500">You have no active jury duties.</p>
      )}
    </div>
  );
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
  const [dispute, setDispute] = useState<Dispute | null>(null);

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

        // Fetch dispute data if project status is in dispute
        if (pd.status === 'InDispute') {
          const disputeData = await api.query.arbitration.disputes(id);
          if ((disputeData as any).isSome) {
            const disputeJson = (disputeData as any).unwrap().toJSON() as any;
            const processedDispute: Dispute = {
              status: typeof disputeJson.status === 'object' ? Object.keys(disputeJson.status)[0] : disputeJson.status,
              round: disputeJson.round,
              ruling: disputeJson.ruling ? (typeof disputeJson.ruling === 'object' ? Object.keys(disputeJson.ruling)[0] : disputeJson.ruling) : null,
              jurors: disputeJson.jurors || [],
              evidenceUri: disputeJson.evidenceUri ? Buffer.from(disputeJson.evidenceUri.slice(2), 'hex').toString('utf8') : "",
              startBlock: disputeJson.startBlock,
            };
            setDispute(processedDispute);
          }
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
      <ProjectDetails project={project} dispute={dispute} />
      {selectedAccount && signer && (
        <>
          <ProjectActions project={project} currentUser={selectedAccount} hasApplied={hasApplied} submittedWork={submittedWork} dispute={dispute} />
          {project.status === 'InDispute' && (
            <DisputeDetails project={project} currentUser={selectedAccount} dispute={dispute} />
          )}
        </>
      )}
    </div>
  );
}


// --- ProjectDetails Component ---
const ProjectDetails = ({ project, dispute }: { project: ProjectDetailsType, dispute: Dispute | null }) => {
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

      {/* AI Ruling Display - Show when dispute has an AI ruling */}
      {project.status === 'InDispute' && dispute && dispute.ruling && dispute.round === 1 && (
        <div className="mt-4 p-4 bg-blue-50 border border-blue-200 rounded-md">
          <div className="flex items-center">
            <div className="mr-3">
              <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 text-blue-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
              </svg>
            </div>
            <div>
              <h4 className="font-semibold text-blue-800">AI Arbitration Ruling</h4>
              <div className="flex items-center mt-1">
                <span className="text-lg font-bold">
                  {dispute.ruling === 'ClientWins' ? 'Client Wins' : 'Freelancer Wins'}
                </span>
                <span className="ml-2 px-2 py-1 bg-blue-100 text-blue-800 text-xs font-medium rounded-full">
                  Round 1 (AI)
                </span>
              </div>
            </div>
          </div>
          <p className="mt-2 text-sm text-gray-600">
            This ruling was made by an AI arbitrator after analyzing the project requirements and submitted work.
          </p>
        </div>
      )}
    </div>
  );
};


// --- ProjectActions Component ---
const ProjectActions = ({ project, currentUser, hasApplied, submittedWork, dispute }: { project: ProjectDetailsType, currentUser: InjectedAccountWithMeta, hasApplied: boolean, submittedWork: SubmittedWork | null, dispute: Dispute | null }) => {
    const { api, signer } = useApi();
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [isDisputeModalOpen, setIsDisputeModalOpen] = useState(false);
    const [isWorkSubmissionModalOpen, setIsWorkSubmissionModalOpen] = useState(false);
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
              status: typeof disputeJson.status === 'object' ? Object.keys(disputeJson.status)[0] : disputeJson.status,
              round: disputeJson.round,
              ruling: disputeJson.ruling && typeof disputeJson.ruling === 'object' ? Object.keys(disputeJson.ruling)[0] : disputeJson.ruling,
              jurors: disputeJson.jurors || [],
              evidenceUri: disputeJson.evidenceUri ? Buffer.from(disputeJson.evidenceUri.slice(2), 'hex').toString('utf8') : "",
              startBlock: disputeJson.startBlock,
            };
            console.log('Fetched dispute data:', processedDispute);
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
                async ({ status, events, dispatchError }) => {
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
                        console.log(`Dispute transaction finalized for project ${project.id}. Success: ${success}, DisputeCreated: ${disputeCreated}`);

                        if (success && disputeCreated) {
                            setIsDisputeModalOpen(false);
                            console.log('Dispute creation successful. Dispute is now in AiProcessing status.');
                            console.log('AI arbitration can be started by either party by clicking the "Run AI Arbitration" button.');

                            // Refresh the page to show updated status
                            console.log('Refreshing page to show updated dispute status...');
                            window.location.reload();
                        } else {
                            console.error('Dispute creation failed - transaction not successful');
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

    // Function to trigger AI arbitration
    const handleAIArbitration = async () => {
        if (!api || !signer) return;

        console.log('Starting AI arbitration for project:', project.id);

        setIsSubmitting(true);
        setError(""); // Clear any previous errors

        try {
            console.log('Verifying dispute status from blockchain...');
            // Fetch the current dispute state directly from the blockchain
            // to ensure we have the most recent status
            const disputeData = await api.query.arbitration.disputes(project.id);

            if (disputeData.isNone) {
                setError("Dispute not found for this project");
                setIsSubmitting(false);
                return;
            }

            const dispute = disputeData.unwrap().toJSON() as any;
            // Handle the status properly by checking if it's an object or direct value
            const rawStatus = dispute.status;
            let currentStatus = rawStatus;

            // If status is an object (like {AiProcessing: null}), extract the key
            if (typeof rawStatus === 'object' && rawStatus !== null) {
                currentStatus = Object.keys(rawStatus)[0];
            } else if (typeof rawStatus === 'number') {
                // If status is a number, convert back to string representation
                const statusMap: Record<number, string> = {
                    0: 'AiProcessing',
                    1: 'Appealable',
                    2: 'Voting',
                    3: 'Finalized',
                    4: 'Resolved'
                };
                currentStatus = statusMap[rawStatus] || rawStatus.toString();
            }

            const currentRound = dispute.round;

            console.log(`Current dispute status: ${currentStatus}, round: ${currentRound}`);

            // Only allow AI arbitration for round 1 in AiProcessing status
            if (currentRound !== 1 || currentStatus !== 'AiProcessing') {
                setError(`AI arbitration is only available for round 1 in AiProcessing status. Current status: ${currentStatus}, round: ${currentRound}`);
                setIsSubmitting(false);
                return;
            }

            console.log('Sending AI arbitration trigger request...');
            try {
                // Create an AbortController for timeout
                const controller = new AbortController();
                const timeoutId = setTimeout(() => controller.abort(), 30000); // 30 second timeout

                const response = await fetch('/api/ai-oracle-trigger', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify({ projectId: project.id }),
                    signal: controller.signal
                });

                clearTimeout(timeoutId);

                console.log('Received response from AI arbitration API:', response.status);

                if (!response.ok) {
                    const errorData = await response.json().catch(() => ({}));
                    console.error('AI arbitration failed:', errorData.error || 'Unknown error');
                    setError(`AI arbitration failed: ${errorData.error || 'Server error'}`);
                    setIsSubmitting(false);
                    return;
                }

                const result = await response.json();
                console.log('AI arbitration completed:', result);
            } catch (fetchError: any) {
                if (fetchError.name === 'AbortError') {
                    console.error('AI arbitration request timed out');
                    setError('AI arbitration request timed out. Please try again.');
                } else {
                    console.error('Network error in AI arbitration:', fetchError);
                    setError(`Network error: ${fetchError.message}`);
                }
                setIsSubmitting(false);
                return;
            }

            console.log('AI arbitration completed successfully, checking status again...');
            // Don't immediately reload, let the user see the result
            // The useEffect will update the UI when the dispute status changes
            // Refresh the page after a short delay to show updated status
            setTimeout(() => {
                console.log('Refreshing page after AI arbitration completed...');
                window.location.reload();
            }, 2000);

            // Set submitting to false after a short delay to show the success state briefly
            setTimeout(() => {
                setIsSubmitting(false);
            }, 1000);

        } catch (err: any) {
            console.error("Error in AI arbitration:", err);
            setError(err.message || "An unknown error occurred during AI arbitration");
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
                                    className="px-4 py-2 bg-primary text-white rounded-md hover:bg-primary-hover disabled:bg-gray-400"
                                >
                                    {isSubmitting ? 'Accepting...' : 'Accept Work (4/5)'}
                                </button>
                                <button
                                    onClick={() => handleGenericAction('projects', 'rejectWork', [project.id, "ipfs://reason"])}
                                    disabled={isSubmitting}
                                    className="px-4 py-2 bg-primary text-white rounded-md hover:bg-primary-hover disabled:bg-gray-400"
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
                            className="px-4 py-2 bg-primary text-white rounded-md hover:bg-primary-hover disabled:bg-gray-400"
                        >
                            {isSubmitting ? 'Preparing...' : 'Initiate Dispute'}
                        </button>
                    )}
                    {project.status === 'InDispute' && isJuror && dispute?.status === 'Voting' && (
                        <button
                            onClick={() => setIsJuryVoteModalOpen(true)}
                            disabled={isSubmitting}
                            className="px-4 py-2 bg-primary text-white rounded-md hover:bg-primary-hover disabled:bg-gray-400"
                        >
                            Cast Jury Vote
                        </button>
                    )}
                    {project.status === 'InDispute' && isJuror && dispute?.status === 'Appealable' && (
                        <button
                            onClick={() => handleGenericAction('arbitration', 'enforceFinalRuling', [project.id])}
                            disabled={isSubmitting}
                            className="px-4 py-2 bg-primary text-white rounded-md hover:bg-primary-hover disabled:bg-gray-400"
                        >
                            {isSubmitting ? 'Processing...' : 'Enforce Final Ruling'}
                        </button>
                    )}
                    {/* Appeal button - visible to the losing party when dispute is Appealable */}
                    {project.status === 'InDispute' && (() => {
                      // Process the status the same way as in other places
                      const rawStatus = dispute?.status;
                      let currentStatus = rawStatus;

                      if (typeof rawStatus === 'object' && rawStatus !== null) {
                          currentStatus = Object.keys(rawStatus)[0];
                      } else if (typeof rawStatus === 'number') {
                          const statusMap: Record<number, string> = {
                              0: 'AiProcessing',
                              1: 'Appealable',
                              2: 'Voting',
                              3: 'Finalized',
                              4: 'Resolved'
                          };
                          currentStatus = statusMap[rawStatus] || rawStatus.toString();
                      }

                      // Only show the appeal button if status is Appealable, it's round 1, and the current user is the losing party
                      if (currentStatus === 'Appealable' && dispute?.round === 1) {
                        // Determine the losing party based on the ruling
                        const isClient = project.client === currentUser.address;
                        const isFreelancer = project.freelancer === currentUser.address;
                        const losingParty = dispute.ruling === 'ClientWins' ? project.freelancer : project.client;
                        const isLosingParty = currentUser.address === losingParty;

                        if (isLosingParty) {
                          return (
                            <button
                              onClick={() => handleGenericAction('arbitration', 'appealRuling', [project.id])}
                              disabled={isSubmitting}
                              className="px-4 py-2 bg-primary text-white rounded-md hover:bg-primary-hover disabled:bg-gray-400"
                            >
                              {isSubmitting ? 'Appealing...' : 'Appeal Ruling'}
                            </button>
                          );
                        }
                      }
                      return false; // Return false to render nothing if conditions aren't met
                    })()}
                    {project.status === 'InDispute' && dispute?.round === 1 && (() => {
                      // Process the status the same way as in the function
                      const rawStatus = dispute.status;
                      let currentStatus = rawStatus;

                      if (typeof rawStatus === 'object' && rawStatus !== null) {
                          currentStatus = Object.keys(rawStatus)[0];
                      } else if (typeof rawStatus === 'number') {
                          const statusMap: Record<number, string> = {
                              0: 'AiProcessing',
                              1: 'Appealable',
                              2: 'Voting',
                              3: 'Finalized',
                              4: 'Resolved'
                          };
                          currentStatus = statusMap[rawStatus] || rawStatus.toString();
                      }

                      return currentStatus === 'AiProcessing';
                    })() && (
                        <button
                            onClick={handleAIArbitration}
                            disabled={isSubmitting}
                            className="px-4 py-2 bg-primary text-white rounded-md hover:bg-primary-hover disabled:bg-gray-400"
                        >
                            {isSubmitting ? 'Running AI Arbitration...' : 'Run AI Arbitration'}
                        </button>
                    )}
                    {project.status === 'InDispute' && isJuror && dispute?.status === 'Voting' && (
                        <button
                            onClick={() => handleGenericAction('arbitration', 'finalizeRound', [project.id])}
                            disabled={isSubmitting}
                            className="px-4 py-2 bg-primary text-white rounded-md hover:bg-primary-hover disabled:bg-gray-400"
                        >
                            {isSubmitting ? 'Finalizing...' : 'Finalize Round'}
                        </button>
                    )}
                </div>
                {error && <p className="text-red-500 mt-4">{error}</p>}
                {project.status === 'InDispute' && dispute && (
                    <div className="mt-4">
                        <p className="text-gray-500">This project is currently in dispute. Actions may be limited depending on your role.</p>
                        {(() => {
                          // Process the status the same way as in the function
                          const rawStatus = dispute.status;
                          let currentStatus = rawStatus;

                          if (typeof rawStatus === 'object' && rawStatus !== null) {
                              currentStatus = Object.keys(rawStatus)[0];
                          } else if (typeof rawStatus === 'number') {
                              const statusMap: Record<number, string> = {
                                  0: 'AiProcessing',
                                  1: 'Appealable',
                                  2: 'Voting',
                                  3: 'Finalized',
                                  4: 'Resolved'
                              };
                              currentStatus = statusMap[rawStatus] || rawStatus.toString();
                          }

                          return currentStatus === 'AiProcessing' && dispute.round === 1;
                        })() && (
                            <div className="mt-2 p-3 bg-yellow-50 border border-yellow-200 rounded-md">
                                <p className="text-yellow-800 font-medium">AI Arbitration Ready</p>
                                <p className="text-sm text-yellow-700">The dispute is ready for AI arbitration. Either party can initiate the AI review process.</p>
                            </div>
                        )}
                        {(() => {
                          // Process the status the same way as in the function
                          const rawStatus = dispute.status;
                          let currentStatus = rawStatus;

                          if (typeof rawStatus === 'object' && rawStatus !== null) {
                              currentStatus = Object.keys(rawStatus)[0];
                          } else if (typeof rawStatus === 'number') {
                              const statusMap: Record<number, string> = {
                                  0: 'AiProcessing',
                                  1: 'Appealable',
                                  2: 'Voting',
                                  3: 'Finalized',
                                  4: 'Resolved'
                              };
                              currentStatus = statusMap[rawStatus] || rawStatus.toString();
                          }

                          return currentStatus === 'AiProcessing' && dispute.round !== 1;
                        })() && (
                            <div className="mt-2 p-3 bg-yellow-50 border border-yellow-200 rounded-md">
                                <p className="text-yellow-800 font-medium">Round {dispute.round} Processing</p>
                                <p className="text-sm text-yellow-700">This round is currently being processed.</p>
                            </div>
                        )}
                        {(() => {
                          // Process the status the same way as in the function
                          const rawStatus = dispute.status;
                          let currentStatus = rawStatus;

                          if (typeof rawStatus === 'object' && rawStatus !== null) {
                              currentStatus = Object.keys(rawStatus)[0];
                          } else if (typeof rawStatus === 'number') {
                              const statusMap: Record<number, string> = {
                                  0: 'AiProcessing',
                                  1: 'Appealable',
                                  2: 'Voting',
                                  3: 'Finalized',
                                  4: 'Resolved'
                              };
                              currentStatus = statusMap[rawStatus] || rawStatus.toString();
                          }

                          return currentStatus === 'Appealable' && dispute.round === 1;
                        })() && (
                            <div className="mt-2 p-3 bg-blue-50 border border-blue-200 rounded-md">
                                <p className="text-blue-800 font-medium">AI Ruling: {dispute.ruling === 'ClientWins' ? 'Client Wins' : 'Freelancer Wins'}</p>
                                <p className="text-sm text-blue-700">The AI arbitrator has reviewed this dispute and made a ruling. This decision can be appealed.</p>
                            </div>
                        )}
                    </div>
                )}
            </div>
        </>
    );
};
