import { applyChanges, Doc } from 'automerge';
import { getClock, later, recentChanges, union } from 'automerge-clocks';
import { Map, fromJS } from 'immutable';
import { Clock, Message } from './types';

/**
 * An Automerge Network protocol getting consensus
 * between two documents in different places.
 */
export class Hub {
  // We keep track of where we think our clock is because
  // getting and saving the doc is not under the Hub's control
  // and is offten implemented asynchronously (such as a db write).
  //
  // So by keeping a local copy of ourClock, we'll help prevent
  // race conditions that pop up when we get a message in between
  // a write's start and end.
  _ourClock: Clock;

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
    this._ourClock = Map();
    this._theirClocks = Map();
    this._broadcast = broadcastMsg;
    this._sendTo = sendMsgTo;
  }

  public applyMessage<T>(
    peerId: string,
    msg: Message,
    doc: Doc<T>
  ): Doc<T> | undefined {
    let ourDoc = doc;

    // Convert clock to Immutable Map in case its been serialized
    const msgClock = fromJS(msg.clock);

    // 0. We should immediately update the clock of our peer.
    this._theirClocks = this._theirClocks.set(peerId, msgClock);

    // 1. If they've sent us changes, we'll try to apply them.
    if (msg.changes) {
      // We apply changes locally and update our clock before broadcasting.
      // This way, in case the broadcast causes new messages to be delivered to us
      // synchronously, our clock is uptodate.
      ourDoc = applyChanges(doc, msg.changes);
      this._ourClock = getClock(ourDoc);

      // We broadcast FIRST for the other members of the hub
      // Since we'll assume these changes should be applied to everyone.
      this.broadcastMsg({
        clock: getClock(ourDoc),

        // We make the assumption that if someone's sent the hub
        // changes, they likely want those changes to be sent to
        // everyone else.
        changes: msg.changes,
      });
    }

    // 2. If we have any changes to let them know about,
    // we should send it to them.
    const ourChanges = recentChanges(doc, msgClock);
    if (ourChanges.length > 0) {
      this.sendMsgTo(peerId, {
        clock: getClock(ourDoc),
        changes: ourChanges,
      });
    }

    // 3. If their clock is later than our clock,
    // then we should let them know, which will prompt
    // them to send us changes via 2. listed above.
    if (later(msgClock, this._ourClock)) {
      this.broadcastMsg({
        clock: this._ourClock,
      });
    }

    // Finally, we we made changes, we should return the
    // doc to be cached. Otherwise return nothing.
    if (msg.changes) {
      return ourDoc;
    }

    return;
  }

  public notify<T>(doc: Doc<T>) {
    // TODO: check this clock against our clock and don't send messages
    // if we don't need to.

    // 0. Update ourClock
    this._ourClock = union(this._ourClock, getClock(doc));

    // 1. If we have folks we're tracking, send them changes if needed.
    // @ts-ignore
    this._theirClocks.forEach((clock, peerId) => {
      if (!clock) return;
      if (!peerId) return;
      const ourChanges = recentChanges(doc, clock);
      if (ourChanges.length > 0) {
        this.sendMsgTo(peerId, {
          clock: getClock(doc),
          changes: ourChanges,
        });
      }
    });

    // 2. Then, we just let everyone know everyone where we're at.
    // If our copy of "theirClock" is wrong, they'll
    // update us via 3. in 'applyMessage'.
    this.broadcastMsg({
      clock: getClock(doc),
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

    this._ourClock = msg.clock;

    // Todo: maybe do this asynchronously to not block in big rooms?
    this._theirClocks = this._theirClocks.map(clock => {
      return union(clock!, msg.clock);
    }) as Map<string, Clock>;
  }
}
