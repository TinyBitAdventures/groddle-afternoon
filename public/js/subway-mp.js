/**
 * The Ur subway between real players (register G115 online): pure helpers for
 * the multiplayer branch of features/subway-feature.js. The realtime server
 * (groddle-afternoon-server subway.go) runs shared trains: riders boarding the
 * same line at the same station while a train stands there share it (one
 * street, TRAIN_<id>: they see each other and chat), it waits for riders as
 * the source did, and each rider gets off at their own stop.
 *
 * Source: locations/inc_transit.js transit_enter_instance 147-177 and
 * transit_next_instance 116-141 (board a standing train of the line with
 * room, max_capacity 10, else a new one), transit_schedule_departure 214-259
 * (wait for min_capacity 3 riders or initial_departure_timeout 60 s:
 * "This train will be departing when N more players board, or in S
 * seconds."), transit_depart 266-312 (an empty train goes out of service),
 * transit_arrive 345-400 (10 s at each stop, "Get off train?" to each rider).
 * Ours: a lone rider (nobody else on the platform) leaves after solo's 10 s;
 * stops are 20 s apart as in solo.
 */

/** How long a paid boarder waits for the server before riding alone (an old or unreachable server). */
export const BOARD_ANSWER_MS = 3000;

const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;

export const SUBWAY_MP_TEXT = Object.freeze({
  /** transit_schedule_departure 258 (pluralize). */
  waiting: (need, seconds) => `This train will be departing when ${plural(need, 'more player boards', 'more players board')}, or in ${plural(seconds, 'second', 'seconds')}.`,
  refused: 'The train has gone. Your fare is back in your purse.',
  boarded: (name) => `${name} got on the train.`,
  gotOff: (name) => `${name} got off the train.`,
});

/** The server's train message, checked: null when it is not one. */
export function trainOf(msg) {
  if (!msg || typeof msg.train !== 'string' || !/^TRAIN_[0-9A-F]{16}$/.test(String(msg.street || ''))) return null;
  const phase = ['boarding', 'moving', 'stopped'].includes(msg.phase) ? msg.phase : 'boarding';
  const riders = Array.isArray(msg.riders) ? msg.riders.map((r) => ({ id: Number(r?.id) || 0, name: String(r?.name || '') })).filter((r) => r.id) : [];
  return {
    train: msg.train,
    street: msg.street,
    line: msg.line === 'backwards' ? 'backwards' : 'forwards',
    stop: Number(msg.stop) || 0,
    phase,
    initial: msg.initial === true,
    need: Math.max(0, Math.floor(Number(msg.need) || 0)),
    departIn: Math.max(0, Number(msg.depart_in) || 0),
    arriveIn: Math.max(0, Number(msg.arrive_in) || 0),
    riders,
  };
}

/**
 * Put a ride (js/subway.js createRide) on the server's train clock at `now`.
 * Standing (boarding or stopped): the departure (and the doors 3 s before it)
 * come from the server. Moving: the arrival does; a ride still standing here
 * departs now. Returns the ride.
 */
export function applyTrain(ride, train, now) {
  if (!ride || !train) return ride;
  ride.train = train.train;
  ride.street = train.street;
  ride.riders = train.riders;
  ride.need = train.need;
  ride.initial = train.initial;
  const t = ride.timing;
  if (train.phase !== 'moving') {
    if (ride.phase === 'moving') return ride; // our clock is behind: the arrival comes by itself
    ride.departAt = now + train.departIn;
    ride.doorsAt = ride.departAt - t.doors;
    if (now < ride.doorsAt) ride.doorsClosed = false;
    return ride;
  }
  const arriveAt = now + train.arriveIn;
  if (ride.phase !== 'moving') {
    // The train left while we stood: depart now, travelling what is left of the hop.
    ride.departAt = Math.min(now, arriveAt - t.travel);
    ride.doorsAt = ride.departAt - t.doors;
    return ride;
  }
  ride.arriveAt = arriveAt;
  if (!ride.called) ride.preAt = arriveAt - t.preArrival;
  if (!ride.braked) ride.brakesAt = arriveAt - t.brakes;
  return ride;
}

/** Who got on and off between two rider lists (names, not you). */
export function riderChanges(before = [], after = [], me = 0) {
  const was = new Map(before.map((r) => [r.id, r.name]));
  const now = new Map(after.map((r) => [r.id, r.name]));
  const on = [];
  const off = [];
  for (const [id, name] of now) if (id !== me && !was.has(id)) on.push(name);
  for (const [id, name] of was) if (id !== me && !now.has(id)) off.push(name);
  return { on, off };
}
