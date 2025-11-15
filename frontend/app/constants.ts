// frontend/app/constants.ts
export const WS_PROVIDER = process.env.NEXT_PUBLIC_WS_PROVIDER || 'ws://127.0.0.1:9933';

// --- Common Types (Aligned with on-chain structs) ---

export interface Project {
    id: number;
    client: string;
    freelancer: string | null;
    status: string;
    uri: string;
    budget?: string; // Optional budget for display
}

export interface Dispute {
    status: string;
    round: number;
    ruling: string | null;
    jurors: [string, boolean][];
    evidenceUri: string;
    startBlock: number;
}