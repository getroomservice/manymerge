/**
 * This file tests private functions individually and
 * breaks the rules of typescript in the interest
 * of simplicity.
 */

import { change, from, getChanges } from "automerge";
import { fromJS } from "immutable";
import { Connection } from ".";
import { mockDocStore } from "./testUtil";

test("sendMsg assembles a message and calles the user provided fn", () => {
  const sendMsg = jest.fn();
  const conn = new Connection(mockDocStore({}), sendMsg);

  /** Without changes */
  const expectedDocId = "my-doc-id";
  const expectedClock = {
    "some-id": 1
  };

  // @ts-ignore private
  conn.sendMsg(expectedDocId, fromJS(expectedClock));
  expect(sendMsg.mock.calls[0][0]).toEqual({
    clock: expectedClock,
    docId: expectedDocId
  });

  /** With changes */
  const expectedChanges = [{ pretendTheseAre: "changes" }];

  // @ts-ignore private
  conn.sendMsg(expectedDocId, fromJS(expectedClock), expectedChanges);
  expect(sendMsg.mock.calls[1][0]).toEqual({
    clock: expectedClock,
    docId: expectedDocId,
    changes: expectedChanges
  });
});

test("sendMsg assembles a message and calles the user provided fn", () => {
  const sendMsg = jest.fn();
  const conn = new Connection(mockDocStore({}), sendMsg);

  /** Without changes */
  const expectedDocId = "my-doc-id";
  const expectedClock = {
    "some-id": 1
  };

  // @ts-ignore private
  conn.sendMsg(expectedDocId, fromJS(expectedClock));
  expect(sendMsg.mock.calls[0][0]).toEqual({
    clock: expectedClock,
    docId: expectedDocId
  });

  /** With changes */
  const expectedChanges = [{ pretendTheseAre: "changes" }];

  // @ts-ignore private
  conn.sendMsg(expectedDocId, fromJS(expectedClock), expectedChanges);
  expect(sendMsg.mock.calls[1][0]).toEqual({
    clock: expectedClock,
    docId: expectedDocId,
    changes: expectedChanges
  });
});

test("applyChanges properly updates a doc and calls the docSet", async () => {
  const alpha = from({ name: "yay" });
  const store = mockDocStore({
    alpha
  });

  const conn = new Connection(store, jest.fn());

  // Make change
  const newAlpha = change(alpha, doc => {
    doc.name = "changed";
  });
  const changes = getChanges(alpha, newAlpha);

  // @ts-ignore private
  const actualDoc = await conn.applyChanges("alpha", changes);

  expect(actualDoc.name).toBe("changed");
  expect(store.setDoc.mock.calls).toEqual([
    [
      "alpha",
      {
        name: "changed"
      }
    ]
  ]);
});
