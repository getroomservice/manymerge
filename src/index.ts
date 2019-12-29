import { Backend, Change, Clock, Doc, Frontend, Message } from "automerge";
import { fromJS, Map } from "immutable";
import * as invariant from "invariant";
import lessOrEqual from "./lessOrEqual";

// A map of document ids to a vector clock.
type ClockMap = Map<string, Clock>;

// Updates the vector clock for `docId` in `clockMap` (mapping from docId to vector clock)
// by merging in the new vector clock `clock`. Returns the updated `clockMap`, in which each node's
// sequence number has been set to the maximum for that node.
function clockUnion(clockMap: ClockMap, docId: string, clock) {
  clock = clockMap.get(docId, Map()).mergeWith((x, y) => Math.max(x, y), clock);
  return clockMap.set(docId, clock);
}

export interface AsyncDocStore {
  getDoc<T>(docId: string): Promise<Doc<T>>;
  setDoc<T>(docId: string, doc: Doc<T>): Promise<Doc<T>>;
}

// Keeps track of the communication with one particular peer. Allows updates
// for many documents to be multiplexed over a single connection.
export class Connection {
  private _docStore: AsyncDocStore;
  private _sendMsg: (peerId: string, msg: Message) => void;
  private _ourClockMap: Map<string, Clock>;

  // A map of a peerId to a ClockMap, which is
  // a map of docIds to a VectorClock, which is
  // a map of actorIds to a seq number found in an opset.
  private _theirClockMaps: Map<string, ClockMap>;

  constructor(params: {
    // The AsyncDocStore that lets us read and write documents.
    store: AsyncDocStore;

    // The function we use to broadcast messages to the network.
    sendMsg: (peerId: string, msg: Message) => void;
  }) {
    this._docStore = params.store;
    this._sendMsg = params.sendMsg;
    this._ourClockMap = Map();
    this._theirClockMaps = Map();
  }

  // Manually adds a peer that we should talk to
  addPeer(peerId: string) {
    if (this._theirClockMaps.has(peerId)) {
      return; // do nothing if we already have this peer
    }

    this._theirClockMaps = this._theirClockMaps.set(peerId, Map({}));
  }

  // manually call this when you want to change the document on the network.
  async docChanged(docId: string, doc: Doc<any>) {
    const state = Frontend.getBackendState(doc);
    const clock = state.getIn(["opSet", "clock"]);
    if (!clock) {
      throw new TypeError(
        "This object cannot be used for network sync. " +
          "Are you trying to sync a snapshot from the history?"
      );
    }

    if (!lessOrEqual(this._ourClockMap.get(docId, Map()), clock)) {
      throw new RangeError("Cannot pass an old state object to a connection");
    }

    await this.syncDoc(docId);
  }

  async receiveMsg(peerId: string, msg: Message) {
    if (!peerId || typeof peerId !== "string") {
      throw new Error(`receiveMsg got a peerId that's not a string`);
    }

    invariant(
      this._theirClockMaps.keySeq().includes(peerId),
      `receivedMsg called with unknown peer '${peerId}'. Peers must be registered first with "conn.addPeer('${peerId}')"`
    );

    if (msg.clock) {
      this._theirClockMaps = this._theirClockMaps.set(
        peerId,
        clockUnion(
          this._theirClockMaps.get(peerId),
          msg.docId,
          fromJS(msg.clock)
        )
      );
    }
    if (msg.changes) {
      return this.applyChanges(msg.docId, fromJS(msg.changes));
    }

    if (await this._docStore.getDoc(msg.docId)) {
      this.syncDoc(msg.docId);
    } else if (!this._ourClockMap.has(msg.docId)) {
      // If the remote node has data that we don't, immediately ask for it.
      // TODO should we sometimes exercise restraint in what we ask for?
      this.sendMsg(peerId, this.createMsg(msg.docId, Map()));
    }

    return this._docStore.getDoc(msg.docId);
  }

  private async applyChanges(
    docId: string,
    changes: Change[]
  ): Promise<Doc<any>> {
    let doc =
      (await this._docStore.getDoc(docId)) ||
      // @ts-ignore because automerge has bad typings
      Frontend.init({ backend: Backend });

    const oldState = Frontend.getBackendState(doc);
    const [newState, patch] = Backend.applyChanges(oldState, changes);

    // @ts-ignore because automerge has bad typings
    patch.state = newState;
    doc = Frontend.applyPatch(doc, patch);
    await this._docStore.setDoc(docId, doc);
    return doc;
  }

  private sendMsg(peerId: string, msg: Message) {
    this.updateOurClock(msg.docId, msg.clock);
    this._sendMsg(peerId, msg);
  }

  private updateOurClock(docId: string, clock: Map<string, any>) {
    this._ourClockMap = clockUnion(this._ourClockMap, docId, clock);
  }

  private createMsg(
    docId: string,
    clock: Map<string, any>,
    changes?: Change[]
  ): Message {
    const msg: Message = {
      docId,
      clock: clock.toJS() as Clock
    };
    if (changes) msg.changes = changes;
    return msg;
  }

  // Syncs document with everyone.
  private async syncDoc(docId: string) {
    for (let peerId of this._theirClockMaps.keys()) {
      await this.maybeSyncDocWithPeer(peerId, docId);
    }
  }

  private async maybeSyncDocWithPeer(theirPeerId: string, docId: string) {
    const doc = await this._docStore.getDoc(docId);
    const state = Frontend.getBackendState(doc);
    const clock = state.getIn(["opSet", "clock"]);

    const changes = Backend.getMissingChanges(
      state,
      this._theirClockMaps.get(theirPeerId).get(docId, Map() as Clock)
    );

    // if we have changes we need to sync, do so.
    if (changes.length > 0) {
      this._theirClockMaps = this._theirClockMaps.set(
        theirPeerId,
        clockUnion(this._theirClockMaps.get(theirPeerId), docId, clock)
      );

      this.sendMsg(theirPeerId, this.createMsg(docId, clock, changes));
      return;
    }

    const ourClockIsOutOfSync = !clock.equals(
      this._ourClockMap.get(docId, Map())
    );
    if (ourClockIsOutOfSync) {
      // Note: updates ourClock AND sends a message.
      this.sendMsg(theirPeerId, this.createMsg(docId, clock));
    }
  }
}
