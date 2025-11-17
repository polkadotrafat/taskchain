// frontend/app/utils/ai-arbitrator.ts
import { DisputeEvidence, AIArbitrationResponse } from '../types/arbitration';

/**
 * Makes a request to the AI arbitrator API
 */
export async function requestAIArbitration(evidence: DisputeEvidence): Promise<AIArbitrationResponse> {
  console.log(`Sending AI arbitration request to API for project ${evidence.projectId}...`);

  // In server-side contexts, use the full URL including the host
  const apiUrl = typeof window !== 'undefined'
    ? '/api/ai-arbitrator'
    : `${process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000'}/api/ai-arbitrator`;

  const response = await fetch(apiUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(evidence),
  });

  if (!response.ok) {
    const errorData = await response.json();
    console.error(`AI arbitration API error for project ${evidence.projectId}:`, errorData.error);
    throw new Error(errorData.error || 'Failed to request AI arbitration');
  }

  const data = await response.json();
  console.log(`AI arbitration API response received for project ${evidence.projectId}`);
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
  otherEvidence?: string,
  projectRequirementsUri?: string
): Promise<DisputeEvidence> {
  console.log(`Formatting evidence for AI arbitration for project ${projectId}...`);

  // Fetch work submission content if URI is provided
  let workSubmissions = [];
  if (workUri) {
    try {
      console.log(`Fetching work submission from URI: ${workUri}`);
      // First, decode hex string if it starts with '0x'
      let decodedUri = workUri;
      if (workUri.startsWith('0x')) {
        try {
          // Convert hex to string
          const hex = workUri.substring(2); // Remove '0x' prefix
          const bytes = new Uint8Array(hex.match(/.{1,2}/g)?.map(byte => parseInt(byte, 16)) || []);
          decodedUri = new TextDecoder().decode(bytes);
          console.log(`Decoded hex URI: ${workUri} -> ${decodedUri}`);
        } catch (decodeError) {
          console.warn('Failed to decode hex URI, using original:', workUri, decodeError);
          decodedUri = workUri; // Use original if decode fails
        }
      }

      let contentUrl = decodedUri;
      if (decodedUri.startsWith('ipfs://')) {
        const ipfsHash = decodedUri.replace('ipfs://', '');
        contentUrl = `https://ipfs.io/ipfs/${ipfsHash}`;
      } else if (!decodedUri.startsWith('http://') && !decodedUri.startsWith('https://')) {
        // If it's not a web URL or IPFS, try to treat it as an IPFS hash directly
        contentUrl = `https://ipfs.io/ipfs/${decodedUri}`;
      }

      console.log(`Fetching content from: ${contentUrl}`);
      const response = await fetch(contentUrl);
      if (response.ok) {
        const content = await response.text();
        workSubmissions.push({
          contentHash: decodedUri.startsWith('ipfs://') ? decodedUri.replace('ipfs://', '') : decodedUri, // Store IPFS hash or original URI
          uri: decodedUri,
          metadata: content,
        });
        console.log(`Successfully fetched work submission for project ${projectId}, content length: ${content.length}`);
      } else {
        console.warn(`Failed to fetch work submission from ${contentUrl}, status: ${response.status}`);
      }
    } catch (err) {
      console.warn('Failed to fetch work submission:', err);
      // Continue without the work submission
    }
  } else {
    console.log(`No work URI provided for project ${projectId}, skipping work submission fetch`);
  }

  console.log(`Evidence formatted successfully for project ${projectId}. Work submissions count: ${workSubmissions.length}`);
  return {
    projectId,
    clientClaim,
    freelancerClaim,
    projectRequirementsUri,
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
  freelancerClaim: string,
  projectRequirementsUri?: string
): Promise<'ClientWins' | 'FreelancerWins'> {
  const evidence = await formatEvidenceForArbitration(
    projectId,
    clientClaim,
    freelancerClaim,
    undefined, // workUri
    undefined, // clientRejectionReason
    undefined, // otherEvidence
    projectRequirementsUri
  );

  const response = await requestAIArbitration(evidence);
  return response.ruling;
}