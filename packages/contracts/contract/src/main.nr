use aztec::macros::aztec;

/// PrivateVoting - the heart of the quickstart.
///
/// Votes are cast in *private*: `cast_vote` runs in a private execution context, so
/// nobody learns who you voted for. The only thing that ever becomes public is the
/// aggregate `tally`. A `SingleUseClaim` per (election, voter) emits a *nullifier* the
/// first time you vote, so a second vote is rejected by the protocol. That public/
/// private split guarded by a nullifier is the whole point of building on Aztec.
#[aztec]
pub contract PrivateVoting {
    use aztec::macros::{events::event, functions::{external, initializer, only_self, view}, storage::storage};
    use aztec::protocol::{address::AztecAddress, traits::{Deserialize, Serialize, ToField}};
    use aztec::state_vars::{Map, Owned, PublicImmutable, PublicMutable, SingleUseClaim};

    #[derive(Serialize, Deserialize)]
    pub struct ElectionId {
        id: Field,
    }

    // docs:start:vote_cast_event
    /// Emitted publicly every time a vote is counted, so a UI can show a live feed.
    /// Public (no `deliver_to`): anyone can read it, it reveals only the candidate and
    /// the running tally, never the voter.
    #[event]
    pub struct VoteCast {
        election_id: Field,
        candidate: Field,
        tally: Field,
    }
    // docs:end:vote_cast_event

    impl ElectionId {
        pub fn new(id: Field) -> Self {
            Self { id }
        }
    }

    impl ToField for ElectionId {
        fn to_field(self) -> Field {
            self.id
        }
    }

    // docs:start:storage_struct
    #[storage]
    struct Storage<Context> {
        // admin can start and end elections
        admin: PublicMutable<AztecAddress, Context>,
        // election => candidate => number of votes (public: the tally is the only public state)
        tally: Map<ElectionId, Map<Field, PublicMutable<Field, Context>, Context>, Context>,
        // election => whether voting has ended
        vote_ended: Map<ElectionId, PublicMutable<bool, Context>, Context>,
        // election => block the election became active at
        active_at_block: Map<ElectionId, PublicImmutable<u32, Context>, Context>,
        // election => voter => single-use claim that lets a voter vote at most once per election
        vote_claims: Map<ElectionId, Owned<SingleUseClaim<Context>, Context>, Context>,
    }
    // docs:end:storage_struct

    #[external("public")]
    #[initializer]
    fn constructor(admin: AztecAddress) {
        self.storage.admin.write(admin);
    }

    // docs:start:cast_vote
    #[external("private")]
    fn cast_vote(election_id: ElectionId, candidate: Field) {
        // `.claim()` emits a nullifier derived from (election, voter). Voting again with the
        // same account produces the same nullifier, which the protocol rejects, so each
        // account can vote at most once per election, without revealing *who* voted.
        self.storage.vote_claims.at(election_id).at(self.msg_sender()).claim();
        // The vote itself stays private; we only enqueue a public bump of the aggregate tally.
        self.enqueue_self._add_to_tally_public(election_id, candidate);
    }
    // docs:end:cast_vote

    // docs:start:add_to_tally
    #[external("public")]
    #[only_self]
    fn _add_to_tally_public(election_id: ElectionId, candidate: Field) {
        assert(self.storage.active_at_block.at(election_id).read() <= self.context.block_number());
        assert(self.storage.vote_ended.at(election_id).read() == false, "Vote has ended");
        let new_tally = self.storage.tally.at(election_id).at(candidate).read() + 1;
        self.storage.tally.at(election_id).at(candidate).write(new_tally);
        // Emit a public event so a UI can show a live feed of votes as they land.
        self.emit(VoteCast { election_id: election_id.to_field(), candidate, tally: new_tally });
    }
    // docs:end:add_to_tally

    #[external("public")]
    fn start_vote(election_id: ElectionId) {
        assert(self.storage.admin.read().eq(self.msg_sender()), "Only admin can start votes");
        self.storage.vote_ended.at(election_id).write(false);
        self.storage.active_at_block.at(election_id).initialize(self.context.block_number());
    }

    #[external("public")]
    fn end_vote(election_id: ElectionId) {
        assert(self.storage.admin.read().eq(self.msg_sender()), "Only admin can end votes");
        self.storage.vote_ended.at(election_id).write(true);
    }

    #[external("public")]
    #[view]
    fn get_tally(election_id: ElectionId, candidate: Field) -> Field {
        self.storage.tally.at(election_id).at(candidate).read()
    }
}
