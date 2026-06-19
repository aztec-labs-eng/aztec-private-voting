use aztec::macros::aztec;

#[aztec]
pub contract PrivateFeeJuice {
    use aztec::{
        macros::{
            functions::{allow_phase_change, external, internal},
            notes::note,
            storage::storage,
        },
        messages::delivery::MessageDelivery,
        note::{note_getter_options::NoteGetterOptions, note_viewer_options::NoteViewerOptions},
        protocol::{address::AztecAddress, constants::FEE_JUICE_ADDRESS, traits::Packable},
        state_vars::{Owned, PrivateSet},
    };
    use fee_juice::FeeJuice;

    #[derive(Packable, Eq)]
    #[note]
    struct BalanceNote {
        balance: u128,
    }

    #[storage]
    struct Storage<Context> {
        balances: Owned<PrivateSet<BalanceNote, Context>, Context>,
    }

    #[internal("private")]
    fn get_max_possible_fee() -> u128 {
        let gas_settings = self.context.gas_settings();
        let total_gas = gas_settings.gas_limits + gas_settings.teardown_gas_limits;
        (total_gas.da_gas as u128) * gas_settings.max_fees_per_gas.fee_per_da_gas
            + (total_gas.l2_gas as u128) * gas_settings.max_fees_per_gas.fee_per_l2_gas
    }

    #[external("private")]
    #[allow_phase_change]
    fn fee_entrypoint() {
        let note_getter_options = NoteGetterOptions::new().set_limit(1);
        let current_balance =
            self.storage.balances.at(self.msg_sender()).pop_notes(note_getter_options).get(0);
        let max_possible_fee = self.internal.get_max_possible_fee();
        assert(
            current_balance.balance >= max_possible_fee,
            "Not enough balance to cover the maximum possible fee",
        );
        self
            .storage
            .balances
            .at(self.msg_sender())
            .insert(BalanceNote { balance: current_balance.balance - max_possible_fee })
            .deliver(MessageDelivery::onchain_constrained());
        self.context.set_as_fee_payer();
        self.context.end_setup();
    }

    #[external("private")]
    #[allow_phase_change]
    fn fee_entrypoint_with_topup(amount: u128, secret: Field, message_leaf_index: Field) {
        let note_getter_options = NoteGetterOptions::new().set_limit(1);
        let current_balance_notes =
            self.storage.balances.at(self.msg_sender()).pop_notes(note_getter_options);
        let max_possible_fee = self.internal.get_max_possible_fee();
        let new_balance = if current_balance_notes.len() == 1 {
            current_balance_notes.get(0).balance + amount
        } else {
            amount
        };
        assert(
            new_balance >= max_possible_fee,
            "Not enough balance to cover the maximum possible fee",
        );
        self
            .storage
            .balances
            .at(self.msg_sender())
            .insert(BalanceNote { balance: new_balance - max_possible_fee })
            .deliver(MessageDelivery::onchain_constrained());
        self.context.set_as_fee_payer();
        self.call(FeeJuice::at(FEE_JUICE_ADDRESS).claim_and_end_setup(
            self.address,
            amount,
            secret,
            message_leaf_index,
        ));
    }

    /// Returns `owner`'s deposited fee-juice balance held by this FPC. Both fee
    /// entrypoints pop the single balance note and re-insert exactly one merged note,
    /// so an owner always has 0 or 1 `BalanceNote` (more than one would be a bug). The
    /// app reads this to decide between `fee_entrypoint` (balance covers the fee) and
    /// `fee_entrypoint_with_topup` (needs to bridge + deposit first).
    #[external("utility")]
    unconstrained fn get_balance(owner: AztecAddress) -> u128 {
        let options = NoteViewerOptions::new().set_limit(1);
        let notes = self.storage.balances.at(owner).view_notes(options);
        if notes.len() == 1 {
            notes.get(0).balance
        } else {
            0 as u128
        }
    }
}
