import { change, from, getChanges, init } from "automerge";
import { getClock } from "automerge-clocks";
import { Map } from "immutable";
import { Hub } from "./hub";
import { Peer } from "./peer";
import { Message } from "./types";

test("A peer can send a change to the hub", () => {
  const peerSendMsg = jest.fn();
  const peer = new Peer(peerSendMsg);

  // send an update
  peer.notify(
    change(init<any>(), doc => {
      doc.name = "my-doc";
    })
  );

  // We just sent this message
  const [clientMsg] = peerSendMsg.mock.calls[0];
  expect(clientMsg.changes.length).toBe(1);

  // Check that a hub can get the message back
  const hubSendMsg = jest.fn();
  const hubBroadcastMsg = jest.fn();
  const hub = new Hub(hubSendMsg, hubBroadcastMsg);

  const newDoc = hub.applyMessage("my-peer", clientMsg, init<any>());

  // We received and applied changes to the doc
  expect(newDoc.name).toBe("my-doc");

  // We didn't send anything back since we don't need to
  expect(hubSendMsg.mock.calls.length).toBe(0);

  // We should expect to broadcast our changes to other peers
  expect(hubBroadcastMsg.mock.calls.length).toBe(1);

  // We've stored this peer's current state
  expect(hub._theirClocks.get("my-peer")).toEqual(getClock(newDoc));
});

test("The hub can broadcast it's clock to an unknown peer.", () => {
  const hubSendMsg = jest.fn();
  const hubBroadcastMsg = jest.fn();
  const hub = new Hub(hubSendMsg, hubBroadcastMsg);

  /**
   * Hub broadcasts doc to unknown peer
   */

  // At this point, the hub does not have any peers cached,
  // it's just broadcasting them to unknown peers.
  const hubDoc = from({ name: "from-hub" });
  hub.notify(hubDoc);

  expect(hubBroadcastMsg.mock.calls.length).toBe(1);
  const [broadcastMsg] = hubBroadcastMsg.mock.calls[0] as [Message];

  // Because we haven't registered any peers, we're just broadcasting
  // at this point. No changes.
  expect(broadcastMsg.changes).toBeFalsy();
  expect(broadcastMsg.clock).toEqual(getClock(hubDoc));

  /**
   * Unknown peer picks up Hub's broadcast,
   * sends hub it's clock.
   */

  const peerSendMsg = jest.fn();
  const peer = new Peer(peerSendMsg);
  const peerDoc = init<any>();
  peer.applyMessage(broadcastMsg, peerDoc);

  // And then the peer will send the hub it's clock
  // to request changes.
  expect(peerSendMsg.mock.calls.length).toBe(1);
  const [sendMsg] = peerSendMsg.mock.calls[0] as [Message];

  // Because we're a brand new peer, we shouldn't expect any
  // changes; though that could be the case in a diff example.
  expect(sendMsg.changes).toBeFalsy();
  expect(sendMsg.clock).toEqual(getClock(peerDoc));

  /**
   * Hub registers new peer, sends back changes.
   */

  // When the hub gets the message, it sends changes
  // back to the peer.
  hub.applyMessage("my-peer", sendMsg, hubDoc);

  // We've sent a change
  expect(hubSendMsg.mock.calls.length).toBe(1);
  const [peerId, changeMsg] = hubSendMsg.mock.calls[0];
  expect(peerId).toBe("my-peer");
  expect(changeMsg.changes).toBeTruthy();

  // We've updated our peers with this new peer
  expect(hub._theirClocks.get("my-peer")).toBeTruthy();

  /**
   * Peer receives changes
   */
  const newDoc = peer.applyMessage(changeMsg, peerDoc);

  // We've received the change!
  expect(newDoc.name).toBe("from-hub");

  // We don't send anything back, since we're all good now.
  expect(peerSendMsg.mock.calls.length).toBe(1); // we already sent one
});

