
# TaskChain

TaskChain is a fully decentralized freelancing parachain built on Substrate. It creates a trustless ecosystem for clients and freelancers to collaborate from project inception to final payment, without needing a central authority.
Its core features are:
* Automated Escrow: pallet-projects locks a client's funds on-chain when a project is created and automatically releases them to the freelancer upon successful completion, eliminating the need for a trusted financial intermediary.
* Portable On-Chain Reputation: pallet-reputation tracks every user's history—projects completed, earnings, ratings, and dispute outcomes. This data is the foundation for a rich, verifiable professional identity that a user owns and can take anywhere.
* Multi-Tiered Decentralized Arbitration: pallet-arbitration provides a structured, economically rational dispute resolution process. If a client rejects work:
    1. AI Arbitration (Round 1): The freelancer can initiate a fast, cheap arbitration handled by an AI oracle.
    2. Human Jury (Round 2 & 3): The losing party can appeal the decision to a jury of high-reputation peers, selected from a pool of staked users. The process uses escalating bonds to deter frivolous appeals.
* Economic Security: Jurors must stake tokens to participate. This "skin in the game" incentivizes fair and thoughtful voting, as misbehavior can lead to their stake being slashed.


## Getting Started

#### Install [Pop CLI](https://github.com/r0gue-io/pop-cli) - the all-in-one Polkadot development tool:
> Detailed installation instructions can be found [here](https://learn.onpop.io/v/cli/installing-pop-cli).
```
cargo install --force --locked pop-cli
```

#### Clone the project
```
git clone https://github.com/polkadotrafat/taskchain.git
```

#### Build the parachain
```
cargo build --release
```

#### Run the parachain
```sh
 pop up ./network.toml
```

You can intercat with the parachain at https://polkadot.js.org/apps/?rpc=ws://127.0.0.1:9933#/explorer

More instructions here
> 👉 https://learn.onpop.io/v/appchains/guides/running-your-parachain

#### Run the frontend
```sh
 cd frontend
 npm run dev
```
Your frontend will typically boot up at http://localhost:3000/

Import these five funded dev accounts into your wallet to test the blockchain
```
Alice Client 	"bottom drive obey lake curtain smoke basket hold race lonely fit walk//Alice"
Bob Freelancer	"bottom drive obey lake curtain smoke basket hold race lonely fit walk//Bob"
Charlie Juror	"bottom drive obey lake curtain smoke basket hold race lonely fit walk//Charlie"
Dave Juror	"bottom drive obey lake curtain smoke basket hold race lonely fit walk//Dave"
Eve Juror	"bottom drive obey lake curtain smoke basket hold race lonely fit walk//Eve"
```

Additionally inside the frontend folder copy env.example to .env and add the openai and pinata keys to make the frontend functional. 

### Documentation

#### Pallet: `pallet-projects`

This pallet manages the lifecycle of projects, from creation to completion. It handles project creation, freelancer applications, work submission, and payment. 
**Functions:**

*   `create_project(origin, budget, uri, duration)`: Creates a new project.
    *   `origin`: The client creating the project.
    *   `budget`: The project budget, which will be locked in escrow.
    *   `uri`: A URI pointing to the project's details.
    *   `duration`: The time allotted for the freelancer to complete the work.
*   `apply_for_project(origin, project_id)`: Allows a freelancer to apply for a project.
    *   `origin`: The freelancer applying for the project.
    *   `project_id`: The ID of the project to apply for.
*   `start_work(origin, project_id, selected_freelancer)`: The client selects a freelancer and starts the project.
    *   `origin`: The client starting the project.
    *   `project_id`: The ID of the project.
    *   `selected_freelancer`: The account of the chosen freelancer.
*   `submit_work(origin, project_id, content_hash, uri, metadata)`: The freelancer submits their work.
    *   `origin`: The freelancer submitting the work.
    *   `project_id`: The ID of the project.
    *   `content_hash`: A hash of the submitted work.
    *   `uri`: A URI pointing to the work submission.
    *   `metadata`: Additional metadata about the submission.
*   `accept_work(origin, project_id, rating)`: The client accepts the work and releases payment.
    *   `origin`: The client accepting the work.
    *   `project_id`: The ID of the project.
    *   `rating`: A rating from 1 to 5 for the freelancer's work.
*   `reject_work(origin, project_id, reason_uri)`: The client rejects the work.
    *   `origin`: The client rejecting the work.
    *   `project_id`: The ID of the project.
    *   `reason_uri`: A URI pointing to the reason for rejection.
*   `cancel_project(origin, project_id)`: The client cancels a project.
    *   `origin`: The client cancelling the project.
    *   `project_id`: The ID of the project.

#### Pallet: `pallet-arbitration`

This pallet handles dispute resolution. It manages a multi-tiered arbitration process involving an AI oracle and human jurors.

**Functions:**

*   `create_dispute(origin, project_id, evidence_uri)`: A freelancer initiates a dispute after their work is rejected.
    *   `origin`: The freelancer initiating the dispute.
    *   `project_id`: The ID of the disputed project.
*   `submit_ruling(origin, project_id, ruling)`: The AI oracle submits its ruling.
    *   `origin`: The AI oracle.
    *   `project_id`: The ID of the disputed project.
    *   `ruling`: The ruling from the AI (`ClientWins` or `FreelancerWins`).
*   `appeal_ruling(origin, project_id, evidence_uri)`: The losing party appeals the AI's ruling to a human jury.
    *   `origin`: The party appealing the ruling.
    *   `project_id`: The ID of the disputed project.
    *   `evidence_uri`: A URI for additional evidence for the appeal.
*   `cast_vote(origin, project_id, vote)`: A juror casts their vote in a dispute.
    *   `origin`: The juror casting the vote.
    *   `project_id`: The ID of the disputed project.
    *   `vote`: The juror's vote (`ForClient` or `ForFreelancer`).
*   `enforce_final_ruling(origin, project_id)`: Enforces the final ruling after the appeal period has expired without an appeal.
    *   `origin`: Any signed user.
    *   `project_id`: The ID of the disputed project.
*   `finalize_round(origin, project_id)`: Finalizes a round of voting and determines the outcome.
    *   `origin`: Any signed user.
    *   `project_id`: The ID of the disputed project.

#### Pallet: `pallet-reputation`

This pallet manages user reputation. It tracks metrics like projects completed, earnings, ratings, and dispute outcomes to calculate a reputation score. It also manages juror registration and selection.

**Functions:**

*   `register_user(origin)`: Registers a new user on the platform.
    *   `origin`: The user to register.
*   `update_weights(origin, ...)`: Updates the weights used in the reputation calculation. This is a governance-controlled function.
    *   `origin`: A governance-authorized account.
    *   `...`: The new weight values.
*   `register_as_juror(origin)`: A user registers to become a juror.
    *   `origin`: The user registering as a juror.
*   `deregister_as_juror(origin)`: A user deregisters as a juror.
    *   `origin`: The user deregistering.



### Support

Rafat Hussain
Email rafat.hsn@gmail.com

