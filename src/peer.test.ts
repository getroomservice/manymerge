import { change, init } from 'automerge';
import { Peer } from './peer';

test('our protocol will send and receive changes', () => {
  const clientSendMsg = jest.fn();
  const client = new Peer(clientSendMsg);

  // send an update
  client.notify(
    change(init<any>(), doc => {
      doc.name = 'my-doc';
    })
  );

  // We just sent this message
  const [clientMsg] = clientSendMsg.mock.calls[0];
  expect(clientMsg.changes.length).toBe(1);

  // We'll pretend to be a server
  // that received this message
  const serverSendMsg = jest.fn();
  const server = new Peer(serverSendMsg);
  server.applyMessage(clientMsg, init());

  // We don't need to send anything back in this case.
  expect(serverSendMsg.mock.calls.length).toBe(0);
});
