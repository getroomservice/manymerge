import { performance, PerformanceObserver } from 'perf_hooks';
import { Hub, Peer } from '../src';
import Automerge from 'automerge';
import { Subject } from 'rxjs';
import { bufferTime, filter, map } from 'rxjs/operators';

class TestHub {
  peerlist: any;
  hub: any;
  hubDoc: any;
  hubMsgBufferInput: any;
  hubMsgBuffer: any;

  constructor(initState = {}) {
    const peerlist = new Map();
    const hub = new Hub(
      (peerId, msg) => {
        setTimeout(() => {
          peerlist.get(peerId)?.(msg);
        }, 0);
      },
      (msg: any) => {
        peerlist.forEach(cb => {
          setTimeout(() => {
            cb(msg);
          }, 0);
        });
      }
    );

    let hubDoc = Automerge.from(initState);

    hub.notify(hubDoc);

    this.peerlist = peerlist;
    this.hub = hub;
    this.hubDoc = hubDoc;

    this.hubMsgBufferInput = new Subject<any>();
    this.hubMsgBuffer = this.hubMsgBufferInput.pipe(
      bufferTime(0),
      filter((d: any) => d.length > 0)
    );

    this.hubMsgBuffer.subscribe((msgs: any) => {
      let doc = this.hub.applyMessageBuffered(msgs, this.hubDoc);
      if (doc) {
        this.hubDoc = doc;
      }
    });
  }

  addPeer(id: any, onNewDoc: (doc: any) => any) {
    const peerToHubInput = new Subject<any>();
    const peerToHubBuffer = peerToHubInput.pipe(
      bufferTime(0),
      filter(b => b.length > 0),
      map(msgs => {
        // take the latest clock
        const clock = msgs[msgs.length - 1].clock;
        let changes: any[] = [];
        msgs.forEach(msg => {
          if (msg.changes) {
            changes = changes.concat(msg.changes);
          }
        });
        return {
          clock,
          changes,
        };
      })
    );

    peerToHubBuffer.subscribe(msg => {
      this.hubMsgBufferInput.next({ peerId: id, msg: msg });
    });

    let peerDoc = Automerge.from<any>({});
    const peer = new Peer((msg: any) => {
      peerToHubInput.next(msg);
    });

    this.peerlist.set(id, (msg: any) => {
      let doc = peer.applyMessage(msg, peerDoc);
      if (doc) {
        peerDoc = doc;
        onNewDoc(peerDoc);
      }
    });

    peer.notify(peerDoc);

    return {
      change: (changeFn: (doc: any) => any) => {
        let doc = Automerge.change(peerDoc, changeFn);
        if (doc) {
          peerDoc = doc;
          peer.notify(peerDoc);
          onNewDoc(peerDoc);
        }
      },
    };
  }
}

const benchmarkNInserts = async (n: number) => {
  let testId = `test_${Math.random()}`;
  const START_MARKER = `start_${testId}`;
  const END_MARKER = `end_${testId}`;
  let setResult: any;
  const result = new Promise(resolve => (setResult = resolve));

  const hub = new TestHub({});
  const peer1 = hub.addPeer('1', () => {});
  hub.addPeer('2', doc => {
    if (doc.i === n) {
      performance.mark(END_MARKER);
      setResult();
    }
  });

  performance.mark(START_MARKER);
  for (var i = 1; i <= n; i++) {
    peer1.change(doc => {
      doc.i = i;
    });
  }

  return await result.then(() => {
    performance.measure(`${n} inserts`, START_MARKER, END_MARKER);
  });
};

const benchmarkNPeersMInserts = async (n: number, m: number) => {
  m;
  let testId = `test_${Math.random()}`;
  const START_MARKER = `start_${testId}`;
  const END_MARKER = `end_${testId}`;
  let setResult: any;
  const result = new Promise(resolve => (setResult = resolve));

  const hub = new TestHub({});
  hub.addPeer('1', doc => {
    if (Object.keys(doc).length === n) {
      performance.mark(END_MARKER);
      setResult();
    }
  });

  const otherPeers = Array(n)
    .fill(0)
    .map((_, i) => {
      return hub.addPeer(`p${i}`, () => {});
    });

  performance.mark(START_MARKER);
  otherPeers.forEach((peer, i) => {
    peer.change(doc => {
      doc[`peer_${i}`] = i;
    });
  });

  return await result.then(() => {
    performance.measure(
      `${n} peers inserting ${m} times`,
      START_MARKER,
      END_MARKER
    );
  });
};

const benchmarkNHubsMInserts = async (n: number, m: number) => {
  m;
  let testId = `test_${Math.random()}`;
  const START_MARKER = `start_${testId}`;
  const END_MARKER = `end_${testId}`;
  let setResult: any;
  const result = new Promise(resolve => (setResult = resolve));

  let counter = 0;
  let peers = [];
  for (var i = 0; i < n; i++) {
    const hub = new TestHub({});
    hub.addPeer('1', doc => {
      if (doc.synced) {
        counter++;
        if (counter === n) {
          performance.mark(END_MARKER);
          setResult();
        }
      }
    });

    peers.push(hub.addPeer('2', () => {}));
  }

  performance.mark(START_MARKER);
  peers.forEach(peer => {
    peer.change(doc => {
      doc.synced = true;
    });
  });

  return await result.then(() => {
    performance.measure(
      `${n} hubs inserting ${m} times`,
      START_MARKER,
      END_MARKER
    );
  });
};

async function runBenchmarks() {
  const perfObserver = new PerformanceObserver(items => {
    items.getEntries().forEach(entry => {
      console.log(entry);
    });
  });

  perfObserver.observe({ entryTypes: ['measure'], buffered: true });

  // await benchmarkNInserts(1);

  // await benchmarkNInserts(10);

  // await benchmarkNInserts(100);

  // await benchmarkNInserts(500);

  // await benchmarkNInserts(1000);
  benchmarkNInserts;
  benchmarkNPeersMInserts;
  benchmarkNHubsMInserts;

  // await benchmarkNPeersMInserts(1, 1);
  // await benchmarkNPeersMInserts(10, 1);
  // await benchmarkNPeersMInserts(100, 1);
  // why is this one crapping out at a lot of peers for a single hub?
  // It seems to perform ok, but it takes forever for it to get changes back. Like we get double changes (I think because of clocks?). So 300 peers yields 600 change callbacks
  await benchmarkNPeersMInserts(300, 1);

  // await benchmarkNHubsMInserts(1, 1);
  // await benchmarkNHubsMInserts(10, 1);
  // await benchmarkNHubsMInserts(100, 1);
  // await benchmarkNHubsMInserts(500, 1);
  // await benchmarkNHubsMInserts(1000, 1);
}

runBenchmarks();
