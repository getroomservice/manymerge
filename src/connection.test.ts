import {
  Connection as AutomergeConnection,
  DocSet,
  from,
  Message
} from "automerge";
import * as Emitter from "events";
import { Connection as ManyMergeConnection } from "./index";
import { mockDocStore } from "./testUtil";

function mockAutomergeConnectionWithDocSet(onSend: (msg: Message) => void) {
  const docSet = new DocSet();
  const conn = new AutomergeConnection(docSet, onSend);
  conn.open();

  return { automergeConnection: conn, docSet };
}

interface TestMessage {
  to: "manymerge" | "automerge";
  msg: Message;
}

async function scenario(
  cb: (docSet: DocSet<any>) => any
): Promise<{
  msgs: TestMessage[];
  automergeConnection: AutomergeConnection<any>;
  manyMergeConnection: ManyMergeConnection;
}> {
  const events = new Emitter();
  const sendMsgToManyMerge = msg => {
    events.emit("to-manymerge", JSON.stringify(msg));
  };
  const sendMsgToAutomerge = (peer, msg) => {
    events.emit("to-automerge", JSON.stringify(msg));
  };
  const { automergeConnection, docSet } = mockAutomergeConnectionWithDocSet(
    sendMsgToManyMerge
  );
  const store = mockDocStore({});
  const manyMerge = new ManyMergeConnection({
    store,
    sendMsg: sendMsgToAutomerge
  });
  manyMerge.addPeer("my-peer");

  const msgs: TestMessage[] = [];

  events.on("to-manymerge", async msg => {
    msgs.push({
      to: "manymerge",
      msg: JSON.parse(msg)
    });
    await manyMerge.receiveMsg("my-peer", JSON.parse(msg));
  });
  events.on("to-automerge", async msg => {
    msgs.push({
      to: "automerge",
      msg: JSON.parse(msg)
    });
    automergeConnection.receiveMsg(JSON.parse(msg));
  });

  cb(docSet);

  return new Promise(resolve => {
    setTimeout(() => {
      resolve({
        msgs,
        automergeConnection,
        manyMergeConnection: manyMerge
      });
    }, 10);
  });
}

/**
 * Test it's interoperable with connection
 */

describe("with connection", () => {
  it("uses Connection as we'd expect", () => {
    const sendMsg = jest.fn();
    const docSet = new DocSet();
    const conn = new AutomergeConnection(docSet, sendMsg);
    conn.open();
    docSet.setDoc("my-doc", from({ name: "alpha" }));

    expect(sendMsg.mock.calls.length).toBe(1);
  });

  it("can send ManyMerge a brand new document", async () => {
    const { msgs } = await scenario(docSet => {
      docSet.setDoc("some-doc", from({ name: "hey" }));
    });

    expect(msgs.length).toBe(3);

    // Automerge tells ManyMerge about it's new document
    let msg = msgs[0];
    expect(msg.to).toBe("manymerge");
    expect(msg.msg.changes).toBeFalsy(); // it does not send changes across
    expect(msg.msg.clock).toBeTruthy(); // it should send a clock
    expect(msg.msg.docId).toBe("some-doc"); // it should be the doc we changed

    // ManyMerge hasn't heard of this document, so it requests changes
    // by sending an empty vector map.
    msg = msgs[1];
    expect(msg.to).toBe("automerge");
    expect(msg.msg.clock).toEqual({});
    expect(msg.msg.docId).toBe("some-doc");

    // Automerge responds by sending manymerge a series of changes
    msg = msgs[2];
    expect(msg.to).toBe("manymerge");
    expect(msg.msg.changes).toBeTruthy();
    expect(msg.msg.changes[0].seq).toBe(1);
  });

  it("automerge's clock should be the same as manymerge's clock", async () => {
    const { manyMergeConnection, automergeConnection } = await scenario(
      docSet => {
        docSet.setDoc("some-doc", from({ name: "hey" }));
      }
    );

    // @ts-ignore
    expect(automergeConnection._ourClock).toEqual(
      // @ts-ignore
      manyMergeConnection._ourClockMap
    );
  });
});