test("we broadcast documents to peers we know about", () => {
  const hubSendMsg = jest.fn();
  const hubBroadcastMsg = jest.fn();
  const hub = new Hub(hubSendMsg, hubBroadcastMsg);

  // We do this to register a peer
  hub.applyMessage("our-peer", { clock: Map() }, init<any>());
  expect(hub._theirClocks.get("our-peer")).toBeTruthy(); // sanity check

  // Then broadcast a doc
  hub.notify(from({ name: "hi" }));

  // We should call this peer
  expect(hubSendMsg.mock.calls.length).toBe(1);
  const [peer, msg] = hubSendMsg.mock.calls[0];
  expect(peer).toEqual("our-peer");
  expect(msg.changes).toBeTruthy();
});

test("the peer and the hub both make changes and come to agreement", () => {
  const peerSendMsgFn = jest.fn();
  const peer = new Peer(peerSendMsgFn);

  // First, we send a doc to the hub from the peer
  // and they agree
  let peerDoc = from({ title: "my title" });
  peer.notify(peerDoc);
  const [msg] = peerSendMsgFn.mock.calls[0];

  const hubSendMsg = jest.fn();
  const hubBroadcastMsg = jest.fn();
  const hub = new Hub(hubSendMsg, hubBroadcastMsg);
  let hubDoc = from<any>({ body: "my body" });

  // hub gets message from peer which applies title
  hubDoc = hub.applyMessage("our-peer", msg, hubDoc);
  expect(hubDoc.title).toBe("my title");

  // hub tries to tell the peer about it's changes as well
  expect(hubSendMsg.mock.calls.length).toBe(1);
  const [peerId, hubMsg] = hubSendMsg.mock.calls[0];
  expect(peerId).toBe("our-peer");
  expect(hubMsg.changes).toBeTruthy();

  // meanwhile, the peer makes a change
  peerDoc = change(peerDoc, d => {
    d.title = "revised title";
  });

  // THEN receives the change from the hub
  peerDoc = peer.applyMessage(hubMsg, peerDoc);
  expect(peerDoc).toEqual({
    title: "revised title",
    body: "my body"
  });

  // The peer will then try to update the hub about it's changes.
  expect(peerSendMsgFn.mock.calls.length).toBe(2);
  const [lastMsg] = peerSendMsgFn.mock.calls[1];
  expect(lastMsg.changes).toBeTruthy();

  // Finally, the hub can apply the peer's in-between changes
  hubDoc = hub.applyMessage("our-peer", lastMsg, hubDoc);
  expect(hubDoc).toEqual(peerDoc);

  // And shouldn't send anything back.
  expect(hubSendMsg.mock.calls.length).toBe(1); // we've already sent one
});

test("we don't have race conditions if we have a slow db write", () => {
  const sendMsg = jest.fn();
  const broadcastMsg = jest.fn();
  const oldDoc = from({ count: 0 });
  const hub = new Hub(sendMsg, broadcastMsg);
  const georgesNewDoc = change(oldDoc, doc => {
    doc.count += 1;
  });

  // 1. We get a new change from peer "george"
  hub.applyMessage(
    "george",
    {
      clock: getClock(georgesNewDoc),
      changes: getChanges(oldDoc, georgesNewDoc)
    },
    oldDoc
  );
  expect(broadcastMsg.mock.calls.length).toBe(1);

  // 2. We start a long-running write, like a DB write.

  // just pretend there's code here that does it,
  // I believe in your powers of imagination

  // 3. We get a message from another peer, like "bob"
  // that should be outdated, since we just applied george's
  // changes.
  const newDoc = hub.applyMessage(
    "bob",
    {
      clock: getClock(oldDoc)
    },
    // We haven't finished our database write yet, so
    // from this perspective, we're still assuming this might
    // be exciting new changes we should get.
    oldDoc
  );
  // expect(newDoc).toBeFalsy(); // TODO: maybe make these return nothing?

  // 4. Now, we'd expect that we should send Bob a message
  // containing our new updated clock that George gave us,
  // even though the database write might not be finished.
  expect(broadcastMsg.mock.calls.length).toBe(2);
});
