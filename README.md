# ManyMerge

ManyMerge is a client for [Automerge](https://github.com/automerge/automerge) that, unlike the existing [Automerge.Connection](https://github.com/automerge/automerge/blob/master/src/connection.js), sends and receives changes from _multiple peers_ at once.

ManyMerge works well as a hub for multiple peers using `Automerge.Connection`. 

```
┌───────────────┐  ┌───────────────┐  ┌───────────────┐
│               │  │               │  │               │
│  Connection   ◀──▶   ManyMerge   ◀──▶  Connection   │
│               │  │               │  │               │
└───────────────┘  └───────▲───────┘  └───────────────┘
                           │                           
                           │                           
                   ┌───────▼───────┐                   
                   │               │                   
                   │  Connection   │                   
                   │               │                   
                   └───────────────┘                   
```

ManyMerge maintains a single clock with it's knowledge of documents and then one clock for each peer it knows about. When one peer updates the clock, ManyMerge will attempt to update all the peers it knows about.  

## Install

```
npm install --save manymerge
```

## Usage

### Setting up storage

Unlike Automerge.Connection, ManyMerge isn't tied to a `DocSet`. Instead, it asks you implement an `AsyncDocStore` that satisfies the interface:

```ts 
interface AsyncDocStore {
  getDoc<T>(docId: string): Promise<Doc<T>>;
  setDoc<T>(docId: string, doc: Doc<T>): Promise<Doc<T>>;
}
```

An in-memory example of such a store might be:
```ts
import { AsyncDocStore } from "automerge-simple-connection";

class MyDocStore extends AsyncDocStore {
  _docs = {};

  async getDoc(docId) {
    return _docs[docId];
  }

  async setDoc(docId, doc) {
    _docs[docId] = doc;
    return doc;
  }
}
```

**Note that ManyMerge does not use handlers.** Unlike `Connection`, calling `setDoc` does not automatically send messages to peers. 

### Setting up transit

Like Automerge.Connection, ManyMerge asks you to provide a function that sends messages over the network to a particular peer.

```ts
function sendMsg(peerId, msg) {
  yourNetwork.emit(peerId, JSON.stringify(msg));
}
```

### Creating a connection 

```ts
import { Connection } from 'manymerge'

const conn = new Connection(new MyDocStore(), sendMsg)
```

### Adding peers 

Before you can send or receive messages from peers, you _must_ manually `addPeer`. ManyMerge will throw an error if it's given a message from a non-peer. 

```ts
conn.addPeer("my-unique-peer-id")
```

### Receiving messages 
When your network gets a message from a peer, it should call the `receiveMsg` function like so:

```ts
yourNetwork.onSomeMessge((peerId, msg) => {
  conn.receiveMsg(peerId, msg)
})
```


### Broadcasting changes (optional)
Typically ManyMerge is used as a hub where that listens to messages and automatically syncs it's documents with it's peers. So if you're calling `receiveMsg`, you're already broadcasting changes whenever the internals of ManyMerge determine appropriate. 

But, if your ManyMerge instance itself changes the document, you can manually broadcast changes with `docChanged` like so:

```ts
conn.docChanged("some-doc-id", myDoc)
```
