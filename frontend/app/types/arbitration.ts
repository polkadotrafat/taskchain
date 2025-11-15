// frontend/types/arbitration.ts
export interface DisputeEvidence {
  projectId: number;
  clientClaim: string;
  freelancerClaim: string;
  workSubmissions?: Array<{
    contentHash: string;
    uri: string;
    metadata: string;
  }>;
  clientRejectionReason?: string;
  otherEvidence?: string;
}

export interface AIArbitrationResponse {
  project_id: number;
  ruling: 'ClientWins' | 'FreelancerWins';
  confidence: number;
  reasoning: string;
  timestamp: string;
  evidence_hash?: string; // For verification
}