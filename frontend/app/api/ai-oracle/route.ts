// frontend/app/api/ai-oracle/route.ts
import { NextRequest } from 'next/server';
import { ApiPromise, WsProvider } from '@polkadot/api';
import { Keyring } from '@polkadot/keyring';
import { formatEvidenceForArbitration } from '../../utils/ai-arbitrator';
import { requestAIArbitration } from '../../utils/ai-arbitrator';

// Use the sudo account to submit AI rulings
// The sudo key should be configured in environment variables
const SUDO_MNEMONIC = process.env.SUDO_MNEMONIC;
const WS_PROVIDER_URL = process.env.WS_PROVIDER_URL || 'ws://127.0.0.1:9944';

interface ProcessDisputeRequest {
  projectId: number;
  clientClaim?: string;
  freelancerClaim?: string;
  workUri?: string;
  clientRejectionReason?: string;
  otherEvidence?: string;
}

export async function POST(request: NextRequest) {
  try {
    if (!SUDO_MNEMONIC) {
      return Response.json(
        { error: 'Sudo account not configured. Set SUDO_MNEMONIC environment variable.' },
        { status: 500 }
      );
    }

    const body: ProcessDisputeRequest = await request.json();

    // Validate required fields
    if (!body.projectId) {
      return Response.json(
        { error: 'projectId is required' },
        { status: 400 }
      );
    }

    // Create API instance to connect to the blockchain
    const provider = new WsProvider(WS_PROVIDER_URL);
    const api = await ApiPromise.create({ provider });

    try {
      // First, fetch the dispute from the blockchain to get current status
      const disputeData = await api.query.arbitration.disputes(body.projectId);

      if (disputeData.isNone) {
        return Response.json(
          { error: 'Dispute not found' },
          { status: 404 }
        );
      }

      const dispute = disputeData.unwrap();
      const disputeStatus = Object.keys(dispute.status.toHuman() as any)[0]; // Gets the enum variant like "AiProcessing"

      // Only process if dispute is in AiProcessing status
      if (disputeStatus !== 'AiProcessing') {
        return Response.json(
          {
            error: 'Dispute is not in AiProcessing status',
            status: disputeStatus
          },
          { status: 400 }
        );
      }

      // Get project details to extract evidence URIs
      const projectData = await api.query.projects.projects(body.projectId);
      if (projectData.isNone) {
        return Response.json(
          { error: 'Project not found' },
          { status: 404 }
        );
      }

      const project = projectData.unwrap();
      const workUri = project.workSubmission
        ? (project.workSubmission as any).uri.toHuman() as string
        : '';
      const requirementsUri = project.uri.toHuman() as string;

      // Format evidence for AI arbitration
      const evidence = await formatEvidenceForArbitration(
        body.projectId,
        body.clientClaim || `Project requirements: ${requirementsUri}`,
        body.freelancerClaim || `Work submitted: ${workUri}`,
        workUri,
        body.clientRejectionReason,
        body.otherEvidence
      );

      // Get AI ruling
      const aiRuling = await requestAIArbitration(evidence);

      // Create keyring and add the sudo account
      const keyring = new Keyring({ type: 'sr25519' });
      const sudoAccount = keyring.addFromUri(SUDO_MNEMONIC);

      // Create the extrinsic to submit the AI ruling
      const extrinsic = api.tx.arbitration.submit_ruling(body.projectId, aiRuling.ruling);

      // Submit the transaction using the sudo account
      // Note: In Substrate, to use sudo, we might need to wrap the call in sudo::sudo
      // But since AiOracleOrigin is EnsureRoot, we can directly call submit_ruling
      const unsub = await new Promise((resolve, reject) => {
        extrinsic.signAndSend(sudoAccount, ({ status, events, dispatchError }) => {
          if (status.isInBlock) {
            console.log(`AI ruling transaction included in block: ${status.asInBlock}`);
          }

          if (status.isFinalized) {
            console.log(`AI ruling transaction finalized: ${status.asFinalized}`);

            // Check for dispatch errors
            if (dispatchError) {
              console.error("AI ruling submission dispatch error:", dispatchError);
              reject(dispatchError.toString());
              return;
            }

            // Check for success events
            let success = false;
            let rulingSubmitted = false;

            events.forEach(({ event: { method, section } }) => {
              if (section === 'system' && method === 'ExtrinsicSuccess') {
                console.log('AI ruling submission successful');
                success = true;
              }
              if (section === 'arbitration' && method === 'AiRulingSubmitted') {
                console.log('AI RulingSubmitted event emitted');
                rulingSubmitted = true;
              }
            });

            if (success && rulingSubmitted) {
              console.log(`AI ruling successfully submitted for project ${body.projectId}`);
              resolve(status.asFinalized);
            } else {
              reject(new Error("AI ruling submission completed but may not have been processed successfully"));
            }
          }
        }).catch((error: any) => {
          console.error("Error signing and sending AI ruling transaction:", error);
          reject(error);
        });
      });

      return Response.json({
        success: true,
        projectId: body.projectId,
        ruling: aiRuling.ruling,
        reasoning: aiRuling.reasoning,
        confidence: aiRuling.confidence,
        message: `AI ruling "${aiRuling.ruling}" successfully submitted to blockchain for project ${body.projectId}`
      });
    } finally {
      // Disconnect from the blockchain
      await api.disconnect();
    }
  } catch (error: any) {
    console.error('AI Oracle Error:', error);
    return Response.json(
      {
        error: 'Failed to process AI arbitration',
        details: error.message
      },
      { status: 500 }
    );
  }
}

export async function GET(request: NextRequest) {
  // Return status of the AI Oracle service
  return Response.json({
    status: 'AI Oracle service running',
    hasConfiguration: !!SUDO_MNEMONIC,
    endpoint: '/api/ai-oracle'
  });
}