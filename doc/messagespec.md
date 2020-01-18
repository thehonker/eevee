## IPC Message Format

### Message from server connector to router/parser/filter
```javascript
message = {
  text: ['~echo', 'foo', 'bar', 'baz'],
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
ipc.emit('router:incoming', message);
```

### Message from the router/parser/filter to the module
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

### Message from 'echo' back to 'irc.wetfish'
```javascript
message = {
  text: ['foo', 'bar', 'baz'],
  formattedText: [ // Let's pretend that Weazzy sent 'foo bar baz' in these colors
    ["foo ", {color: "red",}], // So we'll give it back the same way
    ["bar ", {color: "blue"}],
    ["baz ", {style: "green"}],
  ],
  to: {
    server: 'irc.wetfish',
    channel: '#botspam',
  },
}
ipc.emit('irc.wetfish:outgoing');
```
