/**
 * This file tests private functions individually and
 * breaks the rules of typescript in the interest
 * of simplicity.
 */

import { from } from "automerge";
import { fromJS } from "immutable";
import { Connection } from ".";
import { mockDocStore } from "./testUtil";

test("sendMsg assembles a message and calles the user provided fn", () => {
  const sendMsg = jest.fn();
  const conn = new Connection({
    store: mockDocStore({}),
    sendMsg
  });

  /** Without changes */
  const expectedDocId = "my-doc-id";
  const expectedClock = {
    "some-id": 1
  };

  // @ts-ignore private
  conn.sendMsg("s", conn.createMsg(expectedDocId, fromJS(expectedClock)));
  expect(sendMsg.mock.calls[0][1]).toEqual({
    clock: expectedClock,
    docId: expectedDocId
  });

  /** With changes */
  const expectedChanges = [{ pretendTheseAre: "changes" }];

  // @ts-ignore private
  conn.sendMsg(
    "s",
    // @ts-ignore private
    conn.createMsg(expectedDocId, fromJS(expectedClock), expectedChanges)
  );
  expect(sendMsg.mock.calls[1][1]).toEqual({
    clock: expectedClock,
    docId: expectedDocId,
    changes: expectedChanges
  });
});

test("sendMsg assembles a message and calles the user provided fn", () => {
  const sendMsg = jest.fn();
  const conn = new Connection({
    store: mockDocStore({}),
    sendMsg
  });

  /** Without changes */
  const expectedDocId = "my-doc-id";
  const expectedClock = {
    "some-id": 1
  };

  // @ts-ignore private
  conn.sendMsg(
    "some-peer",
    // @ts-ignore private
    conn.createMsg(expectedDocId, fromJS(expectedClock))
  );
  expect(sendMsg.mock.calls[0][1]).toEqual({
    clock: expectedClock,
    docId: expectedDocId
  });

  /** With changes */
  const expectedChanges = [{ pretendTheseAre: "changes" }];

  // @ts-ignore private
  conn.sendMsg(
    "some-peer",
    // @ts-ignore private
    conn.createMsg(expectedDocId, fromJS(expectedClock), expectedChanges)
  );
  expect(sendMsg.mock.calls[1][1]).toEqual({
    clock: expectedClock,
    docId: expectedDocId,
    changes: expectedChanges
  });
});

test("addPeer adds something to _theirClockMaps", () => {
  const store = mockDocStore({
    alpha: from({ name: "alpha" })
  });

  const conn = new Connection({
    store,
    sendMsg: jest.fn()
  });

  conn.addPeer("my-peer-id");

  // @ts-ignore private
  const map = conn._theirClockMaps.get("my-peer-id");
  expect(map).toBeTruthy();
});

test("receiveMsg updates _theirClockMaps", async () => {
  const store = mockDocStore({
    alpha: from({ name: "alpha" })
  });

  const conn = new Connection({
    store,
    sendMsg: jest.fn()
  });

  conn.addPeer("my-peer-id");
  await conn.receiveMsg("my-peer-id", {
    // @ts-ignore it's a clock I swear
    clock: {
      "some-actor-id": 1
    },
    docId: "my-doc-id"
  });

  // @ts-ignore private
  const map = conn._theirClockMaps.get("my-peer-id");
  expect(map.get("my-doc-id").get("some-actor-id")).toBe(1);
});

test("maybeSyncDocWithPeer updates _theirClockMaps and _ourClockMap before we send the message", async () => {
  const sendMsg = jest.fn();
  const store = mockDocStore({
    alpha: from({ name: "alpha" })
  });
  const conn = new Connection({
    store,
    sendMsg
  });

  conn.addPeer("my-peer-id");

  // @ts-ignore private
  expect(conn._theirClockMaps.get("my-peer-id").size).toBe(0);

  // @ts-ignore private
  await conn.maybeSyncDocWithPeer("my-peer-id", "alpha");

  // @ts-ignore private
  expect(conn._theirClockMaps.get("my-peer-id").size).toBe(1);

  // @ts-ignore private
  expect(conn._ourClockMap.get("alpha").size).toBe(1);
});
