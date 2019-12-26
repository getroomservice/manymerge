# ManyMerge

ManyMerge is yet another lightweight protocol for sending changes to an [Automerge](https://github.com/automerge/automerge) document over the network.

Unlike the [many](https://github.com/automerge/mpl) [other](https://github.com/automerge/hypermerge) [ways](https://github.com/sammccord/perge) to do this, ManyMerge isn't strongly coupled to any particular network stack or data layer. In other words, you can use REST, websockets, your homebrew peer to peer system or whatever you want.

And unlike the existing [Automerge.Connection](https://github.com/automerge/automerge/blob/master/src/connection.js) module, ManyMerge assumes you're broadcasting your changes to multiple clients and listening to broadcasts from multiple clients.

```ts
interface ManyMerge {
  receiveMsg(from: string, msg: Automerge.Message);
  sendMsg(from: string, msg: Automerge.Message);
}
```

## Honesty

ManyMerge assumes all messages are honest about who they're coming from. So, it gives the job of verifying the messages to the network that's transferring
