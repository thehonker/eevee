# IPC Message Format

## Message from server connector to router/parser/filter

Connector takes the incoming message and pulls this info from it

```javascript
message = {
  text: ['~echo', 'foo', 'bar', 'baz'],
  formattedText: [ // Let's pretend that Weazzy sent 'foo bar baz' in these colors
    ['~echo ', {plain: true,}],
    ['foo ', {fgColor: 'red',}],
    ['bar ', {fgColor: 'blue', bgColor: 'yellow'}],
    ['baz ', {style: 'bold', fgColor: 'green'}],
  ],
  from: {
    module:     'irc.wetfish',  // Our module ident
    platform:   'irc',          // Matrix, Discord, etc. Allows modules to apply platform-specific goodies
    server:     'irc.wetfish',  // Server ident as defined in config - doesn't necessarily match module ident
    channel:    '#botspam',     // # for channels, @ for pm's
    nick:       'Weazzy',       // User's display name
    ident:      'Weazzy@lu.dicro.us', // Full ident
  },
  raw: {}, // Raw event as delivered by the connector library
}
ipc.emit('rpf:incoming', message);
```

## Message from the router/parser/filter to the module

RPF checks to see if the message has an accepted:

```text
prefix
server
channel
user
command
```

It then passes it on to the module that registered that command.

```javascript
message = {
  command: 'echo',
  args: ['foo', 'bar', 'baz'],
  text: ['~echo', 'foo', 'bar', 'baz'],
  from: {
    module:     'irc.wetfish',
    platform:   'irc',
    server:     'irc.wetfish',
    channel:    '#botspam',
    nick:       'Weazzy',
    ident:      'Weazzy@lu.dicro.us',
  },
  raw: {},
}
ipc.emit('echo:command', message);
```

## Message from 'echo' back to 'irc.wetfish'

The module does its thing, in this case the `echo` module just returns back what it heard.

```javascript
message = {
  text: ['foo', 'bar', 'baz'],
  formattedText: [ // Let's pretend that Weazzy sent 'foo bar baz' in these colors
    ['foo ', {fgColor: 'red',}], // So we'll give it back the same way
    ['bar ', {fgColor: 'blue', bgColor: 'yellow'}],
    ['baz ', {style: 'bold', fgColor: 'green'}],
  ],
  to: {
    server: 'irc.wetfish',
    channel: '#botspam',
  },
}
ipc.emit('irc.wetfish:outgoing');
```

## Message from 'admin' to 'eevee-pm'

Assume a bot admin said this command: `~restart echo`

RPF would do the thing and pass the command to the `admin` module.

```javascript
message = {
  action: 'restart',
  target: 'echo',
  force: 'false',
  notify: {
    server: 'irc.wetfish',
    channel: '#botspam',
    user: 'Weazzy'
  },
}
ipc.emit('eevee-pm:restart');
```

We keep the admin checks in their own module instead of r/p/f so we can reload the admin code without restarting the r/p/f.
