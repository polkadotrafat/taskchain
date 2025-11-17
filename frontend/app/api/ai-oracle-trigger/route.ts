// frontend/app/api/ai-oracle-trigger/route.ts
import { NextRequest } from 'next/server';
import { ApiPromise, WsProvider } from '@polkadot/api';
import { Keyring } from '@polkadot/keyring';
import { formatEvidenceForArbitration, requestAIArbitration } from '../../utils/ai-arbitrator';

// Use the sudo account to submit AI rulings
const SUDO_MNEMONIC = process.env.SUDO_MNEMONIC;
const WS_PROVIDER_URL = process.env.WS_PROVIDER_URL || 'ws://127.0.0.1:9933';

interface TriggerAIArbitrationRequest {
  projectId: number;
}

export async function POST(request: NextRequest) {
  try {
    console.log('AI Oracle Trigger API called');

    if (!SUDO_MNEMONIC) {
      console.error('Sudo account not configured. Set SUDO_MNEMONIC environment variable.');
      return Response.json(
        { error: 'Sudo account not configured. Set SUDO_MNEMONIC environment variable.' },
        { status: 500 }
      );
    }

    console.log('Sudo account configured, parsing request body...');
    const body: TriggerAIArbitrationRequest = await request.json();

    console.log('Request body parsed:', body);

    // Validate required fields
    if (typeof body.projectId !== 'number') {
      console.error('projectId is required and must be a number');
      return Response.json(
        { error: 'projectId is required and must be a number' },
        { status: 400 }
      );
    }

    console.log(`Processing AI arbitration for project ID: ${body.projectId}`);

    // Create API instance to connect to the blockchain
    console.log(`Connecting to blockchain at: ${WS_PROVIDER_URL}`);
    const provider = new WsProvider(WS_PROVIDER_URL);
    const api = await ApiPromise.create({ provider });

    console.log('Connected to blockchain, now fetching dispute data...');

    try {
      // First, fetch the dispute from the blockchain to get current status
      console.log(`Fetching dispute data for project ID: ${body.projectId}`);
      const disputeData = await api.query.arbitration.disputes(body.projectId) as any;

      if (disputeData.isNone) {
        console.error(`Dispute not found for project ID: ${body.projectId}`);
        return Response.json(
          { error: 'Dispute not found' },
          { status: 404 }
        );
      }

      const dispute = disputeData.unwrap();
      console.log('Raw dispute object:', dispute);
      console.log('Dispute status raw:', dispute.status);
      console.log('Dispute status toHuman():', dispute.status.toHuman());

      const disputeStatusRaw = dispute.status.toHuman();
      console.log('Dispute status raw type:', typeof disputeStatusRaw);

      let disputeStatus = '';
      if (typeof disputeStatusRaw === 'object' && disputeStatusRaw !== null) {
        disputeStatus = Object.keys(disputeStatusRaw)[0];
      } else if (typeof disputeStatusRaw === 'number') {
        // Map numeric status to string - common Substrate enum mapping
        const statusMap: Record<number, string> = {
          0: 'AiProcessing',
          1: 'Appealable',
          2: 'Voting',
          3: 'Finalized',
          4: 'Resolved'
        };
        disputeStatus = statusMap[disputeStatusRaw] || disputeStatusRaw.toString();
      } else {
        disputeStatus = disputeStatusRaw.toString();
      }

      console.log(`Dispute status for project ${body.projectId}: ${disputeStatus}`);

      // Only process if dispute is in AiProcessing status
      if (disputeStatus !== 'AiProcessing') {
        console.error(`Dispute ${body.projectId} is not in AiProcessing status. Current status: ${disputeStatus}`);
        return Response.json(
          {
            error: `Dispute is not in AiProcessing status. Current status: ${disputeStatus}`,
            status: disputeStatus,
            rawStatus: disputeStatusRaw
          },
          { status: 400 }
        );
      }

      console.log(`Dispute ${body.projectId} is in proper status for AI processing, fetching project details...`);

      // Get project details to extract evidence URIs
      console.log(`Fetching project details for project ID: ${body.projectId}`);
      const projectData = await api.query.projects.projects(body.projectId) as any;
      if (projectData.isNone) {
        console.error(`Project not found for project ID: ${body.projectId}`);
        return Response.json(
          { error: 'Project not found' },
          { status: 404 }
        );
      }

      const project = projectData.unwrap();
      console.log(`Retrieved project data, extracting evidence URIs...`);
      const workSub = project.workSubmission?.toJSON();
      let workUri = workSub ? workSub.uri : '';
      let requirementsUri = project.uri.toHuman() as string;

      // Decode hex-encoded URIs if they are stored as hex
      if (requirementsUri && typeof requirementsUri === 'string' && requirementsUri.startsWith('0x')) {
        try {
          const hex = requirementsUri.substring(2); // Remove '0x' prefix
          const bytes = new Uint8Array(hex.match(/.{1,2}/g)?.map(byte => parseInt(byte, 16)) || []);
          requirementsUri = new TextDecoder().decode(bytes);
          console.log(`Decoded project requirements URI: ${requirementsUri}`);
        } catch (decodeError) {
          console.warn('Failed to decode project requirements URI, using original:', requirementsUri, decodeError);
          // Use original if decode fails
        }
      }

      if (workUri && typeof workUri === 'string' && workUri.startsWith('0x')) {
        try {
          const hex = workUri.substring(2); // Remove '0x' prefix
          const bytes = new Uint8Array(hex.match(/.{1,2}/g)?.map(byte => parseInt(byte, 16)) || []);
          workUri = new TextDecoder().decode(bytes);
          console.log(`Decoded work submission URI: ${workUri}`);
        } catch (decodeError) {
          console.warn('Failed to decode work submission URI, using original:', workUri, decodeError);
          // Use original if decode fails
        }
      }

      // Get client and freelancer addresses
      const client = project.client.toHuman() as string;
      const freelancer = project.freelancer?.toHuman() as string || 'Unknown';

      console.log(`Project evidence URIs - Requirements: ${requirementsUri}, Work: ${workUri}`);
      console.log(`Client: ${client}, Freelancer: ${freelancer}`);

      // Create evidence object for AI arbitration
      console.log(`Formatting evidence for AI arbitration for project ${body.projectId}...`);
      const evidence = await formatEvidenceForArbitration(
        body.projectId,
        `Project requirements: ${requirementsUri}`,
        `Work submitted by freelancer (${freelancer}): ${workUri}`,
        workUri,
        'Client rejected the work submission',  // Use the rejection reason if available
        `Project ID: ${body.projectId}`,
        requirementsUri  // Pass the project requirements URI as well
      );

      console.log(`Evidence formatted successfully, sending to AI service...`);

      // Get AI ruling
      console.log(`Requesting AI arbitration for project ${body.projectId}...`);
      const aiRuling = await requestAIArbitration(evidence);
      console.log(`Received AI ruling for project ${body.projectId}: ${aiRuling.ruling} with confidence ${aiRuling.confidence}`);

      // Create keyring and add the sudo account
      console.log(`Setting up sudo account for transaction signing...`);
      const keyring = new Keyring({ type: 'sr25519' });
      const sudoAccount = keyring.addFromUri(SUDO_MNEMONIC);
      console.log(sudoAccount);
      console.log(`Sudo account configured: ${sudoAccount.address.toString()}`);

      // Create the extrinsic to submit the AI ruling
      // In Polkadot.js, Rust snake_case functions are converted to camelCase
      console.log(`Creating extrinsic to submit AI ruling: ${aiRuling.ruling}`);
      // Handle the 'Inconclusive' case by defaulting to a specific outcome (e.g., ClientWins)
      const rulingForBlockchain = aiRuling.ruling === 'ClientWins' ? 'ClientWins' :
                                 aiRuling.ruling === 'FreelancerWins' ? 'FreelancerWins' :
                                 'ClientWins'; // Default to ClientWins for 'Inconclusive' or any other unexpected values
      const call = api.tx.arbitration.submitRuling(
        body.projectId,
        rulingForBlockchain
      );

      const extrinsic = api.tx.sudo.sudo(call);

      console.log(`Extrinsic created, submitting transaction to blockchain...`);

      // Submit the transaction using the sudo account
      console.log(`Submitting AI ruling transaction to blockchain for project ${body.projectId}...`);
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
              console.log(`Event - Section: ${section}, Method: ${method}`);
            });

            if (success && rulingSubmitted) {
              console.log(`AI ruling "${aiRuling.ruling}" successfully submitted for project ${body.projectId}`);
              resolve({
                success: true,
                finalizedBlock: status.asFinalized,
              });
            } else {
              console.error("AI ruling submission completed but may not have been processed successfully");
              reject(new Error("AI ruling submission completed but may not have been processed successfully"));
            }
          }
        }).catch((error: any) => {
          console.error("Error signing and sending AI ruling transaction:", error);
          reject(error);
        });
      });

      console.log(`AI arbitration process completed successfully for project ${body.projectId}`);

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
      console.log('Disconnecting from blockchain...');
      await api.disconnect();
      console.log('Disconnected from blockchain');
    }
  } catch (error: any) {
    console.error('AI Oracle Trigger Error:', error);
    console.error('Error stack:', error.stack);
    return Response.json(
      {
        error: 'Failed to trigger AI arbitration',
        details: error.message
      },
      { status: 500 }
    );
  }
}