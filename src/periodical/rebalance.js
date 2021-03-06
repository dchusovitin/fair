/*
The most important job of the hub is to rebalance assets once in a while.
1. the hub finds who wants to insure their uninsured balances. They can learn automatically (given soft limit) or manually (Request Insurance in the wallet)
2. now the hub tries to find the total amount of insurance needed from the net-spenders who are currently online
3. it's up to the alg implementation to start disputes with net-spenders who are offline for too long
4. if hub fails to find enough net-spenders right now, they may drop some low value or high value net-receivers to match the numbers on both sides
5. packs withdrawals and deposits into one large rebalance batch and broadcasts onchain

Current implementation is super simple and straightforward. There's huge room for improvement:
* smart learning based on balances over time not on balance at the time of matching
* use as little withdrawals/deposits to transfer as much as possible volume
* have different schedule for different assets, e.g. rebalance FRD every 1 block but rare assets every 1k blocks
* often hub needs to request insurance from another hub (cross-hub payments).

General recommendations:
1. assets stuck in a dispute is a waste. It's better to do everything by mutual agreement as much as possible, w/o suffering dispute delays and locked up liquidity
2. the hub must store as little funds on their @onchain balances as possible. So once hub withdraw from net-spenders they should immediately deposit it to net-receiver.

*/

const withdraw = require('../offchain/withdraw')

const rebalance = async function(asset) {
  var deltas = await Delta.findAll({
    where: {
      myId: me.pubkey,
      asset: asset
    }
  })

  // we request withdrawals and check in few seconds for them
  let netSpenders = []
  let netReceivers = []

  let minRisk = 100 //K.risk

  for (let d of deltas) {
    let ch = await me.getChannel(d.partnerId, d.asset)

    // finding who has uninsured balances AND
    // requests insurance OR gone beyond soft limit
    if (
      ch.they_uninsured > 0 &&
      (ch.d.they_requested_insurance ||
        (ch.d.they_soft_limit > 0 && ch.they_uninsured >= ch.d.they_soft_limit))
    ) {
      //l('Adding output for our promise ', ch.d.partnerId)
      netReceivers.push(ch)
    } else if (ch.insured >= minRisk) {
      if (me.users[ch.d.partnerId]) {
        // they either get added in this rebalance or next one

        netSpenders.push(withdraw(ch, ch.insured))
      } else if (ch.d.withdrawal_requested_at == null) {
        l('Delayed pull')
        ch.d.withdrawal_requested_at = ts()
      } else if (ch.d.withdrawal_requested_at + 600 < ts()) {
        l('User is offline for too long, or tried to cheat')
        me.batchAdd('disputeWith', [asset, await deltaGetDispute(ch.d)])
      }
    }
  }

  // checking on all withdrawals we expected to get, then rebalance
  netSpenders = await Promise.all(netSpenders)

  // 1. how much we own of this asset
  let weOwn = userAsset(me.record, asset)

  // 2. add all withdrawals we received
  for (let ch of netSpenders) {
    if (ch.d.withdrawal_sig) {
      weOwn += ch.d.withdrawal_amount
      let user = await getUserByIdOrKey(ch.d.partnerId)

      me.batchAdd('withdrawFrom', [
        ch.d.asset,
        [ch.d.withdrawal_amount, user.id, ch.d.withdrawal_sig]
      ])
    } else {
      // offline? dispute
      ch.d.withdrawal_requested_at = ts()
    }
  }

  // 3. debts will be enforced on us (if any), so let's deduct them beforehand
  let debts = await me.record.getDebts({where: {asset: asset}})
  for (let d of debts) {
    weOwn -= d.amount_left
  }

  // sort receivers, larger ones are given priority
  netReceivers.sort((a, b) => b.they_uninsured - a.they_uninsured)

  // dont let our FRD onchain balance go lower than that
  let safety = asset == 1 ? K.hub_standalone_balance : 0

  // 4. now do our best to cover net receivers
  for (let ch of netReceivers) {
    weOwn -= ch.they_uninsured
    if (weOwn >= safety) {
      me.batchAdd('depositTo', [
        asset,
        [ch.they_uninsured, me.record.id, ch.d.partnerId, 0]
      ])

      // nullify their insurance request
      ch.d.they_requested_insurance = false
    } else {
      l(
        `Run out of funds for asset ${asset}, own ${weOwn} need ${
          ch.they_uninsured
        }`
      )
      break
    }
  }
}

module.exports = () => {
  if (PK.pending_batch || me.batch.length > 0) return l('There are pending tx')

  l('Starting rebalance')
  // we iterate over all assets in existance and rebalance each separately
  for (let i = 1; i <= K.assets_created; i++) {
    rebalance(i)
  }
}
