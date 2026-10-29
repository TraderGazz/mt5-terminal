// Runs on one transaction client. The row lock makes repeated/concurrent saves
// compare against the last committed values, not a stale browser snapshot.
export async function editTrade(client, id, fields, actor) {
  const { rows: previous } = await client.query('SELECT * FROM trades WHERE id = $1 FOR UPDATE', [id]);
  if (!previous[0]) return null;
  const entries = Object.entries(fields);
  const { rows } = await client.query(
    `UPDATE trades SET ${entries.map(([key], i) => `${key} = $${i + 1}`).join(', ')}, is_edited = TRUE
     WHERE id = $${entries.length + 1} RETURNING *`,
    [...entries.map(([, value]) => value), id],
  );
  const before = previous[0];
  const after = rows[0];
  // Negative-ticket manual entries already affect account() directly. Recording
  // their delta here as well would double count it. Existing opening-position
  // overrides also remain in their original account_offsets mechanism.
  if (BigInt(before.ticket || 0) > 0n && before.close_time && after.close_time
      && ['buy', 'sell'].includes(before.deal_type)
      && ['buy', 'sell'].includes(after.deal_type)) {
    await client.query(
      `INSERT INTO closed_trade_edits
         (trade_id, actor, old_profit, new_profit, old_swap, new_swap,
          old_commission, new_commission, delta)
       SELECT $1, $2, $3::numeric, $4::numeric, $5::numeric, $6::numeric,
              $7::numeric, $8::numeric,
              ($4::numeric - $3::numeric) + ($6::numeric - $5::numeric) + ($8::numeric - $7::numeric)
       WHERE ($4::numeric - $3::numeric) + ($6::numeric - $5::numeric) + ($8::numeric - $7::numeric) <> 0`,
      [id, String(actor), before.profit ?? 0, after.profit ?? 0,
        before.swap ?? 0, after.swap ?? 0, before.commission ?? 0, after.commission ?? 0],
    );
  }
  return after;
}

export async function readClosedTradeEditDelta(query) {
  const { rows } = await query('SELECT COALESCE(SUM(delta), 0) AS delta FROM closed_trade_edits');
  return Number(rows[0].delta);
}
