// frontend/app/utils/ai-arbitrator.ts
import { DisputeEvidence, AIArbitrationResponse } from '../types/arbitration';

/**
 * Makes a request to the AI arbitrator API
 */
export async function requestAIArbitration(evidence: DisputeEvidence): Promise<AIArbitrationResponse> {
  const response = await fetch('/api/ai-arbitrator', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(evidence),
  });

  if (!response.ok) {
    const errorData = await response.json();
    throw new Error(errorData.error || 'Failed to request AI arbitration');
  }

  const data = await response.json();
  return data;
}

/**
 * Formats evidence for AI arbitration
 */
export async function formatEvidenceForArbitration(
  projectId: number,
  clientClaim: string,
  freelancerClaim: string,
  workUri?: string,
  clientRejectionReason?: string,
  otherEvidence?: string
): Promise<DisputeEvidence> {
  // Fetch work submission content if URI is provided
  let workSubmissions = [];
  if (workUri) {
    try {
      let contentUrl = workUri;
      if (workUri.startsWith('ipfs://')) {
        const ipfsHash = workUri.replace('ipfs://', '');
        contentUrl = `https://ipfs.io/ipfs/${ipfsHash}`;
      }

      const response = await fetch(contentUrl);
      if (response.ok) {
        const content = await response.text();
        workSubmissions.push({
          contentHash: workUri.startsWith('ipfs://') ? workUri.replace('ipfs://', '') : workUri, // Store IPFS hash or original URI
          uri: workUri,
          metadata: content,
        });
      }
    } catch (err) {
      console.warn('Failed to fetch work submission:', err);
      // Continue without the work submission
    }
  }

  return {
    projectId,
    clientClaim,
    freelancerClaim,
    workSubmissions: workSubmissions,
    clientRejectionReason,
    otherEvidence,
  };
}

/**
 * Helper to get a simple judgment from AI (just ruling without full response)
 */
export async function getSimpleAIArbitrationRuling(
  projectId: number,
  clientClaim: string,
  freelancerClaim: string
): Promise<'ClientWins' | 'FreelancerWins'> {
  const evidence = await formatEvidenceForArbitration(
    projectId,
    clientClaim,
    freelancerClaim
  );

  const response = await requestAIArbitration(evidence);
  return response.ruling;
}