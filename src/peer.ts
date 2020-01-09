import { applyChanges, Doc } from "automerge";
import { getClock, later, recentChanges, union } from "automerge-clocks";
import { Map } from "immutable";
import { Message } from "./types";

/**
 * An Automerge Network protocol getting consensus
 * between two documents in different places.
 */
export class Peer {
  _theirClock: Map<string, number>;
  _sendMsg: (msg: Message) => void;

  constructor(sendMsg: (msg: Message) => void) {
    this._theirClock = Map();
    this._sendMsg = sendMsg;
  }

  public applyMessage<T>(msg: Message, doc: Doc<T>): Doc<T> {
    let ourDoc = doc;

    // 1. If they've sent us changes, we'll try to apply them.
    if (msg.changes) {
      ourDoc = applyChanges(doc, msg.changes);
    }

    // 2. If we have any changes to let them know about,
    // we should send it to them.
    const ourChanges = recentChanges(doc, msg.clock);
    if (ourChanges.length > 0) {
      this.sendMsg({
        clock: getClock(ourDoc),
        changes: ourChanges
      });
    }

    // 3. If our clock is still earlier than their clock,
    // then we should let them know, which will prompt
    // them to send us changes via 2. listed above.
    const ourClock = getClock(ourDoc);
    if (later(msg.clock, ourClock)) {
      this.sendMsg({
        clock: ourClock
      });
    }

    if (msg.changes) {
      return ourDoc;
    }
  }

  public notify<T>(doc: Doc<T>) {
    // 1. If we think that we have changes to share, we'll send them.
    const ourChanges = recentChanges(doc, this._theirClock);
    if (ourChanges.length > 0) {
      this.sendMsg({
        clock: getClock(doc),
        changes: ourChanges
      });
      return;
    }

    // 2. Otherwise, we just let them know where we're at.
    // If our copy of "theirClock" is wrong, they'll
    // update us via 3. in 'applyMessage'.
    this.sendMsg({
      clock: getClock(doc)
    });
  }

  private sendMsg(msg: Message) {
    // Whenever we send a message, we should optimistically
    // update theirClock with what we're about to send them.
    this._theirClock = union(this._theirClock, msg.clock);
    this._sendMsg(msg);
  }
}
