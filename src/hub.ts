import { applyChanges, Doc } from "automerge";
import { getClock, later, recentChanges, union } from "automerge-clocks";
import { Map } from "immutable";
import { Clock, Message } from "./types";

/**
 * An Automerge Network protocol getting consensus
 * between two documents in different places.
 */
export class Hub {
  // This is just an in-memory cache of where a peer is.
  // TODO: we may want to automatically get rid of items from this cache.
  _theirClocks: Map<string, Clock>;
  _broadcast: (msg: Message) => void;
  _sendTo: (peerId: string, msg: Message) => void;

  constructor(
    // Send message to just one peerId
    sendMsgTo: (peerId: string, msg: Message) => void,
    // Send to everyone
    broadcastMsg: (msg: Message) => void
  ) {
    this._theirClocks = Map();
    this._broadcast = broadcastMsg;
    this._sendTo = sendMsgTo;
  }

  public applyMessage<T>(peerId: string, msg: Message, doc: Doc<T>): Doc<T> {
    let ourDoc = doc;

    // 0. We should immediately update the clock of our peer.
    this._theirClocks = this._theirClocks.set(peerId, msg.clock);

    // 1. If they've sent us changes, we'll try to apply them.
    if (msg.changes) {
      ourDoc = applyChanges(doc, msg.changes);
    }

    // 2. If we have any changes to let them know about,
    // we should send it to them.
    const ourChanges = recentChanges(doc, msg.clock);
    if (ourChanges.length > 0) {
      this.sendMsgTo(peerId, {
        clock: getClock(ourDoc),
        changes: ourChanges
      });
    }

    // 3. If our clock is still earlier than their clock,
    // then we should let them know, which will prompt
    // them to send us changes via 2. listed above.
    const ourClock = getClock(ourDoc);
    if (later(msg.clock, ourClock)) {
      this.broadcastMsg({
        clock: ourClock
      });
    }

    return ourDoc;
  }

  public notify<T>(doc: Doc<T>) {
    // 1. If we have folks we're tracking, send them changes if needed.
    this._theirClocks.forEach((clock, peerId) => {
      const ourChanges = recentChanges(doc, clock);
      if (ourChanges.length > 0) {
        this.sendMsgTo(peerId, {
          clock: getClock(doc),
          changes: ourChanges
        });
      }
    });

    // 2. Then, we just let everyone know everyone where we're at.
    // If our copy of "theirClock" is wrong, they'll
    // update us via 3. in 'applyMessage'.
    this.broadcastMsg({
      clock: getClock(doc)
    });
  }

  private sendMsgTo(peerId: string, msg: Message) {
    // Whenever we send a message, we should optimistically
    // update theirClock with what we're about to send them.
    const theirClock = this._theirClocks.get(peerId, Map<string, number>());
    this._theirClocks = this._theirClocks.set(
      peerId,
      union(theirClock, msg.clock)
    );

    this._sendTo(peerId, msg);
  }

  private broadcastMsg(msg: Message) {
    // send msg first
    this._broadcast(msg);

    // Todo: maybe do this asynchronously to not block in big rooms?
    this._theirClocks = this._theirClocks.map(clock => {
      return union(clock, msg.clock);
    });
  }
}
