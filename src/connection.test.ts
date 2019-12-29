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

// Creates a scenario where given some changes to the docSet on the
// automerge side, we get the resulting messages sent back and forth
// between the clients and the state of the two clients.
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

    expect(msgs.length).toBe(4);

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

  it("automerge's ourClock should be the same as manymerge's theirClock", async () => {
    const { manyMergeConnection, automergeConnection, msgs } = await scenario(
      docSet => {
        docSet.setDoc("some-doc", from({ name: "hey" }));
      }
    );

    expect(msgs.length).toBe(4);

    // @ts-ignore
    expect(JSON.stringify(automergeConnection._ourClock)).toEqual(
      // @ts-ignore
      JSON.stringify(manyMergeConnection._theirClockMaps.get("my-peer"))
    );
  });
});

interface TestMessageWithPeer {
  to: "manymerge" | "automerge";
  peer?: string;
  msg: Message;
}

describe("with multiple peers", () => {
  it("should send messages to all peers", done => {
    const events = new Emitter();

    // Setup two automerge connections
    const {
      automergeConnection: alphaConn,
      docSet: alphaDocSet
    } = mockAutomergeConnectionWithDocSet(msg => {
      events.emit("to-manymerge", "alpha", JSON.stringify(msg));
    });
    const {
      automergeConnection: betaConn,
      docSet: betaDocSet
    } = mockAutomergeConnectionWithDocSet(msg => {
      events.emit("to-manymerge", "beta", JSON.stringify(msg));
    });

    // Setup the manymerge connection
    const sendMsgToAutomerge = (peer, msg) => {
      events.emit("to-automerge", peer, JSON.stringify(msg));
    };
    const store = mockDocStore({});
    const manyMerge = new ManyMergeConnection({
      store,
      sendMsg: sendMsgToAutomerge
    });
    const msgs: TestMessageWithPeer[] = [];
    events.on("to-manymerge", async (peer, msg) => {
      msgs.push({
        to: "manymerge",
        msg: JSON.parse(msg)
      });
      await manyMerge.receiveMsg(peer, JSON.parse(msg));
    });

    // Connect manymerge to it's two peers
    manyMerge.addPeer("alpha");
    manyMerge.addPeer("beta");
    events.on("to-automerge", async (peer, msg) => {
      msgs.push({
        to: "automerge",
        peer,
        msg: JSON.parse(msg)
      });

      if (peer === "alpha") {
        alphaConn.receiveMsg(JSON.parse(msg));
      } else if (peer === "beta") {
        betaConn.receiveMsg(JSON.parse(msg));
      } else {
        throw new Error("Received unexpected peer, this test is probs broken");
      }
    });

    // Test to see if alpha's changes get populated to beta via manymerge
    alphaDocSet.setDoc("our-doc", from({ name: "cool-doc" }));

    setTimeout(() => {
      console.log(msgs);
      done();
    }, 10);
  });
});
