# ManyMerge

ManyMerge is a protocol for synchronizing Automerge documents. It's a replacement for `Automerge.Connection` that supports many-to-many and one-to-many relationships.

## Install

```
npm install --save manymerge
```

## Usage

Manymerge comes with two different types of connections that work together: **Peers** and **Hubs**.

### Peers

A Peer is **a 1-1 relationship** that can talk to a Hub or another Peer. Your peer will need to create a `sendMsg` function that takes a ManyMerge `Message` and sends it to the network. Typically that looks like this:

```ts
import { Peer } from "manymerge";

function sendMsg(msg) {
  MyNetwork.emit("to-server", msg);
}

const peer = new Peer(sendMsg);
```

When a peer wants to alert it's counterpart that it changed a document, it should call the `notify` function:

```ts
import Automerge from "automerge";

let myDoc = Automerge.from({ title: "cool doc" });
peer.notify(myDoc);
```

When a peer gets a message from the network, it should run `applyMessage`, which will return a new document
with any changes applied.

```ts
let myDoc = Automerge.from({ title: "cool doc" });

MyNetwork.on("from-server", msg => {
  myDoc = peer.applyMessage(msg, myDoc);
});
```

### Hubs

Hubs are a **many-to-many (or 1-to-many) relationship** that can talk to many Peers or other Hubs. Unlike Peers, Hubs need the ability
to "broadcast" a message to everyone on the network (or at least as many people as possible).To save time, Hubs will also cache Peer's they've seen recently and directly communicate directly with them.

To set this up, create `broadcastMsg` and `sendMsgTo` functions:

```ts
import { Hub } from "manymerge";

function sendMsgTo(peerId, msg) {
  MyNetwork.to(peerId).emit("msg", msg);
}

function broadcastMsg(msg) {
  MyNetwork.on("some-channel").emit("msg", msg);
}

const hub = new Hub(sendMsgTo, broadcastMsg);
```

Then, hub works like a peer, it can notify others of documents:

```ts
// Tell folks about our doc
hub.notify(myDoc);
```

Unlike the peer, when it gets a message, it'll need to know the unique id of the connection sending it. It will use this later in the `sendMsgTo` function.

```ts
MyNetwork.on("msg", (from, msg) => {
  myDoc = hub.applyMessage(from, msg, myDoc);
});
```


## Differences from Automerge.Connection

**ManyMerge does not use DocSet.** Unlike Automerge.Connection, ManyMerge does not know how you store your documents. If it did, all the hubs would have to store many, many documents of many different peers. 

**ManyMerge does not multiplex many document updates over the same network.** If you want, you can implement this yourself by just batching messages in your `sendMsg` function. 
