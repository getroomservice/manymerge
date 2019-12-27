import { from } from "automerge";
import { fromJS } from "immutable";
import { Connection } from ".";
import { mockDocStore } from "./testUtil";

test("docChange can call sendMsg with initalizing changes", async () => {
  const alpha = from({ name: "alpha" });
  const store = mockDocStore({
    alpha
  });
  const sendMsg = jest.fn();

  const conn = new Connection({
    store,
    sendMsg
  });
  conn.addPeer("my-peer");
  await conn.docChanged("alpha", alpha);
  const calls = sendMsg.mock.calls;

  // It calls send message
  expect(calls.length).toBe(1);

  const msg = calls[0][0];

  // Appears to be a legit message
  expect(Object.keys(msg)).toEqual(["docId", "clock", "changes"]);

  // is specifically for the "alpha" doc we created
  expect(msg.docId).toEqual("alpha");

  // We've initalized the doc with seq = 1 and our clock agrees.
  expect(msg.changes[0].seq).toBe(1);
  expect(Object.keys(msg.clock).length).toBe(1);
});

test("Receiving an empty clock with a doc id we know about will trigger this client to send changes describing the document", async () => {
  const store = mockDocStore({
    alpha: from({ name: "alice" })
  });
  const sendMsg = jest.fn();
  const conn = new Connection({
    store,
    sendMsg
  });
  conn.addPeer("my-peer");

  // We got a message saying "I would like to know about alpha"
  // but I have no clock info.
  await conn.receiveMsg("my-peer", {
    clock: fromJS({}),
    docId: "alpha"
  });

  // We'd expect sendMsg to be called at all
  const calls = sendMsg.mock.calls;
  expect(calls.length).toBe(1);

  const msg = calls[0][0];

  // We have some changes
  expect(msg.changes).toBeTruthy();
  expect(msg.changes.length).toBe(1);

  // That set "name" to "alice"
  const op = msg.changes[0].ops[0];
  expect(op.action).toBe("set");
  expect(op.key).toBe("name");
  expect(op.value).toBe("alice");
});
